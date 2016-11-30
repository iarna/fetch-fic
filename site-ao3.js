'use strict'
const url = require('url')
const Site = require('./site.js')
const cheerio = require('cheerio')
const Bluebird = require('bluebird')

class ArchiveOfOurOwn extends Site {
  static matches (siteUrlStr) {
    const siteUrl = url.parse(siteUrlStr)
    const hostname = siteUrl.hostname
    if (!/(^|www[.])archiveofourown.org$/.test(hostname)) return false
    const path = siteUrl.pathname || siteUrl.path || ''
    if (!/^[/]works[/]\d+/.test(path)) return false
    return true
  }

  constructor (siteUrlStr) {
    super(siteUrlStr)
    this.publisher = 'archiveofourown.org'
    this.publisherName = 'Archive of Our Own'
    const siteUrl = url.parse(siteUrlStr)
    const path = siteUrl.pathname || siteUrl.path || ''
    const ficMatch = path.match(/^[/]works[/](\d+)/)
    this.workId = ficMatch[1]
  }

  chapterIndex () {
    return 'https://archiveofourown.org/works/' + this.workId + '/navigate'
  }
  tagGroup ($, prefix, $dd) {
    const tags = []
    $dd.find('li').each((ii, vv) => {
      tags.push(prefix + ':' + $(vv).text().trim())
    })
    return tags
  }
  getFicMetadata (fetch, fic) {
    fic.link = this.link
    fic.publisher = this.publisherName
    return fetch(this.chapterIndex()).spread((meta, html) => {
      const $ = cheerio.load(html)
      const base = $('base').attr('href') || this.chapterIndex()
      const heading = $('h2.heading')
      fic.title = heading.find('a[rel!="author"]').text()
      const $author = heading.find('a[rel="author"]')
      fic.authorUrl = this.normalizeLink($author.attr('href'), base)
      fic.author = $author.text()
      const chapterList = $('ol.index').find('li')
      chapterList.each((ii, vv) => {
        const $vv = $(vv)
        const name = $vv.find('a').text().replace(/^\d+[.] /, '')
        const link = this.normalizeLink($vv.find('a').attr('href'), base)
        const created = new Date($vv.find('span.datetime').text().replace(/\((.*)\)/, '$1'))
        fic.addChapter({name, link, created})
      })
      return this.getChapter(fetch, fic.chapters[0].link)
    }).then(chapter => {
      const $ = cheerio.load(chapter.raw)
      const base = $('base').attr('href') || this.chapterIndex()
      const $meta = $('dl.meta')
      const ratings = this.tagGroup($, 'rating', $meta.find('dd.rating'))
      const warnings = this.tagGroup($, 'warning', $meta.find('dd.warnings'))
        .filter(warn => !/No Archive Warnings Apply/.test(warn))
      const category = this.tagGroup($, 'category', $meta.find('dd.category'))
      const fandom   = this.tagGroup($, 'fandom', $meta.find('dd.fandom'))
      const characters = this.tagGroup($, 'character', $meta.find('dd.character'))
      const freeform = this.tagGroup($, 'freeform', $meta.find('dd.freeform'))
      const language = 'language:' + $meta.find('dd.language').text().trim()
      fic.tags = [].concat(ratings, warnings, category, fandom, characters, freeform, language)
      const $stats = $meta.find('dl.stats')
      fic.created = new Date($stats.find('dd.published').text().trim())
      const modified = $stats.find('dd.status').text().trim()
      fic.modified = modified && new Date(modified)
      fic.words = Number($stats.find('dd.words').text().trim())
      fic.comments = Number($stats.find('dd.comments').text().trim())
      fic.kudos = Number($stats.find('dd.kudos').text().trim())
      fic.bookmarks = Number($stats.find('dd.bookmarks').text().trim())
      fic.hits = Number($stats.find('dd.hits').text().trim())
      fic.title = $('h2.title').text().trim()
      fic.description = $('.summary').find('p').html()
    })
  }

  scrapeFicMetadata (fetch, fic) {
    // There's never any reason to scrape AO3 content, AFAIK.
    return Bluebird.resolve()
  }

  getChapter (fetch, chapter) {
    return fetch(chapter).spread((meta, html) => {
      const $ = cheerio.load(html)
      if ($('p.caution').length) {
        return this.getChapter(fetch, chapter + '?view_adult=true')
      }
      const base = $('base').attr('href') || meta.finalUrl
      const $content = $('div[role="article"]')
      $content.find('h3.landmark').remove()
      const notes = $('#notes').find('p').html()
      const endNotes = $('div.end').find('p').html()
      let content = ''
      if (notes && !/\(See the end of the chapter for.*notes.*.\)/.test(notes)) {
        content += `<aside style="border: solid black 1px; padding: 1em">${notes}</aside>`
      }
      content += $content.html()
      if (endNotes) content += `<aside epub:type="endnote" style="border: solid black 1px; padding: 1em">${endNotes}</aside>`
      return {
        chapterLink: chapter,
        finalUrl: meta.finalUrl,
        base: base,
        raw: html,
        content: content
      }
    })
  }
}

module.exports = ArchiveOfOurOwn
