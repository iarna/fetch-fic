'use strict'
const fs = require('fs')

const Streampub = require('streampub')
const TOML = require('@iarna/toml')
const pumpCB = require('pump')

const chapterFilename = use('chapter-filename')
const filenameize = use('filenameize')
const html = use('html-template-tag')
const Output = use('output')
const promisify = use('promisify')

const pump = promisify(pumpCB)

class OutputEpub extends Output {
  from (fic) {
    return super.from(fic).to(filenameize(this.fic.title) + '.epub')
  }
  write () {
    const epub = new Streampub({
      id: this.fic.id,
      title: this.fic.title,
      author: this.fic.author,
      authorUrl: this.fic.authorUrl,
      description: this.fic.description,
      source: this.fic.link,
      subject: this.fic.tags && this.fic.tags.length && this.fic.tags.join(','),
      publisher: this.fic.publisher,
      published: this.fic.started || this.fic.created,
      modified: this.fic.modified,
      numberTOC: this.fic.numberTOC
    })

    epub.write({
      id: 'fic',
      content: Buffer.from(TOML.stringify(this.fic)),
      fileName: 'meta.fic.toml',
      mime: 'text/x-toml'
    })
    epub.write(Streampub.newChapter('Title Page', this.titlePageHTML(), 0, 'top.xhtml'))
    if (this.fic.includeTOC) {
      epub.write(Streampub.newChapter('Table of Contents', this.tableOfContentsHTML(), 1, 'toc.xhtml'))
    }
    const output = fs.createWriteStream(this.outname)
    return pump(
      this.fic,
      this.transform(),
      epub,
      output).then(() => this.outname)
  }

  transformChapter (chapter) {
    if (chapter.image) {
      return Streampub.newFile(chapter.filename, chapter.content)
    }
    if (chapter.cover) {
      return Streampub.newCoverImage(chapter.content)
    }
    const index = chapter.order != null && (1 + chapter.order)
    const name = chapter.name
    const filename = chapterFilename(chapter)
    const toSanitize = '<html xmlns:epub="http://www.idpf.org/2007/ops">' +
      (name ? html`<title>${name}</title></head>` : '') +
      '<section epub:type="chapter">' + chapter.content + '</section>' +
      '</html>'
    return Streampub.newChapter(name, this.sanitizeHtml(toSanitize), 100 + index, filename)
  }

  html (content) {
    return `<html xmlns:epub="http://www.idpf.org/2007/ops">${content}</html>`
  }

  htmlBody (body) {
    return `<body epub:type="cover titlepage">${body}</body>`
  }

  htmlTitle () {
    return html`<section epub:type="title"><h1 style="text-align: center;">${this.fic.title}</h1></section>`
  }

  htmlByline () {
    if (!this.fic.author) return ''
    return `<h3 style="text-align: center;">by <span epub:type="credits">${this.htmlAuthor(this.fic.author, this.fic.authorUrl)}</span></h3>`
  }

  htmlCoverImage () {
    if (!this.coverName) return ''
    return `<p><img style="display: block; margin-left: auto; margin-right: auto;" src="images/cover.jpg"></p>`
  }

  htmlSummaryRow (key, value) {
    if (key === 'Tags') {
      return super.htmlSummaryRow(key, `<section epub:type="keywords">${value}`)
    } else {
      return super.htmlSummaryRow(key, value)
    }
  }

  htmlDescription () {
    if (!this.fic.description) return ''
    return `<section epub:type="abstract">${super.htmlDescription()}</section>`
  }
}

OutputEpub.aliases = []
module.exports = OutputEpub
