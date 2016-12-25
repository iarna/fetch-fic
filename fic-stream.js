'use strict'
const Bluebird = require('bluebird')
const Readable = require('readable-stream').Readable

function proxy (from, prop, to) {
  if (to[prop] != null) return
  if (typeof from[prop] === 'function') {
    const method = from[prop]
    to[prop] = function () { return method.apply(from, arguments) }
  } else {
    Object.defineProperty(to, prop, {
      get: () => from[prop]
    })
  }
}

class FicStream extends Readable {
  constructor (fic, options) {
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
    // ficstreams also proxy everything from their source fic
    for (let pp in fic) {
      proxy(fic, pp, this)
    }
    for (let pp of Object.getOwnPropertyNames(Object.getPrototypeOf(fic))) {
      proxy(fic, pp, this)
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
        state.readyR = resolve
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
      state.readyR = state.readyP = null
    }
  }
}

module.exports = FicStream
