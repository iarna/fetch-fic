'use strict'
module.exports = ficToEpub
var Streampub = require('streampub')
var chapterFilename = require('./chapter-filename.js')
var sanitizeHtml = require('sanitize-html')
var ms = require('mississippi')
var url = require('url')
var fs = require('fs')
var commaNumber = require('comma-number')
var html = require('html-template-tag')

function ficToEpub (meta) {
  var epub = new Streampub({
    id: meta.id,
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
    let titleContent = ''
    titleContent += html`
<head>
<title>${meta.title}</title>
<style>
  h1, h3 { text-align: center; }
  table {
    border: 3px double #ccc;
    padding: 0.5em;
  }
  th {
    text-align: right;
    font-weight: bold;
    text-decoration: underline;
    white-space: nowrap;
    vertical-align: top;
  }
  th:after {
    content: ":";
  }
</style></head>`
    titleContent += html`<h1>${meta.title}</h1>`
    const author = meta.authorUrl ? html`<a href="${meta.authorUrl}">${meta.author}</a>` : meta.author
    titleContent += `<h3>by ${author}</h3>`
    titleContent += html`<table>`
    titleContent += html`<tr><th>Source</th><td><a href="${meta.link}">${meta.link}</a></td></tr>`
    if (meta.created) titleContent += html`<tr><th>Published</th><td>${meta.created}</td></tr>`
    if (meta.modified) titleContent += html`<tr><th>Updated</th><td>${meta.modified}</td></tr>`
    if (meta.tags && meta.tags.length) titleContent += html`<tr><th>Tags</th><td><em>${meta.tags.join(', ')}</em></td></tr>`
    if (meta.words) titleContent += html`<tr><th>Words</th><td>${commaNumber(meta.words)}</td></tr>`
    titleContent += `</table>`
    if (meta.description) titleContent += `<div>${meta.description}</div>`
    var titlePage = `${titleContent}`
    epub.write(Streampub.newChapter('Title Page', titlePage, 0, 'top.xhtml'))
  }
  return ms.pipeline.obj(ms.through.obj(transformChapter(meta)), epub)
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
    var toSanitize = (name ? html`<title>${name}</title></head>` : '') +
      '<section epub:type="chapter">' + chapter.content + '</section>'
    var content = sanitizeHtml(toSanitize, meta.site.sanitizeHtmlConfig())
    this.push(Streampub.newChapter(name, content, index, filename))
    done()
  }
}
