'use strict'
const Bluebird = require('bluebird')
const Transform = require('readable-stream').Transform
const sanitizeHtml = require('sanitize-html')
const commaNumber = require('comma-number')
const html = require('./html-template-tag.js')
const normalizeHtml = require('./normalize-html.js')
const outputFormats = require('./output-formats.js')

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

  sanitizeHtml (html) {
    return sanitizeHtml(normalizeHtml(html), this.fic.site.sanitizeHtmlConfig())
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
    return chapter.link
  }

  html (content) {
    return `<html>${content}</html>`
  }

  htmlHead (header) {
    return `<head>${header}</head>`
  }

  htmlHeaderTitle () {
    return `<title>${this.fic.title}</title>`
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
</style>`
  }

  htmlBody (body) {
    return `<body>${body}</body>`
  }

  htmlTitle () {
    return html`<h1 style="text-align: center;">${this.fic.title}</h1>`
  }

  htmlByline () {
    if (!this.fic.author) return ''
    return `<h3 style="text-align: center;">by ${this.htmlAuthor(this.fic.author, this.fic.authorUrl)}</h3>`
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
    return `<table>${content}</table>`
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
    return `<tr><th>${key}</th><td>${value}</td></tr>`
  }

  htmlDescription () {
    if (!this.fic.description) return ''
    return `<p>${this.fic.description}</p>`
  }

  htmlChapterList (list) {
    return `<ol style="margin-left: 3em;">${list}</ol>`
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
    return `<li>${item}</li>`
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
}
Output.registered = {}

module.exports = Output

for (let output of outputFormats) {
  Output.register(output, require(`./output-${output}.js`))
}
