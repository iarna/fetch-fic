'use strict'
const moment = require('moment')

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
    const sanitizeHtml = require('sanitize-html')
    const normalizeHtml = use('normalize-html')
    return sanitizeHtml(normalizeHtml(this.replaceLinks(html)), this.fic.site.sanitizeHtmlConfig()).replace(/\n\n+\n/g, '\n\n')
  }

  transform () {
    const fun = require('funstream')
    return fun(stream => stream
      .flatMap(async chapter => this.transformChapter(chapter))
      .filter(res => res != null)
    )
  }

  titlePageHTML () {
    const normalizeHtml = use('normalize-html')
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
    const normalizeHtml = use('normalize-html')
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
    const ch = Object.create(chapter)
    if (!ch.outputType) ch.outputType = 'chapter'
    return this.chapterFilename(ch)
  }

  html (content) {
    return `<!doctype html><html>\n${content}</html>\n`
  }

  htmlHead (header) {
    return `<head>\n<meta charset="utf-8"/>\n${header}</head>\n`
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
    const html = use('html-template-tag')
    return html`<h1 style="text-align: center;">${this.fic.title}</h1>` + '\n'
  }

  htmlByline () {
    if (!this.fic.author) return ''
    return `<h3 style="text-align: center;">by ${this.htmlAuthor(this.fic.author, this.fic.authorUrl)}</h3>\n`
  }

  htmlAuthor (author, authorUrl) {
    if (!author) return ''
    const html = use('html-template-tag')
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
      const html = use('html-template-tag')
      content += this.htmlSummaryRow('Source',
        html`<a href="${this.fic.link}">${[this.wrappableLink(this.fic.link)]}</a>`)
    }
    if (this.fic.created) content += this.htmlSummaryRow('Published', this.fic.created)
    if (this.fic.modified) content += this.htmlSummaryRow('Updated', this.fic.modified)
    if (this.fic.tags && this.fic.tags.length) {
      const html = use('html-template-tag')
      content += this.htmlSummaryRow('Tags', html`<em>${this.fic.tags.join(', ')}</em>`)
    }
    if (this.fic.words) {
      const commaNumber = require('comma-number')
      content += this.htmlSummaryRow('Words', commaNumber(this.fic.words))
    }
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
    const html = use('html-template-tag')
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
      const commaNumber = require('comma-number')
      content += ` <small>[${commaNumber(chapter.words)}&nbsp;words]</small>`
    }
    let date = chapter.modified || chapter.created
    if (date) {
      content += ` <small>${moment(date).format('YYYY-MM-DD')}</small>`
    }
    return content
  }
  chapterExt () {
    return ''
  }
  chapterFilename (chapter) {
    const name = chapter.name || ''
    if (chapter.outputType === 'chapter') {
      const index = 1 + chapter.order
      const filename = `chapter-${index}${name ? ' ' + name : ''}`
      const filenameize = use('filenameize')
      return filenameize(filename) + this.chapterExt()
    } else if (chapter.outputType === 'external') {
      const index = chapter.num || chapter.order
      const filename = `external-${index}`
      const filenameize = use('filenameize')
      return filenameize(filename) + this.chapterExt()
    } else if (chapter.outputType === 'image') {
      return chapter.filename
    } else if (chapter.outputType === 'cover') {
      return
    } else {
      throw new Error('Unknown chapter filename type: ' + chapter.outputType)
    }
  }
  replaceLinks (content) {
    return content.replace(/_LINK_(\w+)#LINK#(\d+)#LINK#(.*?)_LINK_/g,
      (_, outputType, order, name) => this.chapterFilename({outputType, order: Number(order), name: name.replace(/&lt;/g, '<').replace(/&amp;/g, '&')}))
  }
}
Output.registered = {}

module.exports = Output

const outputFormats = use('output-formats')
for (let output of outputFormats) {
  Output.register(output, require(`./output/${output}`))
}
