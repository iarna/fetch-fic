'use strict'
module.exports = chapterFilename

const filenameize = use('filenameize')

function chapterFilename (chapter) {
  const index = 1 + chapter.order
  const name = chapter.name || `Chapter ${index}`
  return chapter.filename || filenameize(`chapter-${name}`) + '.xhtml'
}
