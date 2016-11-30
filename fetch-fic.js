#!/usr/bin/env node
'use strict'
const Bluebird = require('bluebird')
const simpleFetch = require('./simple-fetch')
const fs = require('fs')
const TOML = require('@iarna/toml')
const getFic = require('./get-fic.js')
const ficToEpub = require('./fic-to-epub.js')
const Gauge = require('gauge')
const TrackerGroup = require('are-we-there-yet').TrackerGroup
const spinWith = require('./spin-with.js')
const Fic = require('./fic.js')
const filenameize = require('./filenameize.js')
const ms = require('mississippi')
const pipe = Bluebird.promisify(ms.pipe)
const argv = require('yargs')
  .usage('Usage: $0 <fic> [--xf_session=<sessionid>] [--xf_user=<userid>]')
  .demand(1, '<fic> - A fic metadata file to fetch a fic for. Typically ends in .fic.toml')
  .describe('xf_session', 'value of your xf_session variable')
  .describe('xf_user', 'value of your xf_session variable')
  .boolean('cache')
  .default('cache', true)
  .describe('cache', 'fetch from the network even if we have it cached')
  .boolean('network')
  .default('network', true)
  .describe('network', 'allow network access; when false, cache-misses are errors')
  .default('concurrency', 4)
  .describe('concurrency', 'maximum number of chapters/images/etc to fetch at a time')
  .argv

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
main()

function main () {
  const cookie = argv.xf_session
  const user = argv.xf_user
  const maxConcurrency = argv.concurrency
  const cookieJar = new simpleFetch.CookieJar()
  const fetchOpts = {
    cacheBreak: !argv.cache,
    noNetwork: !argv.network,
    cookieJar: cookieJar
  }
  const fetchWithCache = simpleFetch(fetchOpts)
  if (cookie) cookieJar.setCookieSync('xf_session=' + cookie, toFetch)
  if (user) cookieJar.setCookieSync('xf_user=' + user, toFetch)
  const gauge = new Gauge()
  const trackerGroup = new TrackerGroup()
  trackerGroup.on('change', (name, completed) => gauge.show({completed: completed}))
  const trackers = argv._.map(() => trackerGroup.newItem(1))
  const spin = spinWith(gauge)

  return Bluebird.each(argv._, fetchTopFic).catch(err => {
    console.error('TOP LEVEL ERROR', err.stack || err.message)
  })

  function fetchTopFic (ficFile, ficNum) {
    var topFic = Fic.fromJSON(TOML.parse(fs.readFileSync(ficFile, 'utf8')))
    var fics = (topFic.chapters.length ? [topFic]: []).concat(topFic.fics||[])
    var tracker = trackers[ficNum]
    var fetchWithOpts = (url, noCache, binary) => {
      return spin(fetchWithCache(url, noCache, binary)).finally(() => tracker.completeWork(1))
    }
    fetchWithOpts.gauge = gauge
    fetchWithOpts.tracker = tracker
    fics = fics.filter((fic, ficNum) => {
      if (topFic === fic && topFic.fics && !topFic.chapters) return false
      for (let key of Object.keys(topFic)) {
        if (key === 'fics' || key === 'chapters') continue
        if (!fic[key]) fic[key] = topFic[key]
      }
      
      gauge.show(fic.title + ': Fetching fic')
      tracker.addWork(fic.chapters.length)
      return true
    })
   
    return Bluebird.each(fics, fetchFic(fetchWithOpts))
      .finally(() => {
        tracker.finish()
        gauge.hide()
      })
  }
  function fetchFic (fetchWithOpts) {
    return (fic) => {
      var filename = filenameize(fic.title) + '.epub'

      return pipe(
        getFic(fetchWithOpts, fic, maxConcurrency),
        ficToEpub(fic),
        fs.createWriteStream(filename)
      ).tap(() => {
        gauge.hide()
        console.log(filename)
        gauge.show()
      })
    }
  }
}
