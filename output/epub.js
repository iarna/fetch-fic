'use strict'
const fs = require('fs')

const Streampub = require('streampub')
const TOML = require('@iarna/toml')

const filenameize = use('filenameize')
const html = use('html-template-tag')
const Output = use('output')
const pump = use('pump')

class OutputEpub extends Output {
  from (fic) {
    return super.from(fic).to(filenameize(fic.title) + '.epub')
  }

  chapterExt () {
    return '.xhtml'
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
    if (chapter.type === 'image') {
      return Streampub.newFile(chapter.filename, chapter.content)
    }
    if (chapter.type === 'cover') {
      return Streampub.newCoverImage(chapter.content)
    }
    const index = chapter.order != null && (1 + chapter.order)
    const name = chapter.name
    const filename = this.chapterFilename(chapter)
    const toSanitize = '<html xmlns:epub="http://www.idpf.org/2007/ops">\n' +
      (name ? html`<head><title>${name}</title></head>` : '') +
      '<section epub:type="chapter">' + chapter.content + '</section>\n' +
      '</html>\n'
    return Streampub.newChapter(name, this.prepareHtml(toSanitize), 100 + index, filename)
  }

  prepareHtml (html) {
    // remove any doc-wide stylesheet so we can do our styling.
    return super.prepareHtml(html.replace(/<style>[^>]+<[/]style>/, ''))
  }

  html (content) {
    return `<html xmlns:epub="http://www.idpf.org/2007/ops">\n${content}</html>\n`
  }

  htmlBody (body) {
    return `<body epub:type="cover titlepage">\n${body}</body>\n`
  }

  htmlTitle () {
    return html`<section epub:type="title"><h1 style="text-align: center;">${this.fic.title}</h1></section>` + '\n'
  }

  htmlByline () {
    if (!this.fic.author) return ''
    return `<h3 style="text-align: center;">by <span epub:type="credits">${this.htmlAuthor(this.fic.author, this.fic.authorUrl)}</span></h3>\n`
  }

  htmlCoverImage () {
    if (!this.coverName) return ''
    return `<p><img style="display: block; margin-left: auto; margin-right: auto;" src="images/cover.jpg"></p>\n`
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
