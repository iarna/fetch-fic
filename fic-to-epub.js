'use strict'
module.exports = ficToEpub
var Streampub = require('streampub')
var newChapter = Streampub.newChapter
var filenameize = require('./filenameize.js')
var sanitizeHtml = require('sanitize-html')
var ms = require('mississippi')

function ficToEpub (meta) {
  var epub = new Streampub({
    title: meta.title,
    author: meta.author,
    authorUrl: meta.authorUrl,
    description: meta.description,
    source: meta.link,
    subject: meta.tags && meta.tags.length && meta.tags.join(','),
    publisher: meta.publisher,
    published: meta.started || meta.created,
    modified: meta.modified
  })

  var title =
    '<div style="text-align: center;">' +
    '<h1>' + meta.title + '</h1>' +
    '<h3>' + meta.author + '</h3>' +
    '<p>URL: ' + '<a href="' + meta.link + '">' + meta.link + '</a></p>' +
    '</div>'
  epub.write(newChapter('Title Page', title, 0, 'top.xhtml'))
  return ms.pipeline.obj(ms.through.obj(transformChapter), epub)
}

function transformChapter (chapter, _, done) {
  var index = 1 + chapter.order
  var name = chapter.name
  var filename = filenameize('chapter-' + name) + '.xhtml'
  var content = sanitizeHtml(deimage(chapter.content))
  this.push(newChapter(name, content, index, filename))
  done()
}

function deimage (html) {
  var desmiled = html
    .replace(/<img[^>]* class="[^"]*mceSmilie1[^"]*"[^>]*>/g, '😀')
    .replace(/<img[^>]* alt="(:[)])"[^>]*>/g, '$1')
  return desmiled
}
