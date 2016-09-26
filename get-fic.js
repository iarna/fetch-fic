'use strict'
module.exports = getFic
var Bluebird = require('bluebird')
var getChapter = require('./get-chapter.js')
var Readable = require('readable-stream').Readable
var inherits = require('util').inherits

function concurrently (todo, concurrency, forEach) {
  var active = 0
  var aborted = false
  return new Bluebird(function (resolve, reject) {
    function runNext () {
      if (aborted) return
      if (active === 0 && todo.length === 0) return resolve()
      while (active < concurrency && todo.length) {
        ++active
        forEach(todo.shift()).then(function () {
          --active
          runNext()
        }).catch(function (err) {
          aborted = true
          reject(err)
          return
        })
      }
    }
    runNext()
  })
}

function getFic (fetch, chapterList, maxConcurrency) {
  if (!maxConcurrency) maxConcurrency = 4
  var fic = new FicStream({highWaterMark: maxConcurrency * 2})
  concurrently(chapterList, maxConcurrency, function (chapterInfo) {
    return getChapter(fetch, chapterInfo.link).then(function (chapter) {
      chapter.order = chapterInfo.order
      chapter.name = chapterInfo.name
      return fic.queueChapter(chapter)
    }).catch(function (err) {
      console.error(err.message)
    })
  }).finally(function () {
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
