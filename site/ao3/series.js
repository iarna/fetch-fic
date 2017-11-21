'use strict'
const url = require('url')
const Site = use('site')
const cache = use('cache')
const moment = require('moment')
const Fic = use('fic')

class ArchiveOfOurOwnSeries extends Site {
  static matches (siteUrlStr) {
    const siteUrl = url.parse(siteUrlStr)
    const hostname = siteUrl.hostname
    if (!/(^|www[.])archiveofourown.org$/.test(hostname)) return false
    const path = siteUrl.pathname || siteUrl.path || ''
    if (!/^[/]series[/]\d+/.test(path)) return false
    return true
  }

  constructor (siteUrlStr) {
    super(siteUrlStr)
    this.publisher = 'archiveofourown.org'
    this.publisherName = 'Archive of Our Own'
    const siteUrl = url.parse(siteUrlStr)
    const path = siteUrl.pathname || siteUrl.path || ''
    const ficMatch = path.match(/^[/]series[/](\d+)/)
    this.seriesId = ficMatch[1]
  }

  async getFicMetadata (fetch, fic) {
    fic.link = this.link
    fic.publisher = this.publisherName
    const [meta, html] = await fetch(this.link)
    const cheerio = require('cheerio')
    const $ = cheerio.load(html)
    if ($('.error-503-maintenance').length) {
      const err = new Error($('#main').text().trim().split(/\n/).map(l => l.trim()).join('\n'))
      err.link = this.chapterIndex()
      err.code = 503
      err.site = this.publisherName
      await cache.clearUrl(err.link)
      throw err
    }
    const base = $('base').attr('href') || this.link
    fic.title = $('#main h2').text().trim()
    const $series = $('dl.series.meta')
    const $author = $series.find('dt:contains(Creator) + dd')
    fic.author = $author.text().trim()
    fic.authorUrl = this.normalizeLink($author.find('a').attr('href'), base)
    fic.created = moment($series.find('dt:contains(Series Begun) + dd').text().trim())
    fic.modified = moment($series.find('dt:contains(Series Updated) + dd').text().trim() || fic.created)
    fic.description = $series.find('dt:contains(Description) + dd blockquote').html()
    fic.notes = $series.find('dt:contains(Notes) + dd blockquote').html()
    fic.tags = ['Series']
    const complete = $series.find('dt:contains(Complete) + dd').text().trim() === 'Yes'
    if (complete) fic.tags.push('status:complete')
    fic.bookmarks = Number($series.find('dt:contains(Bookmarks) + dd').text())
    const works = []
    $('ul.series.index li div.header h4').each((ii, work) => {
      const $work = $(work)
      const link = $work.find('a:first-child').attr('href')
      works.push(this.normalizeLink(link, base))
    })
    const forEach = use('for-each')
    return forEach(works, async (link, ii) => {
      const subfic = await Fic.fromUrl(fetch, link)
      subfic.tags.push(`series:${fic.title}[${ii + 1}]`)
      fic.fics.push(subfic)
    })
  }
  async getChapter (fetch, chapterInfo) {
    const ChapterContent = use('chapter-content')
    return new ChapterContent(chapterInfo, {html: '', site: this})
  }
}
module.exports = ArchiveOfOurOwnSeries
