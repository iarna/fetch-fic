'use strict'
module.exports = getChapter
var url = require('url')
var cheerio = require('cheerio')
var xenforoDateTime = require('./datetime.js')

function getChapter (fetch, chapter, noCache) {
  return fetch(chapter, noCache).spread(function (finalURL, html) {
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
        if (noCache) {
          throw new Error('No chapter found at ' + chapter)
        } else {
          return getChapter(fetch, chapter, true)
        }
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
    var threadDate = xenforoDateTime($('.DateTime'))
    return {
      chapterLink: chapter,
      finalURL: finalURL,
      base: base,
      author: authorName,
      authorUrl: authorUrl,
      started: started
    }
  })
}
