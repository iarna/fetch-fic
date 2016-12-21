'use strict'
const stream = require('stream')
const Output = require('./output.js')
const fs = require('fs')
const promisify = require('./promisify')
const mkdirp = promisify(require('mkdirp'))
const writeFile = promisify(fs.writeFile)
const rename = promisify(fs.rename)
const Bluebird = require('bluebird')
const HTMLToFFNet = require('./html-to-ffnet.js')
const filenameize = require('./filenameize.js')
const path = require('path')
const pump = promisify(require('pump'))
const identifyBuffer = require('buffer-signature').identify
const identifyStream = require('buffer-signature').identifyStream

class OutputFFNet extends Output {
  from (fic) {
    return super.from(fic).to(filenameize(this.fic.title) + '.ffnet')
  }
  write () {
    return mkdirp(this.outname)
      .then(() => pump(this.fic, this.transform()))
      .then(() => this.writeIndex())
      .then(() => this.outname)
      .catch((er) => console.error(er.stack))
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
      const content = HTMLToFFNet(this.sanitizeHtml(chapter.content))
      return writeFile(filename, content)
    }
  }

  writeIndex () {
    return writeFile(path.join(this.outname, 'index.html'), HTMLToFFNet(this.tableOfContentsHTML()))
  }

  htmlStyle () {
    return ''
  }

  htmlCoverImage () {
    if (!this.coverName) return ''
    return `<center><img src="${this.coverName}"></center>`
  }

  htmlSummaryTable (content) {
    return content
  }

  htmlSummaryRow (key, value) {
    return `<strong><u>${key}:</u></strong> ${value}<br>\n`
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

OutputFFNet.aliases = ['fanfiction.net']
module.exports = OutputFFNet

function chapterFilename (chapter) {
  const index = 1 + chapter.order
  const name = chapter.name || 'Chapter ' + index
  return chapter.filename && chapter.filename.replace('xhtml', 'html') || filenameize('chapter-' + name) + '.html'
}
