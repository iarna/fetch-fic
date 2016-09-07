'use strict'
exports.getChapterList = getChapterList
exports.scrapeChapterList = scrapeChapterList
var url = require('url')
var getChapter = require('./get-chapter.js')
var cheerio = require('cheerio')
var inherits = require('util').inherits

function ChapterList () {
  Array.call(this, arguments)
}
ChapterList.prototype = {}
inherits(ChapterList, Array)

ChapterList.prototype.addChapter = function (baseName, link) {
  if (this.some(function (chap) { return chap.link === link })) return
  var name = baseName
  var ctr = 0
  while (this.some(function (chap) { return chap.name === name })) {
    name = baseName + ' (' + ++ctr + ')'
  }
  this.push({name: name, link: link})
}

function getChapterList (fetch, thread) {
  return fetch(thread.threadmarks).then(function (res) {
    return res.text()
  }).then(function (html) {
    var $ = cheerio.load(html)
    var base = $('base').attr('href') || thread.threadmarks
    var links = $('li.primaryContent.memberListItem > a')
    if (!threadMarks) threadMarks = new ChapterList()
    links.each(function () {
      var name = $(this).text().trim()
      var link = $(this).attr('href')
      threadMarks.addChapter(name, url.resolve(base, link))
    })
    return threadMarks
  })
}

function scrapeChapterList (fetch, thread, scraped) {
  return getChapter(fetch, thread.raw).then(function (chapter) {
    var $ = cheerio.load(chapter.content)
    if (!scraped) scraped = new ChapterList()
    var links = $('a.internalLink')
    if (links.length === 0) {
      scraped.addChapter(chapter.workTitle, chapter.finalURL)
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
