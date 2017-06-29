'use strict'
const Output = use('output')

function letterCount (nn) {
  let base = Math.floor((nn-1) / 26)
  let num = (nn-1) % 26
  return (base > 0 ? String.fromCharCode(96 + base) : '') +
    String.fromCharCode(97 + num)
}

function upperLetterCount (nn) {
  let base = Math.floor((nn-1) / 26)
  let num = (nn-1) % 26
  return (base > 0 ? String.fromCharCode(64 + base) : '') +
    String.fromCharCode(65 + num)
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
    const statusRe = /^status:(stalled|abandoned|complete|one-shot)$/
    const fandomRe = /^fandom:/
    let tags = this.fic.tags && this.fic.tags.filter(tag => !fandomRe.test(tag) && !statusRe.test(tag))
    let modified = this.fic.modified || this.fic.started || this.fic.created
    let status = this.fic.tags && this.fic.tags.filter(tag => statusRe.test(tag))[0]
    if (status) status = status.replace(/^status:/, '')
    if (!status && modified) {
      const now = new Date()
      const oneMonth = 86400*30*1000
      const sixMonths = 86400*182*1000
      if (now - modified > sixMonths) {
        status = 'abandoned'
      } else if (now - modified > oneMonth) {
        status = 'stalled'
      } else {
        status = 'in-progress'
      }
    }
    let fandom = this.fic.tags && this.fic.tags.filter(tag => fandomRe.test(tag)).map(tag => tag.replace(fandomRe, ''))[0]
    const epub = new Streampub({
      id: this.fic.id,
      title: this.fic.title,
      author: this.fic.author,
      authorUrl: this.fic.authorUrl,
      description: this.fic.description,
      source: this.fic.link,
      subject: tags && tags.length && tags.join(','),
      publisher: this.fic.publisher,
      published: this.fic.started || this.fic.created || this.fic.modified,
      modified: modified,
      calibre: {
        'updated': modified && {'#value#': modified.toISOString().slice(0,10), 'datatype': 'text'},
        'words': {'#value#': this.fic.words, 'datatype': 'int'},
        'authorurl': {'#value#': this.fic.authorUrl, 'datatype': 'text'},
        'status': status && {'#value#': status, 'datatype': 'enumeration'},
        'fandom': fandom && {'#value#': fandom, 'datatype': 'text'}
      }
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
    if (chapter.outputType === 'image') {
      return Streampub.newFile(chapter.filename, chapter.content)
    }
    if (chapter.outputType === 'cover') {
      return Streampub.newCoverImage(chapter.content)
    }
    const index = chapter.order != null && (1 + chapter.order)
    let name = chapter.name
    if (name != null && this.fic.numberTOC) {
      if (index >= 9000) {
        name = upperLetterCount(index - 9000) + '. ' + name
      } else if (index >= 8000) {
        name = letterCount(index - 8000) + '. ' + name
      } else {
        name = String(index) + '. ' + name
        if (chapter.author && chapter.author != this.fic.author) {
          name += ` (${chapter.author})`
        }
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
