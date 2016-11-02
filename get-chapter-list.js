'use strict'
exports.getChapterList = getChapterList
exports.scrapeChapterList = scrapeChapterList
var url = require('url')
var getChapter = require('./get-chapter.js')
var cheerio = require('cheerio')
var inherits = require('util').inherits
var xenforoDateTime = require('./datetime.js')
var normalizeLink = require('./normalize-link.js')
var Bluebird = require('bluebird')

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

function getXenforoTitle ($) {
  // sv, sb
  try {
    return $('meta[property="og:title"]').attr('content').replace(/Threadmarks for: /i, '')
  } catch (_) {
    // qq
    try {
      return $('div.titleBar h1').text().replace(/^\[\w+\] /, '').replace(/Threadmarks for: /i, '')
    } catch (_) {
      return
    }
  }
}

function getChapterList (fetch, thread, threadMarks) {
  if (thread.known.type === 'xenforo') {
    return fetch(thread.threadmarks).spread(function (finalUrl, html) {
      var $ = cheerio.load(html)
      var base = $('base').attr('href') || thread.threadmarks
      if (!threadMarks) threadMarks = new ChapterList()
      if (!threadMarks.workTitle) threadMarks.workTitle = getXenforoTitle($)
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
  } else {
    return Bluebird.resolve(new ChapterList())
  }
}

function scrapeChapterList (fetch, thread, scraped) {
  if (!scraped) scraped = new ChapterList()
  return getChapter(fetch, normalizeLink(thread.raw, thread)).then(function (chapter) {
    if (thread.known.type === 'xenforo') {
      return scrapeXenforo(thread, scraped, chapter)
    } else if (thread.known.type === 'ffn') {
      return scrapeFFN(thread, scraped, chapter)
    } else {
      throw new Error('Unknown fic type: ' + thread.known.type)
    }
  })
}

function scrapeFFN (thread, scraped, chapter) {
  var $ = cheerio.load(chapter.raw)
  var $dates = $('span[data-xutime]')
  if (!scraped.created) {
    scraped.created = new Date(Number($($dates[1]).attr('data-xutime'))*1000)
  }
  if (!scraped.modified) {
    scraped.modified = new Date(Number($($dates[0]).attr('data-xutime'))*1000)
  }
  if (!scraped.workTitle) {
    scraped.workTitle = $($('b.xcontrast_txt')[0]).text()
  }
  var $index = $($('#chap_select')[0])
  var $chapters = $index.find('option')
  $chapters.each(function (ii, vv) {
    var chapterName = $(vv).text().match(/^\d+[.] (.*)/)
    var chapterNum = $(vv).attr('value') || ii
    scraped.addChapter(chapterName[1] || chapterNum, thread.chapterURL(chapterNum))
  })
  return scraped
}

function scrapeXenforo (thread, scraped, chapter) {
  var $ = cheerio.load(chapter.raw)
  if (!scraped.created) scraped.created = xenforoDateTime($('.DateTime'))
  if (!scraped.workTitle) scraped.workTitle = getXenforoTitle($)

  var $content = cheerio.load(chapter.content)
  var links = $content('a')
  var indexLink = normalizeLink(chapter.finalURL, thread)
  if (links.length === 0) {
    scraped.addChapter(chapter.title || scraped.workTitle, indexLink, chapter.created)
  } else {
    scraped.addChapter('Table of Contents', indexLink, chapter.created)
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
    if (/^[/](?:threads|posts|s|art)[/]|^[/]index.php[?]topic/.test(url.parse(href).path)) {
      scraped.addChapter(name, href)
    }
  })
  return scraped
}
