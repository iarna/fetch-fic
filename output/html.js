'use strict'
const fs = require('fs')
const stream = require('stream')

const identifyBuffer = require('buffer-signature').identify
const identifyStream = require('buffer-signature').identifyStream
const Bluebird = require('bluebird')
const mkdirpCB = require('mkdirp')
const path = require('path')
const pumpCB = require('pump')

const filenameize = use('filenameize')
const Output = use('output')
const promisify = use('promisify')

const mkdirp = promisify(mkdirpCB)
const writeFile = promisify(fs.writeFile)
const rename = promisify(fs.rename)
const pump = promisify(pumpCB)

class OutputHTML extends Output {
  from (fic) {
    return super.from(fic).to(filenameize(this.fic.title) + '.html')
  }

  write () {
    return mkdirp(this.outname)
      .then(() => pump(this.fic, this.transform()))
      .then(() => this.writeTitle())
      .then(() => this.writeIndex())
      .then(() => this.outname)
  }

  transformChapter (chapter) {
    const filename = path.join(this.outname, chapterFilename(chapter))
    if (chapter.image) {
      return writeFile(filename, chapter.content)
    } else if (chapter.cover) {
      if (chapter.content instanceof stream.Stream) {
        const tmpname = path.join(this.outname, 'cover-tmp')
        return new Bluebird((resolve, reject) => {
          chapter.content.pipe(identifyStream(info => {
            const ext = info.extensions.length ? '.' + info.extensions[0] : ''
            this.coverName = 'cover' + ext
          })).pipe(fs.createWriteStream(tmpname)).on('error', reject).on('finish', () => {
            resolve(rename(tmpname, path.join(this.outname, this.coverName)))
          })
        })
      } else {
        const info = identifyBuffer(chapter.content)
        const ext = info.extensions.length ? '.' + info.extensions[0] : ''
        this.coverName = 'cover' + ext
        return writeFile(path.join(this.outname, this.coverName), chapter.content)
      }
    } else {
      const content = this.sanitizeHtml(chapter.content)
      return writeFile(filename, content)
    }
  }

  writeTitle () {
    return writeFile(path.join(this.outname, 'title.html'), this.titlePageHTML())
  }

  writeIndex () {
    return writeFile(path.join(this.outname, 'index.html'), this.tableOfContentsHTML())
  }

  htmlCoverImage () {
    if (!this.coverName) return ''
    return `<p><img style="display: block; margin-left: auto; margin-right: auto;" src="${this.coverName}"></p>`
  }

  tableOfContentsContent () {
    return this.htmlTitle() +
      this.htmlByline() +
      this.htmlCoverImage() +
      this.htmlDescription() +
      this.htmlSummaryTable(this.htmlSummaryContent()) +
      this.htmlChapterList(this.htmlChapters())
  }
}

OutputHTML.aliases = ['HTML', 'xhtml']
module.exports = OutputHTML

function chapterFilename (chapter) {
  const index = 1 + chapter.order
  const name = chapter.name || 'Chapter ' + index
  return chapter.filename && chapter.filename.replace('xhtml', 'html') || filenameize('chapter-' + name) + '.html'
}
