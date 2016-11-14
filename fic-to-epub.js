'use strict'
module.exports = ficToEpub
var Streampub = require('streampub')
var chapterFilename = require('./chapter-filename.js')
var sanitizeHtml = require('sanitize-html')
var ms = require('mississippi')
var url = require('url')
var fs = require('fs')

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

  if (meta.cover) {
    epub.write(Streampub.newCoverImage(fs.createReadStream(meta.cover)))
  } else {
    var title =
      '<div style="text-align: center;">' +
      '<h1>' + meta.title + '</h1>' +
      '<h3>' + meta.author + '</h3>' +
      '<p>URL: ' + '<a href="' + meta.link + '">' + meta.link + '</a></p>' +
      '</div>'
    epub.write(Streampub.newChapter('Title Page', title, 0, 'top.xhtml'))
  }
  return ms.pipeline.obj(ms.through.obj(transformChapter(meta)), epub)
}

function andMatches (pattern) {
  return function (item) { return pattern.test(item) }
}

function transformChapter (meta) {
  return function (chapter, _, done) {
    if (chapter.image) {
      this.push(Streampub.newFile(chapter.filename, chapter.content))
      return done()
    }
    var index = chapter.order != null && (1 + chapter.order)
    var name = chapter.name || chapter.order && "Chapter " + index
    var filename = chapterFilename(chapter)
    var content = sanitizeHtml(
      (name ? '<title>' + name.replace(/&/g,'&amp;').replace(/</g, '&lt;') + '</title>' : '') +
      '<article>' + chapter.content + '</article>', meta.site.sanitizeHtmlConfig())
    this.push(Streampub.newChapter(name, content, index, filename))
    done()
  }
}
