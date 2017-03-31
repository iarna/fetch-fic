'use strict'
const Bluebird = require('bluebird')
const url = require('url')
const Site = use('site')

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
    fic.chapterHeadings = true
    return fetch(this.chapterIndex()).spread((meta, html) => {
      const cheerio = require('cheerio')
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
      return fic.chapters[0].getContent(fetch)
    }).then(chapter => {
      const $meta = chapter.$('dl.meta')
      const ratings = this.tagGroup(chapter.$, 'rating', $meta.find('dd.rating'))
      const warnings = this.tagGroup(chapter.$, 'warning', $meta.find('dd.warnings'))
        .filter(warn => !/No Archive Warnings Apply/.test(warn))
      const category = this.tagGroup(chapter.$, 'category', $meta.find('dd.category'))
      const fandom = this.tagGroup(chapter.$, 'fandom', $meta.find('dd.fandom'))
      const characters = this.tagGroup(chapter.$, 'character', $meta.find('dd.character'))
      const freeform = this.tagGroup(chapter.$, 'freeform', $meta.find('dd.freeform'))
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
      fic.title = chapter.$('h2.title').text().trim()
      fic.description = chapter.$('.summary').find('.userstuff').html().replace(/<p>/g, '\n<p>').replace(/^\s+|\s+$/g, '')
    })
  }

  scrapeFicMetadata (fetch, fic) {
    return Bluebird.resolve()
  }

  getChapter (fetch, chapterInfo) {
    return fetch(chapterInfo.fetchWith()).spread((meta, html) => {
      const ChapterContent = use('chapter-content')
      const chapter = new ChapterContent(chapterInfo, {html, site: this})
      if (chapter.$('p.caution').length) {
        chapterInfo.fetchFrom = chapterInfo.fetchWith() + '?view_adult=true'
        return this.getChapter(fetch, chapterInfo)
      }
      chapter.base = chapter.$('base').attr('href') || meta.finalUrl
      if (meta.finalUrl !== chapter.link) {
        chapter.fetchFrom = chapter.link
        chapter.link = meta.finalUrl
      }
      const $content = chapter.$('div[role="article"]')
      $content.find('h3.landmark').remove()

      const notes = chapter.$('#notes').find('.userstuff').html()
      const endNotes = chapter.$('div.end').find('.userstuff').html()
      let content = ''
      if (notes && !/\(See the end of the chapter for.*notes.*.\)/.test(notes)) {
        content += `<aside style="border: solid black 1px; padding: 1em">${notes}</aside>`
      }
      content += $content.html()
      if (endNotes) content += `<aside epub:type="endnote" style="border: solid black 1px; padding: 1em">${endNotes}</aside>`
      chapter.content = content
      return chapter
    })
  }
}

module.exports = ArchiveOfOurOwn
