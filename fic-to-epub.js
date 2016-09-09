'use strict'
module.exports = ficToEpub
var url = require('url')
var Streampub = require('streampub')
var newChapter = Streampub.newChapter
var PassThrough = require('readable-stream').PassThrough
var filenameize = require('./filenameize.js')
var sanitizeHtml = require('sanitize-html')
var through = require('through2').obj

var mime = 'application/xhtml+xml'

function ficToEpub (fic) {
  var result = new PassThrough()
  var meta
  var epub = new Streampub()
  fic.pipe(through(function (chapter, _, done) {
    if (!meta) {
      meta = {}
      meta.title = chapter.workTitle
      meta.author = chapter.author
      meta.authorUrl = chapter.authorUrl
      meta.started = chapter.started
      meta.link = chapter.finalURL
      meta.description = 'Fetched from ' + meta.link
      meta.creation = chapter.started && new Date(chapter.started)
      epub.emit('meta', meta)
      epub.setTitle(meta.title)
      epub.setAuthor(meta.author)
      epub.setDescription(meta.description)
      if (meta.creation) epub.setPublished(meta.creation)
      epub.setSource(meta.link)
      var title =
        '<div style="text-align: center;">' +
        '<h1>' + meta.title + '</h1>' +
        '<h3>' + meta.author + '</h3>' +
        '<p>URL: ' + '<a href="' + meta.link + '">' + meta.link + '</a></p>' +
        '</div>'
      this.push(newChapter(0, 'Title Page', 'top.xhtml', title))
    }
    var index = 1 + chapter.order
    var name = chapter.name
    var filename = filenameize('chapter-' + name) + '.xhtml'
    var content = sanitizeHtml(deimage(chapter.content))
    this.push(newChapter(index, name, filename, content))
    done()
  })).pipe(epub)

  return epub
}

function deimage (html) {
  var desmiled = html
    .replace(/<img[^>]* class="[^"]*mceSmilie1[^"]*"[^>]*>/g, '😀')
    .replace(/<img[^>]* alt="(:[)])"[^>]*>/g, '$1')
  return desmiled
}
