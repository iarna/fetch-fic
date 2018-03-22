'use strict'
const url = require('url')
const qr = require('@perl/qr')

const Site = use('site')

class Gravatar extends Site {
  static matches (siteUrlStr) {
    return qr`gravatar`.test(siteUrlStr) && qr`/avatar/`.test(siteUrlStr)
  }
  normalizeLink (link) {
    const linkBits = url.parse(link)
    linkBits.host = 'gravatar.com'
    if (/identicon/.test(linkBits.query)) {
      linkBits.pathname += '.png'
    }
    return url.format(linkBits)
  }
  async getChapter (fetch, chapter) {
    const ChapterContent = use('chapter-content')
    return new ChapterContent(chapter, {
      site: this,
      name: chapter.link,
      base: chapter.fetchWith(),
      content: '<img src="' + chapter.fetchWith() + '">'
    })
  }
}
module.exports = Gravatar
