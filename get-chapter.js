'use strict'
module.exports = getChapter
var url = require('url')
var cheerio = require('cheerio')

function getChapter (fetch, chapter) {
  return fetch(chapter).spread(function (finalURL, html) {
    var id = url.parse(finalURL).hash || url.parse(chapter).hash || ''
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
    var authorUrl = author.attr('href')
    var authorName = author.text()
    // sv, sb
    var workTitle = $('meta[property="og:title"]').attr('content')
    var started = $('abbr.date-time')
    // qq
    if (!workTitle) workTitle = $('div.titleBar h1').text().replace(/^\[\w+\] /, '')
    if (!started.length) started = $('span.DateTime')
    return {
      chapterLink: chapter,
      finalURL: finalURL,
      base: base,
      workTitle: workTitle || '',
      author: authorName,
      authorUrl: authorUrl,
      content: content.html(),
      started: started.length ? $(started[0]).text() : ''
    }
  })
}
