'use strict'
const Site = use('site')
const qr = require('@perl/qr')

class Local extends Site {
  static matches (siteUrlStr) {
    return siteUrlStr && !qr`:`.test(siteUrlStr)
  }

  constructor (siteUrlStr) {
    super(siteUrlStr)
    this.publisher = 'local'
    this.publisherName = 'Local'
    this.shortName = 'local'
    this.type = 'local'
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

  async recursedir (fic, dir) {
    const fs = use('fs-promises')
    const files = await fs.readdir(dir)
    const path = require('path')
    const list = files.map(file => path.join(dir, file)).sort()
    const fun = require('fun-stream')
    const map = use('map')
    const forEach = use('for-each')
    return fun(list).flatMap(async filename => {
      const info = await fs.stat(filename)
      if (info.isDirectory()) {
        return [filename]
      } else if (qr`[.]rtf$`.test(filename)) {
        const name = path.relative(fic.updateFrom, filename)
        fic.addChapter({name, fetchFrom: filename, created: info.birthtime, modified: info.mtime})
      }
      return []
    }).forEach(filename => this.recurseDir(fic, filename))
  }

  async getChapter (fetch, chapter) {
    const fs = use('fs-promises')
    const ChapterContent = use('chapter-content')
    const rtfToHTML = use('rtf-to-html')
    const content = await rtfToHTML(fs.readFile(chapter.fetchWith(), 'ascii'))
    return new ChapterContent(chapter, {site: this, content})
  }
}
module.exports = Local
