'use strict'
module.exports = chapterFilename
var filenameize = require('./filenameize.js')

function chapterFilename (chapter) {
  if (!chapter) throw new Error('EEP')
  var index = 1 + chapter.order
  var name = chapter.name || "Chapter " + index
  return chapter.filename || filenameize('chapter-' + name) + '.xhtml'
}