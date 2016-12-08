'use strict'
const Bluebird = require('bluebird')
const Site = require('./site.js')
const url = require('url')

class Gravatar extends Site {
  static matches (siteUrlStr) {
    return /gravatar/.test(siteUrlStr) && /[/]avatar[/]/.test(siteUrlStr)
  }
  normalizeLink (link) {
    const linkBits = url.parse(link)
    linkBits.host = 'gravatar.com'
    if (/identicon/.test(linkBits.query)) {
      linkBits.pathname += '.png'
    }
    return url.format(linkBits)
  }
  getChapter (fetch, chapter) {
    return Bluebird.resolve({
      meta: {},
      name: chapter,
      finalUrl: chapter,
      base: chapter,
      raw: '',
      content: '<img src="' + chapter + '">'
    })
  }
}
module.exports = Gravatar
