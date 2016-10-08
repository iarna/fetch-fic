'use strict'
exports.getChapterList = getChapterList
exports.scrapeChapterList = scrapeChapterList
var url = require('url')
var getChapter = require('./get-chapter.js')
var cheerio = require('cheerio')
var inherits = require('util').inherits
var xenforoDateTime = require('./datetime.js')
var normalizeLink = require('./normalize-link.js')

function ChapterList () {
  Array.call(this, arguments)
  this.workTitle = ''
  this.created = ''
}
inherits(ChapterList, Array)

ChapterList.prototype.addChapter = function (baseName, link, created) {
  if (this.some(function (chap) { return chap.link === link })) return
  var name = baseName
  var ctr = 0
  while (this.some(function (chap) { return chap.name === name })) {
    name = baseName + ' (' + ++ctr + ')'
  }
  if (created && !this.created) this.created = created
  this.push({order: this.length, name: name, link: link, created: created})
}

function getWorkTitle ($) {
  // sv, sb
  try {
    return $('meta[property="og:title"]').attr('content').replace(/Threadmarks for: /i, '')
  } catch (_) {
    // qq
    try {
      return $('div.titleBar h1').text().replace(/^\[\w+\] /, '')
    } catch (_) {
      return
    }
  }
}

function getChapterList (fetch, thread, threadMarks) {
  return fetch(thread.threadmarks).spread(function (finalUrl, html) {
    var $ = cheerio.load(html)
    var base = $('base').attr('href') || thread.threadmarks
    if (!threadMarks) threadMarks = new ChapterList()
    if (!threadMarks.workTitle) threadMarks.workTitle = getWorkTitle($)
    var chapters = $('li.primaryContent.memberListItem')
    chapters.each(function () {
      var $this = $(this)
      var $link = $this.find('a')
      var name = $link.text().trim()
      var link = $link.attr('href')
      var created = xenforoDateTime($this.find('.DateTime'))
      threadMarks.addChapter(name, normalizeLink(link, thread, base), created)
    })
    return threadMarks
  })
}

function scrapeChapterList (fetch, thread, scraped) {
  return getChapter(fetch, normalizeLink(thread.raw, thread)).then(function (chapter) {
    var $ = cheerio.load(chapter.raw)
    if (!scraped) scraped = new ChapterList()
    if (!scraped.created) scraped.created = xenforoDateTime($('.DateTime'))
    if (!scraped.workTitle) scraped.workTitle = getWorkTitle($)

    var $content = cheerio.load(chapter.content)
    var links = $content('a') // a.internalLink (not just internal links, allow external omake)
    var indexLink = normalizeLink(chapter.finalURL, thread)
    if (links.length === 0) {
      scraped.addChapter(chapter.title || scraped.workTitle, indexLink, chapter.created)
    } else {
      scraped.addChapter('Index', indexLink, chapter.created)
    }
    links.each(function (_, link) {
      var $link = $content(link)
      var href = normalizeLink($link.attr('href'), thread, chapter.base)
      var name = $link.text().trim()
      // if the name is a link, try to find one elsewhere
      if (/^https?:[/][/]/.test(name)) {
        var next = $link[0].prev
        var nextText = $content(next).text().trim()
        if (next.type === 'text' && nextText === '') {
          next = next.prev
          nextText = $content(next).text().trim()
        }
        if (next.type !== 'text') {
          next = next.prev
          nextText = $content(next).text().trim()
        }
        if (next.type == 'text') {
          name = nextText
        }
      }
      if (/^[/]threads[/]|^[/]index.php[?]topic|^[/]posts[/]/.test(url.parse(href).path)) {
        scraped.addChapter(name, href)
      }
    })
    return scraped
  })
}
