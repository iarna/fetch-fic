'use strict'
const Site = require('./site.js')
const cheerio = require('cheerio')
const Bluebird = require('bluebird')

class Wikipedia extends Site {
  static matches (siteUrlStr) {
    return /wikipedia[.]org[/]wiki[/]/.test(siteUrlStr)
  }

  constructor (siteUrlStr) {
    super(siteUrlStr)
    this.publisher = 'wikipedia.org'
    this.publisherName = 'Wikipedia'
    var matches = siteUrlStr.match(/[/]wiki[/](.*?)$/)
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
      fic.externals = false
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
      let title = $('#firstHeading').text()
      let link = $('link[rel="canonical"]').attr('href')
      let $content = $('#mw-content-text')
      $content.find('.infobox').remove()
      $content.find('.metadata').remove()
      $content.find('.navbox').remove()
      $content.find('.mw-editsection').remove()
      $content.find('.vertical-navbox').remove()

      return {
        meta: chapter,
        name: title,
        finalUrl: link,
        base: base,
        raw: html,
        content: $content.html()
      }
    })
  }
}
module.exports = Wikipedia
