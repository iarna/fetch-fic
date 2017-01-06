'use strict'
const Bluebird = require('bluebird')

const ChapterContent = use('chapter-content')
const Site = use('site')

class Wikipedia extends Site {
  static matches (siteUrlStr) {
    return /wikipedia[.]org[/]wiki[/]/.test(siteUrlStr)
  }

  constructor (siteUrlStr) {
    super(siteUrlStr)
    this.publisher = 'wikipedia.org'
    this.publisherName = 'Wikipedia'
    const matches = siteUrlStr.match(/[/]wiki[/](.*?)$/)
    this.name = matches[1]
  }

  getFicMetadata (fetch, fic) {
    fic.link = this.link
    fic.publisher = this.publisherName
    // currently we only support /art/ urls, which can only have one thing on them
    return this.getChapter(fetch, new ChapterContent({link: this.link})).then(chapter => {
      fic.title = chapter.name
      fic.link = this.normalizeLink(chapter.link)
      fic.author = chapter.author
      fic.authorUrl = chapter.authorUrl
      fic.publisher = this.publisherName
      fic.description = chapter.description
      fic.externals = false
      fic.addChapter(chapter)
    })
  }

  scrapeFicMetadata (fetch, fic) {
    // There's never any reason to scrape Wikipedia content.
    return Bluebird.resolve()
  }

  getChapter (fetch, chapterInfo) {
    return fetch(chapterInfo.fetchWith()).spread((meta, html) => {
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
    })
  }
}
module.exports = Wikipedia
