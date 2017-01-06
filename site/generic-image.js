'use strict'
const url = require('url')

const Bluebird = require('bluebird')

const ChapterContent = use('chapter-content')
const Site = use('site')

class GenericImage extends Site {
  static matches (siteUrlStr) {
    return !/clear.png/.test(siteUrlStr) && /[.](?:jpg|jpeg|png|gif|svg)$/.test(siteUrlStr)
  }

  constructor (siteUrlStr) {
    super(siteUrlStr)
    this.publisher = url.parse(siteUrlStr).hostname
    this.publisherName = this.publisher
  }

  normalizeLink (href, base) {
    if (base) href = url.resolve(base, href)
    return href
  }

  getFicMetadata (fetch, fic) {
    fic.title = this.link
    fic.link = this.link
    fic.publisher = this.publisher
    fic.link = this.normalizeLink(this.link)
    fic.addChapter({name: this.link, link: fic.link})
    return Bluebird.resolve()
  }

  scrapeFicMetadata (fetch, fic) {
    return Bluebird.resolve()
  }

  getChapter (fetch, chapterInfo) {
    return Bluebird.resolve(new ChapterContent(chapterInfo, {
      site: this,
      base: chapterInfo.link,
      content: `<img src="${chapterInfo.fetchWith()}">`
    }))
  }
}
module.exports = GenericImage
