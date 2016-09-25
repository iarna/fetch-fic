'use strict'
module.exports = getFic
var Bluebird = require('bluebird')
var getChapter = require('./get-chapter.js')
var Readable = require('readable-stream').Readable
var inherits = require('util').inherits

function getFic (fetch, chapterList, maxConcurrency) {
  if (!maxConcurrency) maxConcurrency = 4
  var fic = new FicStream({highWaterMark: maxConcurrency})
  Bluebird.each(chapterList, function (chapterInfo, ii) {
    return getChapter(fetch, chapterInfo.link).then(function (chapter) {
      chapter.order = chapterInfo.order
      chapter.name = chapterInfo.name
      return fic.queueChapter(chapter)
    }).catch(function (err) {
      console.error(err.message)
    })
  }, {concurrency: maxConcurrency}).finally(function () {
    return fic.queueChapter(null)
  })
  return fic
}

function FicStream (options) {
  if (!options) options = {}
  options.objectMode = true
  if (!options.highWaterMark) options.highWaterMark = 4
  Readable.call(this, options)
  this.FicStream = { reading: false, chapterBuffer: [] }
  this.readyP = null
  this.readyR = null
}
inherits(FicStream, Readable)

FicStream.prototype.queueChapter = function (chapter) {
  if (this.FicStream.reading) {
    this.FicStream.reading = this.push(chapter)
    if (chapter == null) return Bluebird.resolve()
  } else {
    this.FicStream.chapterBuffer.push(chapter)
  }
  if (this.FicStream.reading) {
    return null
  } else {
    if (this.readyP) return this.readyP
    var self = this
    this.readyP = new Bluebird(function (resolve) {
      self.readyR = resolve
    })
    return this.readyP
  }
}

FicStream.prototype._read = function (size) {
  this.FicStream.reading = true
  while (this.FicStream.reading && this.FicStream.chapterBuffer.length) {
    var chapter = this.FicStream.chapterBuffer.shift()
    this.FicStream.reading = this.push(chapter)
  }
  if (this.FicStream.reading && this.readyP) {
    this.readyR()
    this.readyR = this.readyP = null
  }
}
