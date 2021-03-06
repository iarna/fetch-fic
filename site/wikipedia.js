'use strict'
const Site = use('site')
const qr = require('@perl/qr')

class Wikipedia extends Site {
  static matches (siteUrlStr) {
    return qr`wikipedia[.]org/wiki/`.test(siteUrlStr)
  }

  constructor (siteUrlStr) {
    super(siteUrlStr)
    this.publisher = 'wikipedia.org'
    this.publisherName = 'Wikipedia'
    this.shortName = 'wikipedia'
    this.type = 'wikipedia'
    const matches = siteUrlStr.match(/[/]wiki[/](.*?)$/)
    this.name = matches[1]
  }

  async getFicMetadata (fetch, fic) {
    fic.link = this.link
    fic.publisher = this.publisherName
    // currently we only support /art/ urls, which can only have one thing on them
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

  async getChapter (fetch, chapterInfo) {
    const [meta, html] = await fetch(chapterInfo.fetchWith())
    const ChapterContent = use('chapter-content')
    const chapter = new ChapterContent(chapterInfo, {site: this, html})
    chapter.base = chapter.$('base').attr('href') || meta.finalUrl
    chapter.name = chapter.$('#firstHeading').text()
    const link = chapter.$('link[rel="canonical"]').attr('href') || meta.finalUrl
    if (link !== chapter.link) {
      chapter.fetchFrom = chapter.link
      chapter.link = link
    }
    chapter.author = 'Wikipedia'
    chapter.authorUrl = link
    chapter.$content = chapter.$('#mw-content-text')
    chapter.$content.find('.infobox').remove()
    chapter.$content.find('.metadata').remove()
    chapter.$content.find('.navbox').remove()
    chapter.$content.find('.mw-editsection').remove()
    chapter.$content.find('.vertical-navbox').remove()
    return chapter
  }
}
module.exports = Wikipedia
