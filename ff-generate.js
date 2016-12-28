#!/usr/bin/env node
'use strict'
module.exports = write

const fs = require('fs')
const url = require('url')

const Bluebird = require('bluebird')
const TOML = require('@iarna/toml')

const fetch = require('./fetch')
const Fic = require('./fic.js')
const getFic = require('./get-fic.js')
const Output = require('./output.js')
const progress = require('./progress.js')

function write (args) {
  const output = args.output
  const user = args.xf_user
  const maxConcurrency = args.concurrency
  const requestsPerSecond = args['requests-per-second']
  const fetchOpts = {
    cacheBreak: !args.cache,
    noNetwork: !args.network,
    maxConcurrency,
    requestsPerSecond
  }

  const fetchAndSpin = fetch.withOpts(fetchOpts).wrapWith(progress.spinWhileAnd)
  if (args.xf_user) fetchAndSpin.setGlobalCookie(`xf_user=${args.xf_user}`)

  const trackers = args.fic.map(() => progress.tracker.newItem(1))

  process.emit('debug', `Generating epubs for ${args.fic.join(', ')}`)
  return Bluebird.each(args.fic, fetchTopFic)

  function fetchTopFic (ficFile, ficNum) {
    process.emit('debug', `Generating #${ficNum} for ${ficFile}`)
    const topFic = Fic.fromJSON(TOML.parse(fs.readFileSync(ficFile, 'utf8')))
    let fics = (topFic.chapters.length ? [topFic] : []).concat(topFic.fics || [])
    const tracker = trackers[ficNum]
    const completeWhenDone = (fetch) => {
      return (href, opts) => fetch(href, opts).finally(() => tracker.completeWork(1))
    }
    const fetchAndFinish = fetchAndSpin.wrapWith(completeWhenDone)
    fetchAndFinish.tracker = tracker
    fics = fics.filter((fic, ficNum) => {
      if (topFic === fic && topFic.fics && !topFic.chapters) return false
      for (let key of Object.keys(topFic)) {
        if (key === 'fics' || key === 'chapters') continue
        if (!fic[key]) fic[key] = topFic[key]
      }

      progress.show(fic.title, 'Fetching fic')
      tracker.addWork(fic.chapters.length)
      process.emit('debug', `Fetching #${ficNum} for ${ficFile}: ${fic.title}`)
      return true
    })

    return Bluebird.each(fics, fetchFic(fetchAndFinish))
      .finally(() => {
      process.emit('debug', `Fetching #${ficNum} for ${ficFile}: Complete`)
        tracker.finish()
        progress.hide()
      })
  }
  function fetchFic (fetch) {
    return (fic) => {
      process.emit('debug', `Outputting ${fic.title}`)
      const ficStream = getFic(fetch, fic)
      return Output.as(output).from(ficStream).write().then(filename => {
        progress.output(`${filename}\n`)
      })
    }
  }
}
