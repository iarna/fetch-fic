'use strict'
const Bluebird = require('bluebird')
const Site = use('site')

class DeviantArt extends Site {
  static matches (siteUrlStr) {
    return /deviantart[.]com[/]art[/]/.test(siteUrlStr)
  }

  constructor (siteUrlStr) {
    super(siteUrlStr)
    this.publisher = 'deviantart.com'
    this.publisherName = 'Deviant Art'
    const matches = siteUrlStr.match(/[/]art[/](?:(.*?)-)?\d+$/)
    this.name = matches[1]
  }

  getFicMetadata (fetch, fic) {
    fic.link = this.link
    fic.publisher = this.publisherName
    const Chapter = use('fic').Chapter
    // currently we only support /art/ urls, which can only have one thing on them
    return Chapter.getContent(fetch, this.link).then(chapter => {
      fic.title = chapter.name
      fic.link = this.normalizeLink(chapter.link)
      fic.author = chapter.author
      fic.authorUrl = chapter.authorUrl
      fic.publisher = this.publisherName
      fic.description = chapter.description
      fic.addChapter(chapter)
    })
  }

  scrapeFicMetadata (fetch, fic) {
    // There's never any reason to scrape Deviant Art content.
    return Bluebird.resolve()
  }

  getChapter (fetch, chapterInfo) {
    return fetch(chapterInfo.fetchWith()).spread((meta, html) => {
      const ChapterContent = use('chapter-content')
      const chapter = new ChapterContent(chapterInfo, {html, site: this})
      chapter.description = chapter.$('div.dev-description').find('div.text').html() || chapter.$('meta[property="og:description"]').attr('content')
      const image = chapter.$('meta[property="og:image"]').attr('content')
      const width = chapter.$('meta[property="og:image:width"]').attr('content')
      const height = chapter.$('meta[property="og:image:height"]').attr('content')
      const link = chapter.$('meta[property="og:url"]').attr('content') || meta.finalUrl
      if (link !== chapter.link) {
        chapter.fetchFrom = chapter.link
        chapter.link = link
      }
      chapter.base = chapter.$('base').attr('href') || link
      const author = chapter.$(chapter.$('a.username')[0])
      chapter.author = author.text()
      chapter.authorUrl = author.attr('href')
      chapter.content = `<img width="${width}" height="${height}" src="${image}" alt="${chapter.name} by ${chapter.author}">`
      chapter.headings = true
      chapter.name = chapter.$('meta[property="og:title"]').attr('content') || chapter.author
      return chapter
    })
  }
}
module.exports = DeviantArt
