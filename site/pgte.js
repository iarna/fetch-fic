'use strict'
const url = require('url')
const Site = use('site')
const qr = require('@perl/qr')

class PGTE extends Site {
  static matches (siteUrlStr) {
    const siteUrl = url.parse(siteUrlStr)
    const hostname = siteUrl.hostname
    return hostname === 'practicalguidetoevil.wordpress.com'
  }

  constructor (siteUrlStr) {
    super(siteUrlStr)
    this.publisher = 'practicalguidetoevil.wordpress.com'
    this.publisherName = 'erraticerrata'
  }

  normalizeLink (link) {
    return link.replace(/[?#].*/, '').replace(/([^/])$/, '$1/').replace(/^http:/, 'https:')
  }

  chapterListUrl () {
    return 'https://practicalguidetoevil.wordpress.com/table-of-contents/'
  }

  async getFicMetadata (fetch, fic) {
    fic.publisher = this.publisherName
    fic.author = 'David Verburg'
    fic.authorUrl = 'https://practicalguidetoevil.wordpress.com/'

    const [meta, body] = await fetch(this.chapterListUrl())
    const cheerio = require('cheerio')
    const $ = cheerio.load(body)
    let synopstart = $('.entry-content p:contains(Synopsis)').next()
    let synopsis = ''
    let last = ''
    while (synopstart.find('a').length === 0 && last !== synopstart.html()) {
      last = synopstart.html()
      synopsis += `<p>${synopstart.html()}</p>\n`
      synopstart = synopstart.next()
    }
    fic.title = 'A Practical Guide to Evil'
    fic.description = synopsis
    const Chapter = use('fic').Chapter
    const chapter = await Chapter.getContent(fetch, this.chapterListUrl())
    fic.modified = chapter.modified
    fic.updated = chapter.updated
    const arcs = {}
    chapter.$content.find('.entry-content p:contains(Arc)').each((ii, arc) => {
      const matched = $(arc).text().match(/Arc (\d+): (.*)/) || $(arc).text().match(/Arc (\d+) \((.*)\)/)
      arcs[matched[1]] = matched[2].trim()
    })
    chapter.$content.find('a').each((ii, ahref) => {
      const $ahref = $(ahref)
      const name = $ahref.text().trim()
      const link = $ahref.attr('href')
      fic.addChapter({name: name, link})
    })
  }

  async getChapter (fetch, chapterInfo) {
    const chapterUrl = url.parse(chapterInfo.fetchWith())
    const firstChapter = chapterUrl.path === '/2015/03/25/prologue/'
    const [meta, html] = await fetch(chapterInfo.fetchWith())
    const ChapterContent = use('chapter-content')
    const chapter = new ChapterContent(chapterInfo, {site: this, html})
    chapter.base = chapter.$('base').attr('href') || meta.finalUrl
    if (meta.finalUrl !== chapter.link) {
      chapter.fetchFrom = chapter.link
      chapter.link = meta.finalUrl
    }
    chapter.name = chapter.$('h1.entry-title').text().trim()
    const moment = require('moment')
    chapter.created = moment(chapter.$('meta[property="article:published_time"]').attr('content') || chapter.$('time.entry-date').attr('datetime'))
    chapter.modified = moment(chapter.$('meta[property="article:modified_time"]').attr('content'))

    const $content = chapter.$('div.entry-content')
    $content.find('a:contains("Last Chapter")').parent().remove()
    $content.find('a:contains("Next Chapter")').parent().remove()
    $content.find('p:contains("Previous Chapter")').remove()
    $content.find('p:contains("Next Chapter")').remove()
    $content.find('.sharedaddy').remove()
    // strip off the content warnings
    let found = false
    if (/\s[10][.]1$/.test(chapter.$('.entry-title').text())) {
      $content.find('p').each((ii, pp) => {
        if (found) return
        const $pp = chapter.$(pp)
        if ($pp.text() === '⊙') {
          found = true
        }
        $pp.remove()
      })
    }
    $content.find('#jp-post-flair').remove()
    if (firstChapter) {
      const paras = $content.find('p')
      chapter.$(paras[0]).remove()
      chapter.$(paras[1]).remove()
    }
    chapter.$content = $content
    return chapter
  }
}

module.exports = PGTE
