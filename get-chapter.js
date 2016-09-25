'use strict'
module.exports = getChapter
var url = require('url')
var cheerio = require('cheerio')

function getChapter (fetch, chapter) {
  return fetch(chapter).spread(function (finalURL, html) {
    var chapterHash = url.parse(chapter).hash
    var parsed = url.parse(finalURL)
    var id
    if (/^#post/.test(chapterHash)) {
      id = chapterHash || parsed.hash || ''
    } else {
      id = parsed.hash || chapterHash || ''
    }
    if (id) {
      parsed.hash = id
      finalURL = url.format(parsed)
    }
    var $ = cheerio.load(html)
    var content
    if (id !== '') {
      content = $(id + ' article')
    } else {
      content = $($('article')[0])
    }
    if (content.length === 0) {
      var error = $('div.errorPanel')
      if (error.length === 0) {
        throw new Error('No chapter found at ' + chapter)
      } else {
        throw new Error('Error fetching ' + chapter + ': ' + error.text().trim())
      }
    }
    var base = $('base').attr('href') || finalURL
    var author = $($('a.username')[0])
    var authorUrl = url.resolve(base, author.attr('href'))
    var authorName = author.text()
    // sv, sb
    var workTitle = $('meta[property="og:title"]').attr('content')
    var threadDate = $('abbr.DateTime')
    // qq
    if (!workTitle) workTitle = $('div.titleBar h1').text().replace(/^\[\w+\] /, '')
    if (!threadDate.length) threadDate = $('span.DateTime')
    if (threadDate.length) {
      var started = +($(threadDate).attr('data-time')) || $(threadDate).attr('datestring')
    }
    return {
      chapterLink: chapter,
      finalURL: finalURL,
      base: base,
      workTitle: workTitle || '',
      author: authorName,
      authorUrl: authorUrl,
      content: content.html(),
      started: new Date(started || Date.now())
    }
  })
}
