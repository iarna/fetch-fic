'use strict'
const Bluebird = require('bluebird')
const Readable = require('readable-stream').Readable

class FicStream extends Readable {
  constructor (options) {
    if (!options) options = {}
    options.objectMode = true
    if (!options.highWaterMark) options.highWaterMark = 4
    super(options)
    this.FicStream = {
      reading: false,
      chapterBuffer: [],
      readyP: null,
      readyR: null
    }
  }
  queueChapter (chapter) {
    const state = this.FicStream
    if (state.reading) {
      state.reading = this.push(chapter)
      if (chapter == null) return Bluebird.resolve()
    } else {
      state.chapterBuffer.push(chapter)
    }
    if (state.reading) {
      return null
    } else {
      if (state.readyP) return state.readyP
      state.readyP = new Bluebird(resolve => {
        this.FicStream.readyR = resolve
      })
      return state.readyP
    }
  }
  _read (size) {
    const state = this.FicStream
    state.reading = true
    while (state.reading && state.chapterBuffer.length) {
      const chapter = state.chapterBuffer.shift()
      state.reading = this.push(chapter)
    }
    if (state.reading && state.readyP) {
      state.readyR()
      state.readyR = this.readyP = null
    }
  }
}

module.exports = FicStream
