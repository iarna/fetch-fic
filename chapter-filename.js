'use strict'
module.exports = chapterFilename
const filenameize = require('./filenameize.js')

function chapterFilename (chapter) {
  const index = 1 + chapter.order
  const name = chapter.name || `Chapter ${index}`
  return chapter.filename || filenameize(`chapter-${name}`) + '.xhtml'
}
