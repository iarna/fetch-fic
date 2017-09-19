'use strict'
const Bluebird = require('bluebird')
const url = require('url')
const Site = use('site')
const cache = use('cache')
const moment = require('moment')

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
    this.link = this.link.replace(/[/]works[/](\d+).*?$/, '/works/$1')
    this.publisher = 'archiveofourown.org'
    this.publisherName = 'Archive of Our Own'
    const siteUrl = url.parse(siteUrlStr)
    const path = siteUrl.pathname || siteUrl.path || ''
    const ficMatch = path.match(/^[/]works[/](\d+)/)
    this.workId = ficMatch[1]
  }

  normalizeLink (href, base) {
    return super.normalizeLink(href, base).replace(/#.*$/, '')
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
      if ($('.error-503-maintenance').length) {
        const err = new Error($('#main').text().trim().split(/\n/).map(l => l.trim()).join('\n'))
        err.link = this.chapterIndex()
        err.code = 503
        err.site = this.publisherName
        return cache.clearUrl(err.link).then(() => {
          throw err
        })
      }
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
        const created = moment.utc($vv.find('span.datetime').text(), '(YYYY-MM-DD)')
        fic.addChapter({name, link, created})
      })
      return fic.chapters[0].getContent(fetch)
    }).then(chapter => {
      if (chapter.$('.error-503-maintenance').length) {
        const err = new Error(chapter.$('#main').text().trim().split(/\n/).map(l => l.trim()).join('\n'))
        err.link = chapter.fetchWith()
        err.code = 503
        err.site = this.publisherName
        return cache.clearUrl(err.link).then(() => {
          throw err
        })
      }
      const $meta = chapter.$('dl.meta')
      const ratings = this.tagGroup(chapter.$, 'rating', $meta.find('dd.rating'))
      const warnings = this.tagGroup(chapter.$, 'warning', $meta.find('dd.warnings'))
        .filter(warn => !/No Archive Warnings Apply/.test(warn))
      const category = this.tagGroup(chapter.$, 'category', $meta.find('dd.category'))
      const fandom = this.tagGroup(chapter.$, 'fandom', $meta.find('dd.fandom'))
      const relationship = this.tagGroup(chapter.$, '', $meta.find('dd.relationship'))
        .filter(r => r !== ':Friendship - Relationship')
        .map(r => r.replace(/^:/, /[/]/.test(r) ? 'ship:' : 'friendship:'))
      const characters = this.tagGroup(chapter.$, 'character', $meta.find('dd.character'))
      const freeform = this.tagGroup(chapter.$, 'freeform', $meta.find('dd.freeform'))
      const language = 'language:' + $meta.find('dd.language').text().trim()
      fic.tags = [].concat(ratings, warnings, category, fandom, relationship, characters, freeform, language)
      const $stats = $meta.find('dl.stats')
      const chapterCounts = $stats.find('dd.chapters').text().trim().split('/')
      const written = chapterCounts[0]
      const planned = chapterCounts[1]
      if (written === planned) {
        if (written === '1') {
          fic.tags.push('status:one-shot')
        } else {
          fic.tags.push('status:complete')
        }
      }
      fic.created = moment.utc($stats.find('dd.published').text().trim())
      const modified = $stats.find('dd.status').text().trim()
      fic.modified = modified && moment.utc(modified)
      fic.words = Number($stats.find('dd.words').text().trim())
      fic.comments = Number($stats.find('dd.comments').text().trim())
      fic.kudos = Number($stats.find('dd.kudos').text().trim())
      fic.bookmarks = Number($stats.find('dd.bookmarks').text().trim())
      fic.hits = Number($stats.find('dd.hits').text().trim())
      fic.title = chapter.$('h2.title').text().trim()
      fic.description = (chapter.$('.summary').find('.userstuff').html() || '').replace(/<p>/g, '\n<p>').replace(/^\s+|\s+$/g, '')
    })
  }

  getChapter (fetch, chapterInfo) {
    return fetch(chapterInfo.fetchWith()).spread((meta, html) => {
      const ChapterContent = use('chapter-content')
      const chapter = new ChapterContent(chapterInfo, {html, site: this})
      if (chapter.$('.error-503-maintenance').length) {
        const err = new Error(chapter.$('#main').text().trim().split(/\n/).map(l => l.trim()).join('\n'))
        err.link = chapter.fetchWith()
        err.code = 503
        err.site = this.publisherName
        return cache.clearUrl(err.link).then(() => {
          throw err
        })
      }
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
