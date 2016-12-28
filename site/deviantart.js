'use strict'
const Bluebird = require('bluebird')
const cheerio = require('cheerio')

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
    // currently we only support /art/ urls, which can only have one thing on them
    return this.getChapter(fetch, this.link).then(info => {
      fic.title = info.name
      fic.link = this.normalizeLink(info.finalUrl)
      fic.author = info.author
      fic.authorUrl = info.authorUrl
      fic.publisher = this.publisherName
      fic.description = info.description
      fic.addChapter({name: info.name || info.author, link: this.normalizeLink(info.finalUrl)})
    })
  }

  scrapeFicMetadata (fetch, fic) {
    // There's never any reason to scrape Divant Art content.
    return Bluebird.resolve()
  }

  getChapter (fetch, chapter) {
    return fetch(chapter).spread((meta, html) => {
      let $ = cheerio.load(html)
      let base = $('base').attr('href') || meta.finalUrl
      let title = $('meta[property="og:title"]').attr('content')
      let desc = $('div.dev-description').find('div.text').html() || $('meta[property="og:description"]').attr('content')
      let image = $('meta[property="og:image"]').attr('content')
      let width = $('meta[property="og:image:width"]').attr('content')
      let height = $('meta[property="og:image:height"]').attr('content')
      let link = $('meta[property="og:url"]').attr('content')
      let author = $($('a.username')[0])
      let authorName = author.text()
      let authorUrl = author.attr('href')
      return {
        meta: chapter,
        name: title,
        description: desc,
        finalUrl: link,
        base: base,
        author: authorName,
        authorUrl: authorUrl,
        raw: html,
        headers: true,
        content: `<img width="${width}" height="${height}" src="${image}" alt="${title} by ${authorName}">`
      }
    })
  }
}
module.exports = DeviantArt
