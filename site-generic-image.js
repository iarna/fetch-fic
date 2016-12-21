'use strict'
const Site = require('./site.js')
const Bluebird = require('bluebird')
const url = require('url')

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
    // resolve base url
    if (base) href = url.resolve(base, href)
    return href
  }

  getFicMetadata (fetch, fic) {
    fic.title = this.link
    fic.link = this.link
    fic.publisher = this.publisher
    // currently we only support /art/ urls, which can only have one thing on them
    return this.getChapter(fetch, this.link).then(info => {
      fic.link = this.normalizeLink(info.finalUrl)
      fic.addChapter({name: this.link, link: fic.link})
    })
  }

  scrapeFicMetadata (fetch, fic) {
    // There's never any reason to scrape Divant Art content.
    return Bluebird.resolve()
  }

  getChapter (fetch, chapter) {
    return Bluebird.resolve({
      meta: chapter,
      finalUrl: chapter,
      base: chapter,
      content: `<img src="${chapter}">`
    })
  }
}
module.exports = GenericImage
