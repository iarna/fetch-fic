'use strict'
const Bluebird = require('bluebird')

const Site = use('site')

class Local extends Site {
  static matches (siteUrlStr) {
    return !/:/.test(siteUrlStr)
  }

  constructor (siteUrlStr) {
    super(siteUrlStr)
    this.publisher = 'local'
    this.publisherName = 'Local'
  }

  normalizeLink (href, base) {
    return href
  }

  getFicMetadata (fetch, fic) {
    const uuid = require('uuid')
    const path = require('path')
    fic.id = 'urn:uuid:' + uuid.v4()
    fic.publisher = this.publisherName
    fic.updateFrom = fic.link
    fic.link = null
    fic.title = path.basename(fic.updateFrom)
    return this.recursedir(fic, fic.updateFrom)
  }

  recursedir (fic, dir) {
    const fs = use('fs-promises')
    return fs.readdir(dir).then(files => {
      const path = require('path')
      const list = files.map(file => path.join(dir, file)).sort()
      const todo = []
      return Bluebird.map(list, filename => fs.stat(filename).then(info => {
        if (info.isDirectory()) {
          return filename
        } else if (/\.rtf$/.test(filename)) {
          const name = path.relative(fic.updateFrom, filename)
          fic.addChapter({name, fetchFrom: filename, created: info.birthtime, modified: info.mtime})
        }
      })).each(filename => filename && this.recursedir(fic, filename))
      return Bluebird.all(todo).catch(x => process.emit('error', 'TAP', x))
    })
  }

  scrapeFicMetadata (fetch, fic) {
    // There's never any reason to scrape local content.
    return Bluebird.resolve()
  }

  getChapter (fetch, chapter) {
    const fs = use('fs-promises')
    const ChapterContent = use('chapter-content')
    const rtfToHTML = use('rtf-to-html')
    return rtfToHTML(fs.readFile(chapter.fetchWith(), 'ascii'))
      .then(content => new ChapterContent(chapter, {site: this, content}))
  }
}
module.exports = Local
