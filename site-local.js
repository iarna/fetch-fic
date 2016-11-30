'use strict'
const Site = require('./site.js')
const cheerio = require('cheerio')
const Bluebird = require('bluebird')
const path = require('path')
const fs = require('fs')
const uuid = require('uuid')
const promisify = require('./promisify')
const readdir = promisify(fs.readdir)
const unrtf = promisify(require('unrtf'))
const readFile = promisify(fs.readFile)

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
    fic.id =  'urn:uuid:' + uuid.v4()
    fic.publisher = this.publisherName
    fic.updateFrom = fic.link
    fic.link = null
    fic.title = path.basename(fic.updateFrom)
    return this.recursedir(fic, fic.updateFrom)
  }

  recursedir (fic, dir) {
    return readdir(dir).then(files => {
      var todo = []
      for (let file of files) {
        const filename = path.join(dir, file)
        const info = fs.statSync(filename)
        if (info.isDirectory()) {
          todo.push(this.recursedir(fic, filename))
        } else if (/\.rtf$/.test(filename)) {
          const name = path.relative(fic.updateFrom, filename)
          fic.addChapter({name, link: filename, created: info.birthtime, modified: info.mtime})
        }
      }
      return Bluebird.all(todo).catch(x => console.log('TAP', x))
    })
  }

  scrapeFicMetadata (fetch, fic) {
    // There's never any reason to scrape local content.
    return Bluebird.resolve()
  }

  getChapter (fetch, chapter) {
    return unrtf(readFile(chapter, 'utf8')).then(result => {
      return {
        'finalUrl': chapter,
        'content': result.html
      }
    })
  }
}
module.exports = Local
