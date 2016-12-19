'use strict'
module.exports = ficToHTML
const fs = require('fs')
const promisify = require('./promisify')
const mkdirp = promisify(require('mkdirp'))
const writeFile = promisify(fs.writeFile)
const commaNumber = require('comma-number')
const XHTMLToArchive = require('./xhtml-to-archive')
const sanitizeHtml = require('sanitize-html')
const filenameize = require('./filenameize.js')
const path = require('path')
const Transform = require('readable-stream').Transform

function ficToHTML (fic, filename) {
  const ready = mkdirp(filename).then(() => writeIndex(fic, filename))
  return new Transform({objectMode: true, transform: transformChapter(fic, filename, ready)})
}

function chapterFilename (chapter) {
  const index = 1 + chapter.order
  const name = chapter.name || "Chapter " + index
  return chapter.filename && chapter.filename.replace('xhtml', 'html') || filenameize('chapter-' + name) + '.html'
}

function transformChapter (fic, dirname, ready) {
  return (chapter, _, done) => {
    ready.then(() => {
      const filename = path.join(dirname, chapterFilename(chapter))
      if (chapter.image) return writeFile(filename, chapter.content)
      const index = chapter.order != null && (1 + chapter.order)
      const content = XHTMLToArchive(sanitizeHtml(chapter.content, fic.site.sanitizeHtmlConfig()))
      return writeFile(filename, content)
    }).catch(done).then(() => done())
  }
}

function writeIndex (fic, dirname) {
  let index = `<html><head><title>${fic.title}</title></head><body>`
  index += `<h1 style="text-align: center">${fic.title}</h1>\n`
  if (fic.cover) index += `<img src="${fic.cover}">\n`
  if (fic.description) index += `<div>${fic.description}</div>\n\n`
  if (fic.created) index += `First Published: ${fic.created}<br>\n`
  if (fic.modified) index += `Last Updated: ${fic.modified}<br>\n`
  if (fic.tags && fic.tags.length) index += `Tags: <em>${fic.tags.join(', ')}</em><br>\n`
  if (fic.words) index += `Words: ${commaNumber(fic.words)}<br>\n`
  index += '\n<ol>\n'
  for (let chapter of fic.chapters) {
    index += `<li><a href="${chapter.link || chapter.fetchFrom}">${chapter.name}</a>`
    const author = chapter.author || fic.author
    const authorUrl = chapter.authorUrl || fic.authorUrl
    if (author !== fic.author) {
      const authorBB = authorUrl
        ? `<a href="${authorUrl}">${author}</a>`
        : author
      index += ` (${authorBB})`
    }
    if (chapter.description) {
      index += ' – ' + chapter.description
    }
    if (chapter.words) {
      index += ` (${chapter.words} words)`
    }
    index += `</li>\n`
  }
  index += '</ol></body></html>\n'

  return writeFile(path.join(dirname, 'index.html'), index)
}
