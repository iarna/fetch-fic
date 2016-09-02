'use strict'
module.exports = getFic
var Bluebird = require('bluebird')
var getChapter = require('./get-chapter.js')
var Readable = require('readable-stream').Readable
var inherits = require('util').inherits

function getFic (fetch, chapterList, maxConcurrency) {
  if (!maxConcurrency) maxConcurrency = 4
  var fic = new FicStream()
  Bluebird.map(chapterList, function (chapterInfo, ii) {
    return getChapter(fetch, chapterInfo.link).then(function (chapter) {
      chapter.name = chapterInfo.name
      return chapter
    })
  }, {concurrency: maxConcurrency}).each(function (chapter) {
    fic.queueChapter(chapter)
  }).then(function () {
    fic.queueChapter(null)
  })
  return fic
}

function FicStream (options) {
  if (!options) options = {}
  options.objectMode = true
  options.highWaterMark = 4
  Readable.call(this, options)
  this.FicStream = { reading: false, chapterBuffer: [] }
}
inherits(FicStream, Readable)

FicStream.prototype.queueChapter = function (chapter) {
  if (this.FicStream.reading) {
    this.FicStream.reading = this.push(chapter)
  } else {
    this.FicStream.chapterBuffer.push(chapter)
  }
}

FicStream.prototype._read = function (size) {
  this.FicStream.reading = true
  while (this.FicStream.reading && this.FicStream.chapterBuffer.length) {
    var chapter = this.FicStream.chapterBuffer.shift()
    this.FicStream.reading = this.push(chapter)
  }
}
