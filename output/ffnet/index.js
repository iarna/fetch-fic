'use strict'
const path = require('path')

const Bluebird = require('bluebird')
const identifyBuffer = require('buffer-signature').identify
const identifyStream = require('buffer-signature').identifyStream
const stream = require('readable-stream')

const filenameize = use('filenameize')
const fs = use('fs-promises')
const mkdirp = use('mkdirp')
const Output = use('output')
const pump = use('pump')

const HTMLToFFNet = require('./html-to-ffnet.js')

class OutputFFNet extends Output {
  from (fic) {
    return super.from(fic).to(filenameize(this.fic.title) + '.ffnet')
  }

  chapterExt () {
    return '.html'
  }

  write () {
    return mkdirp(this.outname)
      .then(() => pump(this.fic, this.transform()))
      .then(() => this.writeIndex())
      .then(() => this.outname)
      .catch((er) => process.emit('error', er.stack))
  }

  transformChapter (chapter) {
    const chaptername = this.chapterFilename(chapter)
    const filename = chaptername && path.join(this.outname, this.chapterFilename(chapter))
    if (chapter.type === 'image') {
      return fs.writeFile(filename, chapter.content)
    } else if (chapter.type === 'cover') {
      if (chapter.content instanceof stream.Stream) {
        const tmpname = path.join(this.outname, 'cover-tmp')
        return new Bluebird((resolve, reject) => {
          chapter.content.pipe(identifyStream(info => {
            const ext = info.extensions.length ? '.' + info.extensions[0] : ''
            this.coverName = 'cover' + ext
          })).pipe(fs.createWriteStream(tmpname)).on('error', reject).on('finish', () => {
            resolve(fs.rename(tmpname, path.join(this.outname, this.coverName)))
          })
        })
      } else {
        const info = identifyBuffer(chapter.content)
        const ext = info.extensions.length ? '.' + info.extensions[0] : ''
        this.coverName = 'cover' + ext
        return fs.writeFile(path.join(this.outname, this.coverName), chapter.content)
      }
    } else {
      const content = HTMLToFFNet(this.prepareHtml(chapter.content))
      return fs.writeFile(filename, content)
    }
  }

  writeIndex () {
    return fs.writeFile(path.join(this.outname, 'index.html'), HTMLToFFNet(this.tableOfContentsHTML()))
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
