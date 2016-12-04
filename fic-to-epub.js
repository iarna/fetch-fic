'use strict'
module.exports = ficToEpub
const Streampub = require('streampub')
const chapterFilename = require('./chapter-filename.js')
const sanitizeHtml = require('sanitize-html')
const ms = require('mississippi')
const url = require('url')
const fs = require('fs')
const commaNumber = require('comma-number')
const html = require('html-template-tag')

function ficToEpub (meta) {
  const epub = new Streampub({
    id: meta.id,
    title: meta.title,
    author: meta.author,
    authorUrl: meta.authorUrl,
    description: meta.description,
    source: meta.link,
    subject: meta.tags && meta.tags.length && meta.tags.join(','),
    publisher: meta.publisher,
    published: meta.started || meta.created,
    modified: meta.modified,
    includeTOC: meta.includeTOC,
    numberTOC: meta.numberTOC
  })

  if (meta.cover && !/:/.test(meta.cover)) {
    epub.write(Streampub.newCoverImage(fs.createReadStream(meta.cover)))
  } else {
    let titleContent = ''
    titleContent += html`
<html xmlns:epub="http://www.idpf.org/2007/ops">
<head>
<title>${meta.title}</title>
<style>
  h1, h3 { text-align: center; }
  table {
    border: 3px double #ccc;
    padding: 0.5em;
    margin-left: auto;
    margin-right: auto;
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
</style></head><body epub:type="cover titlepage">`
    titleContent += html`<section epub:type="title"><h1>${meta.title}</h1></section>`
    if (meta.author) {
      const author = meta.authorUrl ? html`<a href="${meta.authorUrl}">${meta.author}</a>` : meta.author
      titleContent += `<h3>by <span epub:type="credits">${author}</span></h3>`
    }
    titleContent += html`<table>`
    if (meta.link) {
      const wrappableLink = meta.link.replace(/(.....)/g, '$1<wbr>')
      titleContent += `<tr><th>Source</th><td><a href="${meta.link}">${wrappableLink}</a></td></tr>`
    }
    if (meta.created) titleContent += html`<tr><th>Published</th><td>${meta.created}</td></tr>`
    if (meta.modified) titleContent += html`<tr><th>Updated</th><td>${meta.modified}</td></tr>`
    if (meta.tags && meta.tags.length) {
      titleContent += html`<tr><th>Tags</th><td><section epub:type="keywords"><em>${meta.tags.join(', ')}</em></section></td></tr>`
    }
    if (meta.words) titleContent += html`<tr><th>Words</th><td>${commaNumber(meta.words)}</td></tr>`
    titleContent += `</table>`
    if (meta.description) titleContent += `<section epub:type="abstract"><p>${meta.description}</p></section>`
    titleContent += `</body>`
    const titlePage = `${titleContent}`
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
    const index = chapter.order != null && (1 + chapter.order)
    const name = chapter.name
    const filename = chapterFilename(chapter)
    const toSanitize = '<html xmlns:epub="http://www.idpf.org/2007/ops">' +
      (name ? html`<title>${name}</title></head>` : '') +
      '<section epub:type="chapter">' + chapter.content + '</section>' +
      '</html>'
    const content = sanitizeHtml(toSanitize, meta.site.sanitizeHtmlConfig())
    this.push(Streampub.newChapter(name, content, index, filename))
    done()
  }
}
