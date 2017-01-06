'use strict'
const url = require('url')

const Bluebird = require('bluebird')

const ChapterContent = use('chapter-content')
const Site = use('site')

class WpFacebook extends Site {
  static matches (siteUrlStr) {
    return /wp[.]com[/]graph[.]facebook[.]com/.test(siteUrlStr)
  }
  normalizeLink (link) {
    const linkBits = url.parse(link)
    linkBits.host = 'i0.wp.com'
    linkBits.pathname = linkBits.pathname.replace(/v2.2[/]/, '') + '/.jpg'
    return url.format(linkBits)
  }
  getChapter (fetch, chapter) {
    return Bluebird.resolve(new ChapterContent(chapter, {
      name: chapter.link,
      base: chapter.link,
      content: '<img src="' + chapter.fetchWith() + '">'
    }))
  }
}
module.exports = WpFacebook
