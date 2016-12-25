#!/usr/bin/env node
'use strict'
module.exports = write

const Bluebird = require('bluebird')
const simpleFetch = require('./simple-fetch')
const fs = require('fs')
const TOML = require('@iarna/toml')
const getFic = require('./get-fic.js')
const Output = require('./output.js')
const spinWith = require('./spin-with.js')
const progress = require('./progress.js')
const Fic = require('./fic.js')
const url = require('url')

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

  const fetch = simpleFetch(fetchOpts).wrapWith(progress.spinWhileAnd)
  if (args.xf_user) fetch.setGlobalCookie(`xf_user=${args.xf_user}`)

  const trackers = args.fic.map(() => progress.tracker.newItem(1))

  return Bluebird.each(args.fic, fetchTopFic)

  function fetchTopFic (ficFile, ficNum) {
    const topFic = Fic.fromJSON(TOML.parse(fs.readFileSync(ficFile, 'utf8')))
    let fics = (topFic.chapters.length ? [topFic] : []).concat(topFic.fics || [])
    const tracker = trackers[ficNum]
    const completeWhenDone = (fetch) => {
      return (href, opts) => fetch(href, opts).finally(() => tracker.completeWork(1))
    }
    const fetchAndFinish = fetch.wrapWith(completeWhenDone)
    fetchAndFinish.tracker = tracker
    fics = fics.filter((fic, ficNum) => {
      if (topFic === fic && topFic.fics && !topFic.chapters) return false
      for (let key of Object.keys(topFic)) {
        if (key === 'fics' || key === 'chapters') continue
        if (!fic[key]) fic[key] = topFic[key]
      }

      progress.show(fic.title + ': Fetching fic')
      tracker.addWork(fic.chapters.length)
      return true
    })

    return Bluebird.each(fics, fetchFic(fetchAndFinish))
      .finally(() => {
        tracker.finish()
        progress.hide()
      })
  }
  function fetchFic (fetch) {
    return (fic) => {
      const ficStream = getFic(fetch, fic)
      return Output.as(output).from(ficStream).write().then(filename => {
        progress.output(`${filename}\n`)
      })
    }
  }
}
