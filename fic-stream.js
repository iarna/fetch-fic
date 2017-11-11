'use strict'
const Readable = require('stream').Readable
const qw = require('qw')

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
    for (let pp of qw`id fetch title link updateFrom author authorUrl
                      created modified publisher description cover
                      chapterHeadings externals words tags fics chapters
                      site includeTOC numberTOC fetchMeta scrapeMeta`) {
      proxy(fic, pp, this)
    }
    for (let pp of qw`updateWith chapterExists normalizeLink addChapter importFromJSON toJSON`) {
      proxy(fic, pp, this)
    }
  }
  async queueChapter (chapter) {
    const state = this.FicStream
    if (state.reading) {
      state.reading = this.push(chapter)
      if (chapter == null) return
    } else {
      state.chapterBuffer.push(chapter)
    }
    if (state.reading) {
      return
    } else {
      if (state.readyP) return state.readyP
      state.readyP = new Promise(resolve => {
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
