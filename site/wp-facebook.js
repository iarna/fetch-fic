'use strict'
const Bluebird = require('bluebird')
const Site = use('site')

class WpFacebook extends Site {
  static matches (siteUrlStr) {
    return /wp[.]com[/]graph[.]facebook[.]com/.test(siteUrlStr)
  }
  normalizeLink (link) {
    const url = require('url')
    const linkBits = url.parse(link)
    linkBits.host = 'i0.wp.com'
    linkBits.pathname = linkBits.pathname.replace(/v2.2[/]/, '') + '/.jpg'
    return url.format(linkBits)
  }
  getChapter (fetch, chapter) {
    const ChapterContent = use('chapter-content')
    return Bluebird.resolve(new ChapterContent(chapter, {
      name: chapter.link,
      base: chapter.link,
      content: '<img src="' + chapter.fetchWith() + '">'
    }))
  }
}
module.exports = WpFacebook
