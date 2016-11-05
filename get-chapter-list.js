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

function getChapterList (fetch, thread, fic) {
  if (thread.known.type === 'xenforo') {
    return fetch(thread.threadmarks).spread(function (finalUrl, html) {
      var $ = cheerio.load(html)
      var base = $('base').attr('href') || thread.threadmarks
      if (!fic.title) fic.title = getXenforoTitle($)
      var chapters = $('li.primaryContent.memberListItem')
      chapters.each(function () {
        var $this = $(this)
        var $link = $this.find('a')
        var name = $link.text().trim()
        var link = normalizeLink($link.attr('href'), thread, base)
        var created = xenforoDateTime($this.find('.DateTime'))

        fic.chapters.addChapter(name, link, created)
      })
    })
  } else {
    return Bluebird.resolve()
  }
}

function scrapeChapterList (fetch, thread, fic) {
  return getChapter(fetch, normalizeLink(thread.raw, thread)).then(function (chapter) {
    if (thread.known.type === 'xenforo') {
      return scrapeXenforo(thread, fic, chapter)
    } else if (thread.known.type === 'ffn') {
      return scrapeFFN(thread, fic, chapter)
    } else {
      throw new Error('Unknown fic type: ' + thread.known.type)
    }
  })
}

function scrapeFFN (thread, fic, chapter) {
  var $ = cheerio.load(chapter.raw)
  var $dates = $('span[data-xutime]')
  if (!fic.created) {
    fic.created = new Date(Number($($dates[1]).attr('data-xutime'))*1000)
  }
  if (!fic.modified) {
    fic.modified = new Date(Number($($dates[0]).attr('data-xutime'))*1000)
  }
  if (!fic.title) {
    fic.title = $($('b.xcontrast_txt')[0]).text()
  }
  var $index = $($('#chap_select')[0])
  var $chapters = $index.find('option')
  $chapters.each(function (ii, vv) {
    var chapterName = $(vv).text().match(/^\d+[.] (.*)/)
    var chapterNum = $(vv).attr('value') || ii
    fic.addChapter(chapterName[1] || chapterNum, thread.chapterURL(chapterNum))
  })
}

function scrapeXenforo (thread, fic, chapter) {
  var $ = cheerio.load(chapter.raw)
  if (!fic.created) fic.created = xenforoDateTime($('.DateTime'))
  if (!fic.title) fic.title = getXenforoTitle($)

  var $content = cheerio.load(chapter.content)
  var links = $content('a')
  var indexLink = normalizeLink(chapter.finalURL, thread)
  if (links.length === 0) {
    fic.addChapter(chapter.title || fic.title, indexLink, chapter.created)
  } else {
    fic.addChapter('Table of Contents', indexLink, chapter.created)
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
      fic.addChapter(name, href)
    }
  })
}
