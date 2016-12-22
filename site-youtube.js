'use strict'
const Site = require('./site.js')
const cheerio = require('cheerio')
const Bluebird = require('bluebird')
const url = require('url')

class Wikipedia extends Site {
  static matches (siteUrlStr) {
    return /youtube[.]com[/]watch[?]v=|youtu.be/.test(siteUrlStr)
  }

  constructor (siteUrlStr) {
    super(siteUrlStr)
    this.publisher = 'youtube.com'
    this.publisherName = 'You Tube'
    const matches = siteUrlStr.match(/[/]watch[?]v=(.*)$/) || siteUrlStr.match(/youtu.be[/](.*)/)
    this.id = matches[1]
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
    // There's never any reason to scrape Wikipedia content.
    return Bluebird.resolve()
  }

  getChapter (fetch, chapter) {
    return fetch(chapter).spread((meta, html) => {
      let $ = cheerio.load(html)
      let base = $('base').attr('href') || meta.finalUrl
      let title = ($('meta[property="og:title"]').attr('content') || '').replace(/- YouTube$/, '')
      if (!title) throw new Error('Skipping due to missing video or shutdown account.')
      let desc = $('meta[property="og:description"]').attr('content')
      let width = $('meta[property="og:video:width"]').attr('content')
      let height = $('meta[property="og:video:height"]').attr('content')
      let link = $('meta[property="og:url"]').attr('content')
      let image = $('link[itemprop="thumbnailUrl"]').attr('href')
      let $author = $('div.yt-user-info')
      let author = $author.find('a').text()
      let authorUrl = url.resolve(base, $author.find('a').attr('href'))

      return {
        meta: chapter,
        name: title,
        description: desc,
        finalUrl: link,
        base: base,
        author: author,
        authorUrl: authorUrl,
        raw: html,
        headings: true,
        content: `<a external="false" href="${link}"><img width="${width}" height="${height}" src="${image}" alt="${title} by ${author}"></a>`
      }
    })
  }
}
module.exports = Wikipedia
