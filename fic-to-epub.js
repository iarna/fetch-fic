'use strict'
module.exports = ficToEpub
var url = require('url')
var Streampub = require('streampub')
var newChapter = Streampub.newChapter
var PassThrough = require('readable-stream').PassThrough
var filenameize = require('./filenameize.js')
var sanitizeHtml = require('sanitize-html')
var ms = require('mississippi')

var mime = 'application/xhtml+xml'

function ficToEpub (meta) {
  var result = new PassThrough()
  var epub = new Streampub()

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
  epub.write(newChapter(0, 'Title Page', 'top.xhtml', title))

  return ms.pipeline.obj(ms.through.obj(transformChapter), epub)
}

function transformChapter (chapter, _, done) {
  var index = 1 + chapter.order
  var name = chapter.name
  var filename = filenameize('chapter-' + name) + '.xhtml'
  var content = sanitizeHtml(deimage(chapter.content))
  this.push(newChapter(index, name, filename, content))
  done()
}

function deimage (html) {
  var desmiled = html
    .replace(/<img[^>]* class="[^"]*mceSmilie1[^"]*"[^>]*>/g, '😀')
    .replace(/<img[^>]* alt="(:[)])"[^>]*>/g, '$1')
  return desmiled
}
