#!/usr/bin/env node
'use strict'
const Bluebird = require('bluebird')
const simpleFetch = require('./simple-fetch')
const fs = require('fs')
const TOML = require('@iarna/toml')
const getFic = require('./get-fic.js')
const Output = require('./output.js')
const Gauge = require('gauge')
const TrackerGroup = require('are-we-there-yet').TrackerGroup
const spinWith = require('./spin-with.js')
const Fic = require('./fic.js')
const filenameize = require('./filenameize.js')
const ms = require('mississippi')
const pipe = Bluebird.promisify(ms.pipe)
const url = require('url')
const argv = require('yargs')
  .usage('Usage: $0 <fic> [--xf_session=<sessionid>] [--xf_user=<userid>]')
  .demand(1, '<fic> - A fic metadata file to fetch a fic for. Typically ends in .fic.toml')
  .option('o', {
    alias: 'output',
    describe: 'Set output format',
    default: 'epub',
    choices: Output.formats
  })
  .option('xf_session', {
    type: 'string',
    describe: 'value of your xf_session variable'
  })
  .option('xf_user', {
    type: 'string',
    describe: 'value of your xf_user variable'
  })
  .option('cache', {
     type: 'boolean',
     default: true,
     describe: 'fetch from the network even if we have it cached'
  })
  .option('network', {
    describe: 'allow network access; when false, cache-misses are errors',
    type: 'boolean',
    default: true
   })
  .option('concurrency', {
     type: 'number',
     default: 4,
     describe: 'maximum number of chapters/images/etc to fetch at a time'
   })
  .option('requests-per-second', {
    alias: 'rps',
    type: 'number',
    default: 1,
    describe: 'maximum number of HTTP requests per second'
  })
  .argv

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
main().catch(err => {
  console.error('TOP LEVEL ERROR', err.stack || err.message)
})

function main () {
  const output = argv.output
  const cookie = argv.xf_session
  const user = argv.xf_user
  const maxConcurrency = argv.concurrency
  const requestsPerSecond = argv['requests-per-second']
  const cookieJar = new simpleFetch.CookieJar()
  const fetchOpts = {
    cacheBreak: !argv.cache,
    noNetwork: !argv.network,
    cookieJar,
    maxConcurrency,
    requestsPerSecond
  }
  const fetchWithCache = simpleFetch(fetchOpts)
  const gauge = new Gauge()
  const trackerGroup = new TrackerGroup()
  trackerGroup.on('change', (name, completed) => gauge.show({completed: completed}))
  const trackers = argv._.map(() => trackerGroup.newItem(1))
  const spin = spinWith(gauge)

  return Bluebird.each(argv._, fetchTopFic)

  function fetchTopFic (ficFile, ficNum) {
    const topFic = Fic.fromJSON(TOML.parse(fs.readFileSync(ficFile, 'utf8')))
    let fics = (topFic.chapters.length ? [topFic]: []).concat(topFic.fics||[])
    const tracker = trackers[ficNum]
    const fetchWithOpts = (url, noCache, binary) => {
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
      const linkP = url.parse(fic.updateFrom || fic.link)
      linkP.pathname = ''
      const link = url.format(linkP)
      if (cookie) cookieJar.setCookieSync('xf_session=' + cookie, link)
      if (user) cookieJar.setCookieSync('xf_user=' + user, link)
      const ficStream = getFic(fetchWithOpts, fic)
      return Output.as(output).from(ficStream).write().then(filename => {
        gauge.hide()
        process.stdout.write(`${filename}\n`)
        gauge.show()
      })
    }
  }
}
