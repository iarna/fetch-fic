'use strict'
const Bluebird = require('bluebird')
const commaNumber = require('comma-number')
const Transform = require('readable-stream').Transform
const sanitizeHtml = require('sanitize-html')

const html = use('html-template-tag')
const normalizeHtml = use('normalize-html')
const outputFormats = use('output-formats')
const filenameize = use('filenameize')

class Output {
  static register (shortname, output) {
    this.registered[shortname] = output
    for (let alias of output.aliases) {
      this.registered[alias] = output
    }
  }

  static as (shortname) {
    return new this.registered[shortname]()
  }

  from (fic) {
    this.fic = fic
    return this
  }

  to (outname) {
    this.outname = outname
    return this
  }

  prepareHtml (html) {
    return sanitizeHtml(normalizeHtml(this.replaceLinks(html)), this.fic.site.sanitizeHtmlConfig()).replace(/\n\n+\n/g, '\n\n')
  }

  transform () {
    const out = this
    return new Transform({
      objectMode: true,
      transform: function (chapter, _, done) {
        return new Bluebird(resolve => resolve(out.transformChapter(chapter))).then(result => {
          if (result != null) this.push(result)
          done()
          return null
        }).catch(err => done(err))
      }
    })
  }

  titlePageHTML () {
    return normalizeHtml(this.html(this.htmlHead(this.titlePageHeader()) + this.htmlBody(this.titlePageContent())))
  }

  titlePageHeader () {
    return this.htmlHeaderTitle() + this.htmlStyle()
  }

  titlePageContent () {
    return this.htmlTitle() +
      this.htmlByline() +
      this.htmlCoverImage() +
      this.htmlSummaryTable(this.htmlSummaryContent()) +
      this.htmlDescription()
  }

  tableOfContentsHTML () {
    return normalizeHtml(this.html(this.htmlHead(this.tableOfContentsHeader()) + this.htmlBody(this.tableOfContentsContent())))
  }

  tableOfContentsHeader () {
    return this.htmlHeaderTitle() + this.htmlStyle()
  }

  tableOfContentsContent () {
    return this.htmlTitle() + this.htmlByline() + this.htmlChapterList(this.htmlChapters())
  }

  wrappableLink (link) {
    return link.replace(/(.....)/g, '$1<wbr>')
  }

  chapterLink (chapter) {
    return this.chapterFilename({type: 'chapter', order: chapter.order, name: chapter.name, filename: chapter.filename})
  }

  html (content) {
    return `<html>\n${content}</html>\n`
  }

  htmlHead (header) {
    return `<head>\n${header}</head>\n`
  }

  htmlHeaderTitle () {
    return `<title>${this.fic.title}</title>\n`
  }

  htmlStyle () {
    return `<style>
  table {
    border: 3px double #ccc;
    padding: 0.5em;
    margin-left: auto;
    margin-right: auto;
  }
  th {
    text-align: right;
    font-weight: bold;
    text-decoration: underline;
    white-space: nowrap;
    vertical-align: top;
  }
  th:after {
    content: ":";
  }
</style>\n`
  }

  htmlBody (body) {
    return `<body>\n${body}</body>\n`
  }

  htmlTitle () {
    return html`<h1 style="text-align: center;">${this.fic.title}</h1>` + '\n'
  }

  htmlByline () {
    if (!this.fic.author) return ''
    return `<h3 style="text-align: center;">by ${this.htmlAuthor(this.fic.author, this.fic.authorUrl)}</h3>\n`
  }

  htmlAuthor (author, authorUrl) {
    if (!author) return ''
    return authorUrl
      ? html`<a href="${authorUrl}">${author}</a>`
      : html(author)
  }

  htmlCoverImage () {
    return ''
  }

  htmlSummaryTable (content) {
    return `<table>\n${content}</table>\n`
  }

  htmlSummaryContent () {
    let content = ''
    if (this.fic.link) {
      content += this.htmlSummaryRow('Source',
        html`<a href="${this.fic.link}">${[this.wrappableLink(this.fic.link)]}</a>`)
    }
    if (this.fic.created) content += this.htmlSummaryRow('Published', this.fic.created)
    if (this.fic.modified) content += this.htmlSummaryRow('Updated', this.fic.modified)
    if (this.fic.tags && this.fic.tags.length) {
      content += this.htmlSummaryRow('Tags', html`<em>${this.fic.tags.join(', ')}</em>`)
    }
    if (this.fic.words) content += this.htmlSummaryRow('Words', commaNumber(this.fic.words))
    return content
  }

  htmlSummaryRow (key, value) {
    return `<tr><th>${key}</th><td>${value}</td></tr>\n`
  }

  htmlDescription () {
    if (!this.fic.description) return ''
    return `<p>${this.fic.description}</p>\n`
  }

  htmlChapterList (list) {
    return `<ol style="margin-left: 3em;">\n${list}</ol>\n`
  }

  htmlChapterLink (chapter) {
    return html`<a href="${this.chapterLink(chapter)}">${chapter.name}</a>`
  }

  htmlChapters () {
    let content = ''
    for (let chapter of this.fic.chapters) {
      content += this.htmlChapterListItem(this.htmlChapter(chapter))
    }
    return content
  }

  htmlChapterListItem (item) {
    return `  <li>${item}</li>\n`
  }

  htmlChapter (chapter) {
    let content = this.htmlChapterLink(chapter)
    const author = chapter.author || this.fic.author
    const authorUrl = chapter.authorUrl || this.fic.authorUrl
    if (author !== this.fic.author) {
      content += ` (${this.htmlAuthor(author, authorUrl)})`
    }
    if (chapter.description) {
      content += ' – ' + chapter.description
    }
    if (chapter.words) {
      content += ` [${commaNumber(chapter.words)} words]`
    }
    return content
  }
  chapterExt () {
    return ''
  }
  chapterFilename (chapter) {
    const name = chapter.linkName || chapter.name || ''
    if (chapter.type === 'chapter') {
      const index = 1 + chapter.order
      const filename = `chapter-${index}${name ? ' ' + name : ''}`
      return filenameize(filename) + this.chapterExt()
    } else if (chapter.type === 'external') {
      const index = chapter.num
      const filename = `external-${index}${name ? ' ' + name : ''}`
      return filenameize(filename) + this.chapterExt()
    } else if (chapter.type === 'image') {
      return chapter.filename
    } else if (chapter.type === 'cover') {
      return
    } else {
      throw new Error('Unknown chapter filename type: ' + chapter.type)
    }
  }
  replaceLinks (content) {
    return content.replace(/_LINK_(\w+)#LINK#(\d+)#LINK#(.*?)_LINK_/g,
      (_, type, order, name) => this.chapterFilename({type, order: Number(order), name: name.replace(/&lt;/g, '<').replace(/&amp;/g, '&')}))
  }
}
Output.registered = {}

module.exports = Output

for (let output of outputFormats) {
  Output.register(output, require(`./output/${output}`))
}
