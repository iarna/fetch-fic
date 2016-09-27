'use strict'
exports.getChapterList = getChapterList
exports.scrapeChapterList = scrapeChapterList
var url = require('url')
var getChapter = require('./get-chapter.js')
var cheerio = require('cheerio')
var inherits = require('util').inherits
var xenforoDateTime = require('./datetime.js')

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
      return threadMarks.workTitle = $('div.titleBar h1').text().replace(/^\[\w+\] /, '')
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
      threadMarks.addChapter(name, url.resolve(base, link), created)
    })
    return threadMarks
  })
}

function scrapeChapterList (fetch, thread, scraped) {
  return getChapter(fetch, thread.raw).then(function (chapter) {
    var $ = cheerio.load(chapter.content)
    if (!scraped) scraped = new ChapterList()
    if (!scraped.created) scraped.created = xenforoDateTime($('.DateTime'))
    if (!scraped.workTitle) threadMarks.workTitle = getWorkTitle($)

    var links = $('a') // a.internalLink (not just internal links, allow external omake)
    if (links.length === 0) {
      scraped.addChapter(chapter.title, chapter.finalURL)
    } else {
      scraped.addChapter('Index', chapter.finalURL)
    }
    links.each(function (_, link) {
      var $link = $(link)
      var href = url.resolve(chapter.base, $link.attr('href'))
      var name = $link.text().trim()
      if (/^[/]threads[/]|^[/]index.php[?]topic|^[/]posts[/]/.test(url.parse(href).path)) {
        scraped.addChapter(name, href)
      }
    })
    return scraped
  })
}
