'use strict'
const url = require('url')

const Bluebird = require('bluebird')

const ChapterContent = use('chapter-content')
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
    return this.getChapter(fetch, new ChapterContent({link: this.chapterListUrl()})).then(chapter => {
      const $meta = chapter.$('#profile_top')
      const $dates = $meta.find('span[data-xutime]')
      fic.title = $meta.find('b.xcontrast_txt').text()
      fic.link = this.normalizeLink(chapter.link)
      fic.author = chapter.author
      fic.authorUrl = chapter.authorUrl
      fic.created = new Date(Number(chapter.$($dates[1]).attr('data-xutime')) * 1000)
      fic.modified = new Date(Number(chapter.$($dates[0]).attr('data-xutime')) * 1000)
      fic.publisher = this.publisherName
      fic.description = $meta.find('div.xcontrast_txt').text()
      const img = chapter.$('#img_large img').attr('data-original')
      if (img) {
        fic.cover = url.resolve(chapter.base, img)
      }

      const infoline = $meta.find('span.xgray').text()
      const infomatches = infoline.match(/Rated:\s+(.*)\s+-\s+(\S+)\s+-\s+(.*)\s+-\s+Chapters:\s+\d+\s+-\s+Words:\s+([\d,]+)\s+-\s+Reviews:\s+([,\d]+)\s+-\s+Favs:\s+([,\d]+)\s+-\s+Follows:\s+([,\d]+)/)
      if (infomatches) {
        const rated = infomatches[1]
        fic.language = infomatches[2]
        fic.tags = infomatches[3].split(/, /).concat(['rated:' + rated])
        fic.words = Number(infomatches[4].replace(/,/g, ''))
      } else {
        process.emit('error', 'NOMATCH:', infoline)
      }

      const $index = chapter.$(chapter.$('#chap_select')[0])
      const $chapters = $index.find('option')
      $chapters.each((ii, vv) => {
        const chapterName = chapter.$(vv).text().match(/^\d+[.](?: (.*))?$/)
        const chapterNum = chapter.$(vv).attr('value') || ii
        fic.addChapter({name: chapterName[1] || (String(chapterNum) + '.'), link: this.chapterUrl(chapterNum)})
      })
    })
  }

  scrapeFicMetadata (fetch, fic) {
    // There's never any reason to scrape FFN content, AFAIK.
    return Bluebird.resolve()
  }

  getChapter (fetch, chapterInfo) {
    return fetch(chapterInfo.fetchWith()).spread((meta, html) => {
      const chapter = new ChapterContent(chapterInfo, {html, site: this})
      chapter.$content = chapter.$('#storytextp')
      chapter.base = chapter.$('base').attr('href') || meta.finalUrl
      const links = chapter.$('a.xcontrast_txt')
      links.each(function (ii, vv) {
        const href = chapter.$(vv).attr('href')
        if (/^[/]u[/]\d+[/]/.test(href)) {
          chapter.author = chapter.$(vv).text()
          chapter.authorUrl = url.resolve(chapter.base, href)
        }
      })
      return chapter
    })
  }
}

module.exports = FanFictionNet
