'use strict'
const Output = use('output')

class OutputAO3 extends Output {
  from (fic) {
    const filenameize = use('filenameize')
    return super.from(fic).to(filenameize(this.fic.title) + '.ao3')
  }

  chapterExt () {
    return '.html'
  }

  async write () {
    const mkdirp = use('mkdirp')
    const fun = require('funstream')
    try {
      await mkdirp(this.outname)
      await fun(this.fic).pipe(this.transform())
      await this.writeIndex()
      return this.outname
    } catch (err) {
      process.emit('error', err.stack)
    }
  }

  transformChapter (chapter) {
    const chaptername = this.chapterFilename(chapter)
    const path = require('path')
    const filename = chaptername && path.join(this.outname, this.chapterFilename(chapter))
    const fs = use('fs-promises')
    if (chapter.outputType === 'image') {
      return fs.writeFile(filename, chapter.content)
    } else if (chapter.outputType === 'cover') {
      const stream = require('stream')
      if (chapter.content instanceof stream.Stream) {
        const tmpname = path.join(this.outname, 'cover-tmp')
        return new Promise((resolve, reject) => {
          const identifyStream = require('buffer-signature').identifyStream
          const WriteStreamAtomic = require('fs-write-stream-atomic')
          chapter.content.pipe(identifyStream(info => {
            const ext = info.extensions.length ? '.' + info.extensions[0] : ''
            this.coverName = 'cover' + ext
          })).pipe(new WriteStreamAtomic(tmpname)).on('error', reject).on('finish', () => {
            resolve(fs.rename(tmpname, path.join(this.outname, this.coverName)))
          })
        })
      } else {
        const identifyBuffer = require('buffer-signature').identify
        const info = identifyBuffer(chapter.content)
        const ext = info.extensions.length ? '.' + info.extensions[0] : ''
        this.coverName = 'cover' + ext
        return fs.writeFile(path.join(this.outname, this.coverName), chapter.content)
      }
    } else {
      const HTMLToAO3 = require('./html-to-ao3.js')
      const content = HTMLToAO3(this.prepareHtml(chapter.content))
      return fs.writeFile(filename, content)
    }
  }

  writeIndex () {
    const HTMLToAO3 = require('./html-to-ao3.js')
    const fs = use('fs-promises')
    const path = require('path')
    return fs.writeFile(path.join(this.outname, 'index.html'), HTMLToAO3(this.tableOfContentsHTML()))
  }

  htmlStyle () {
    return ''
  }

  htmlCoverImage () {
    if (!this.coverName) return ''
    return `<p><center><img src="${this.coverName}"></center></p>`
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

OutputAO3.aliases = ['archiveofourown']
module.exports = OutputAO3
