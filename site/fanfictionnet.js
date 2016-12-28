'use strict'
const url = require('url')

const Bluebird = require('bluebird')
const cheerio = require('cheerio')

const Site = use('site')

class FanFictionNet extends Site {
  static matches (siteUrlStr) {
    const siteUrl = url.parse(siteUrlStr)
    const hostname = siteUrl.hostname
    if (!/(^|www[.])fanfiction.net$/.test(hostname)) return false
    const path = siteUrl.pathname || siteUrl.path || ''
    if (!/^[/]s[/]\d+[/]\d+/.test(path)) return false
    return true
  }

  constructor (siteUrlStr) {
    super(siteUrlStr)
    this.publisher = 'www.fanfiction.net'
    this.publisherName = 'FanFiction.net'
    const siteUrl = url.parse(siteUrlStr)
    const path = siteUrl.pathname || siteUrl.path || ''
    const ficMatch = path.match(/^[/]s[/](\d+)[/]\d+(?:[/](.*))?/)
    this.ficId = ficMatch[1]
    this.name = ficMatch[2]
  }

  chapterUrl (num) {
    return 'https://www.fanfiction.net/s/' + this.ficId + '/' + num + (this.name ? '/' + this.name : '')
  }

  chapterListUrl () {
    return this.chapterUrl(1)
  }

  getFicMetadata (fetch, fic) {
    fic.link = this.link
    fic.publisher = this.publisherName
    fic.includeTOC = true
    return this.getChapter(fetch, this.chapterListUrl()).then(chapter => {
      const $ = cheerio.load(chapter.raw)
      const $meta = $('#profile_top')
      const $dates = $meta.find('span[data-xutime]')
      fic.title = $meta.find('b.xcontrast_txt').text()
      fic.link = this.normalizeLink(chapter.finalUrl)
      fic.author = chapter.author
      fic.authorUrl = chapter.authorUrl
      fic.created = new Date(Number($($dates[1]).attr('data-xutime')) * 1000)
      fic.modified = new Date(Number($($dates[0]).attr('data-xutime')) * 1000)
      fic.publisher = this.publisherName
      fic.description = $meta.find('div.xcontrast_txt').text()
      const img = $('#img_large img').attr('data-original')
      if (img) {
        fic.cover = url.resolve(chapter.base, img)
      }

      const infoline = $meta.find('span.xgray').text()
      const infomatches = infoline.match(/Rated:\s+(.*)\s+-\s+(\S+)\s+-\s+(.*)\s+-\s+Chapters:\s+\d+\s+-\s+Words:\s+([\d,]+)\s+-\s+Reviews:\s+([,\d]+)\s+-\s+Favs:\s+([,\d]+)\s+-\s+Follows:\s+([,\d]+)/)
      if (infomatches) {
        const rated = infomatches[1]
        fic.language = infomatches[2]
        fic.tags = infomatches[3].split(/, /).concat(['rated:' + rated])
        fic.words = infomatches[4]
      } else {
        process.emit('error', 'NOMATCH:', infoline)
      }

      const $index = $($('#chap_select')[0])
      const $chapters = $index.find('option')
      $chapters.each((ii, vv) => {
        const chapterName = $(vv).text().match(/^\d+[.](?: (.*))?$/)
        const chapterNum = $(vv).attr('value') || ii
        fic.addChapter({name: chapterName[1] || (String(chapterNum) + '.'), link: this.chapterUrl(chapterNum)})
      })
    })
  }

  scrapeFicMetadata (fetch, fic) {
    // There's never any reason to scrape FFN content, AFAIK.
    return Bluebird.resolve()
  }

  getChapter (fetch, chapter) {
    return fetch(chapter).spread((meta, html) => {
      const $ = cheerio.load(html)
      const $meta = $('#profile_top')
      const ficTitle = $meta.find('b.xcontrast_txt').text()
      const $content = $('#storytextp')
      const base = $('base').attr('href') || meta.finalUrl
      const links = $('a.xcontrast_txt')
      let authorName
      let authorUrl
      links.each(function (ii, vv) {
        const href = $(vv).attr('href')
        if (/^[/]u[/]\d+[/]/.test(href)) {
          authorName = $(vv).text()
          authorUrl = url.resolve(base, href)
        }
      })
      return {
        ficTitle: ficTitle,
        chapterLink: chapter,
        finalUrl: meta.finalUrl,
        base: base,
        author: authorName,
        authorUrl: authorUrl,
        raw: html,
        content: $content.html()
      }
    })
  }
}

module.exports = FanFictionNet
