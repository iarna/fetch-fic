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
    var $message
    if (id !== '') {
      $message = $('li.message#' + id.slice(1))
    } else {
      $message = $($('li.message')[0])
    }
    var $content = $message.find('article')
    if ($content.length === 0) {
      var $error = $('div.errorPanel')
      if ($error.length === 0) {
        if (noCache) {
          throw new Error('No chapter found at ' + chapter)
        } else {
          return getChapter(fetch, chapter, true)
        }
      } else {
        throw new Error('Error fetching ' + chapter + ': ' + $error.text().trim())
      }
    }
    $content.find('.quoteExpand').remove()
    var $spoiler = $content.find('.bbCodeSpoilerContainer')
    $spoiler.attr('style', 'border: solid black 1px')
    $spoiler.find('.bbCodeSpoilerButton').remove()
    var base = $('base').attr('href') || finalURL
    var $author = $($message.find('a.username')[0])
    var authorUrl = url.resolve(base, $author.attr('href'))
    var authorName = $author.text()
    var messageDate = xenforoDateTime($message.find('a.datePermalink .DateTime'))
    return {
      chapterLink: chapter,
      finalURL: finalURL,
      base: base,
      author: authorName,
      authorUrl: authorUrl,
      created: messageDate,
      raw: html,
      content: $content.html()
        .replace(/<span style="color: #ffffff">([\s\S]*?)<\/span>/g, '<strong>$1</strong>')
        .replace(/<span style="color: #ffcc99">([\s\S]*?)<\/span>/g, '<em>$1</em>')
        .replace(/<span style="color: #99ffff">([\s\S]*?)<\/span>/g, '<em>$1</em>')
        .replace(/<span style="color: #9999ff">([\s\S]*?)<\/span>/g, '<span style="font-family: fantasy;font-style: italic">$1</span>')
        .replace(/^\s*<blockquote[^>]*>([\s\S]+)<[/]blockquote>\s*$/, '$1')
    }
  })
}
