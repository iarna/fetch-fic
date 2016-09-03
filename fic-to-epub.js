'use strict'
module.exports = ficToEpub
var EpubGenerator = require('epub-generator')
var sanitizeHtml = require('sanitize-html')
var tidy = require('htmltidy').tidy
var PassThrough = require('readable-stream').PassThrough
var filenameize = require('./filenameize.js')

var tidyOpt = {'output-xhtml': true, doctype: 'strict', 'numeric-entities': true}
var mime = 'application/xhtml+xml'

function ficToEpub (fic) {
  var result = new PassThrough()
  result.author = null
  result.title = null
  result.description = null
  result.creation = null
  result.link = null
  result.filename = null
  var epub
  function readMeta () {
    var chapter = fic.read()
    if (chapter == null) return fic.once('readable', readMeta)
    result.title = chapter.workTitle
    result.author = chapter.author
    result.authorUrl = chapter.authorUrl
    result.started = chapter.started
    result.link = chapter.finalURL
    result.description = 'Fetched from ' + result.link
    result.creation = chapter.started && new Date(chapter.started)
    result.emit('meta', result)
    epub = new EpubGenerator({
      author: result.author,
      title: result.title,
      description: result.description,
      date: result.creation
    })
    epub.pipe(result)
    epub.once('error', function (err) {
      result.emit('error', err)
    })
    var toc =
      '<div style="text-align: center;">' +
      '<h1>' + result.title + '</h1>' +
      '<h3>' + result.author + '</h3>' +
      '<p>URL: ' + '<a href="' + result.link + '">' + result.link + '</a></p>' +
      '</div>'
    tidy(toc, tidyOpt, function (err, html) {
      if (err) return result.emit('error', err)
      epub.add('top.html', html, {mimetype: mime, toc: true, title: 'Title Page'})
      addChapter(chapter)
    })
  }
  function readMore () {
    var chapter = fic.read()
    if (chapter == null) return fic.once('readable', readMeta)
    addChapter(chapter)
  }
  var done = false
  var addingChapters = 0
  function addChapter (chapter) {
    ++addingChapters
    tidy(sanitizeHtml(desmiley(chapter.content)), tidyOpt, function (err, html) {
      --addingChapters
      if (err) return result.emit('error', err)
      var name = chapter.name
      epub.add(filenameize('chapter-' + name) + '.html', html, {
        mimetype: mime,
        toc: true,
        title: name
      })
      if (done) {
        finish()
      } else {
        readMore()
      }
    })
  }
  fic.once('end', function () {
    done = true
    finish()
  })
  function finish () {
    // because this is async it's possible for fic's end event to fire
    // BEFORE we've finished adding chapters, so we have to track that by
    // hand.
    if (addingChapters) return
    if (epub) {
      epub.end()
    } else {
      result.emit('error', new Error('No fic records found'))
    }
  }
  readMeta()
  return result
}

function desmiley (html) {
  var desmiled = html
    .replace(/<img[^>]* class="[^"]*mceSmilie1[^"]*"[^>]*>/g, '😀')
    .replace(/<img[^>]* alt="(:[)])"[^>]*>/g, '$1')
  return desmiled
}
