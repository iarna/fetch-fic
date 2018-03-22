'use strict'
const url = require('url')
const Bluebird = require('bluebird')
const Site = use('site')
const qr = require('@perl/qr')

class SeananMcGuire extends Site {
  static matches (siteUrlStr) {
    return qr`seananmcguire[.]com`.test(siteUrlStr)
  }

  constructor (siteUrlStr) {
    super(siteUrlStr)
    this.publisher = 'seananmcquire.com'
    this.publisherName = 'Seanan McGuire'
  }

  normalizeLink (href, base) {
    if (base) href = url.resolve(base, href)
    return href
  }

  async getFicMetadata (fetch, fic) {
    fic.link = this.link
    fic.publisher = this.publisher
    const Chapter = use('fic').Chapter
    const chapter = await Chapter.getContent(fetch, this.link)
    fic.title = chapter.name
    fic.link = this.normalizeLink(chapter.link)
    fic.author = chapter.author
    fic.authorUrl = chapter.authorUrl
    fic.publisher = this.publisherName
    fic.description = chapter.description
    fic.externals = false
    fic.addChapter(chapter)
  }

  scrapeFicMetadata (fetch, fic) {
    return Bluebird.resolve()
  }

  async getChapter (fetch, chapterInfo) {
    const [meta, html] = await fetch(chapterInfo.fetchWith())
    const ChapterContent = use('chapter-content')
    const chapter = new ChapterContent(chapterInfo, {site: this, html})
    chapter.base = chapter.$('base').attr('href') || meta.finalUrl
    chapter.name = chapter.$('title').text().replace(/Seanan McGuire: /, '')
    chapter.author = 'Seanan McGuire'
    chapter.authorUrl = 'http://seananmcguire.com/'
    chapter.$content = chapter.$('#content')
    chapter.$content.find('#footer').remove()
    return chapter
  }
}
module.exports = SeananMcGuire
