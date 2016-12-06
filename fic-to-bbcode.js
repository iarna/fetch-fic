'use strict'
module.exports = ficToBbcode
const fs = require('fs')
const ms = require('mississippi')
const promisify = require('./promisify')
const mkdirp = promisify(require('mkdirp'))
const writeFile = promisify(fs.writeFile)
const commaNumber = require('comma-number')
const HTMLToBBCode = require('./html-to-bbcode')
const sanitizeHtml = require('sanitize-html')
const filenameize = require('./filenameize.js')
const path = require('path')

function ficToBbcode (fic, filename) {
  const ready = mkdirp(filename).then(() => writeIndex(fic, filename))
  return ms.through.obj(transformChapter(fic, filename, ready))
}

function chapterFilename (chapter) {
  const index = 1 + chapter.order
  const name = chapter.name || "Chapter " + index
  return chapter.filename && chapter.filename.replace('xhtml', 'bbcode') || filenameize('chapter-' + name) + '.bbcode'
}

function transformChapter (fic, dirname, ready) {
  return function (chapter, _, done) {
    ready.then(() => {
      const filename = path.join(dirname, chapterFilename(chapter))
      if (chapter.image) return writeFile(filename, chapter.content)
      const index = chapter.order != null && (1 + chapter.order)
      const content = HTMLToBBCode(sanitizeHtml(chapter.content, fic.site.sanitizeHtmlConfig()))
      return writeFile(filename, content)
    }).catch(done).then(() => done())
  }
}

function writeIndex (fic, dirname) {
  const indexHTML = Promise.resolve(fic.description && HTMLToBBCode(fic.description)).then(ficDescription => {
    let index = `[center][b][size=7]${fic.title}[/size][/b][/center]\n\n`
    if (fic.cover) index += `[img]${fic.cover}[/img]\n`
    if (ficDescription) index += `${ficDescription}\n\n`
    if (fic.created) index += `First Published: ${fic.created}\n`
    if (fic.modified) index += `Last Updated: ${fic.modified}\n`
    if (fic.tags && fic.tags.length) index += `Tags: [i]${fic.tags.join(', ')}[/i]\n`
    if (fic.words) index += `Words: ${commaNumber(fic.words)}\n`
    index += '\n[list]\n'
    for (let chapter of fic.chapters) {
      index += `[*] [url=${chapter.link}]${chapter.name}[/url]`
      const author = chapter.author || fic.author
      const authorUrl = chapter.authorUrl || fic.authorUrl
      if (author !== fic.author) {
        const authorBB = authorUrl
          ? `[url=${authorUrl}]${author}[/url]`
          : author
        index += ` (${authorBB})`
      }
      if (chapter.description) {
        index += ' – ' + chapter.description
      }
      if (chapter.words) {
        index += ` (${chapter.words} words)`
      }
      index += `\n`
    }
    index += '[/list]\n'
    return index
  })

  return writeFile(path.join(dirname, 'index.bbcode'), indexHTML)
}
