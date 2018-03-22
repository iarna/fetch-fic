'use strict'
const url = require('url')
const qr = require('@perl/qr')

const Site = use('site')

class GenericImage extends Site {
  static matches (siteUrlStr) {
    return !qr`clear[.]png`.test(siteUrlStr) && qr`[.](?:jpg|jpeg|png|gif|svg)$`.test(siteUrlStr)
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

  async getFicMetadata (fetch, fic) {
    fic.title = this.link
    fic.link = this.link
    fic.publisher = this.publisher
    fic.link = this.normalizeLink(this.link)
    fic.addChapter({name: this.link, link: fic.link})
  }

  async getChapter (fetch, chapterInfo) {
    const ChapterContent = use('chapter-content')
    return new ChapterContent(chapterInfo, {
      site: this,
      base: chapterInfo.link,
      content: `<img src="${chapterInfo.fetchWith()}">`
    })
  }
}
module.exports = GenericImage
