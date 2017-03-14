'use strict'
const Output = use('output')

function letterCount (nn) {
  let base = Math.floor((nn-1) / 26)
  let num = (nn-1) % 26
  return (base > 0 ? String.fromCharCode(96 + base) : '') +
    String.fromCharCode(97 + num)
}


class OutputEpub extends Output {
  from (fic) {
    const filenameize = use('filenameize')
    return super.from(fic).to(filenameize(fic.title) + '.epub')
  }

  chapterExt () {
    return '.xhtml'
  }

  write () {
    const Streampub = require('streampub')
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
    })

    let title = 'Title Page'
    if (this.fic.numberTOC) title = 'ⅰ. ' + title
    epub.write(Streampub.newChapter(title, this.titlePageHTML(), 0, 'top.xhtml'))
    if (this.fic.includeTOC) {
      let toctitle = 'Table of Contents'
      if (this.fic.numberTOC) toctitle = 'ⅱ. ' + toctitle
      epub.write(Streampub.newChapter(toctitle, this.tableOfContentsHTML(), 1, 'toc.xhtml'))
    }
    const WriteStreamAtomic = require('fs-write-stream-atomic')
    const output = new WriteStreamAtomic(this.outname)
    const pump = use('pump')
    return pump(
      this.fic,
      this.transform(),
      epub,
      output).then(() => this.outname)
  }

  transformChapter (chapter) {
    const Streampub = require('streampub')
    if (chapter.type === 'image') {
      return Streampub.newFile(chapter.filename, chapter.content)
    }
    if (chapter.type === 'cover') {
      return Streampub.newCoverImage(chapter.content)
    }
    const index = chapter.order != null && (1 + chapter.order)
    let name = chapter.name
    if (name != null && this.fic.numberTOC) {
      if (chapter.type === 'external') {
        name = letterCount(index - 9000) + '. ' + name
      } else {
        name = String(index) + '. ' + name
      }
    }
    const filename = this.chapterFilename(chapter)
    const html = use('html-template-tag')
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
    const html = use('html-template-tag')
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
