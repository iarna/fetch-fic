#!/usr/bin/env node
'use strict'
const Bluebird = require('bluebird')
const simpleFetch = require('./simple-fetch')
const fs = require('fs')
const TOML = require('@iarna/toml')
const getFic = require('./get-fic.js')
const ficToEpub = require('./fic-to-epub.js')
const ficToBbcode = require('./fic-to-bbcode.js')
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
  .option('o', {
    alias: 'output',
    describe: 'Set output format',
    default: 'epub',
    choices: ['epub', 'bbcode']
  })
  .argv

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
main()

function main () {
  const output = argv.output
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
      const linkP = url.parse(fic.updateFrom || fic.link)
      linkP.pathname = ''
      const link = url.format(linkP)
      if (cookie) cookieJar.setCookieSync('xf_session=' + cookie, link)
      if (user) cookieJar.setCookieSync('xf_user=' + user, link)
      const ficStream = getFic(fetchWithOpts, fic, maxConcurrency)
      if (output === 'epub') {
        const filename = filenameize(fic.title) + '.epub'
        return pipe(
          ficStream,
          ficToEpub(fic),
          fs.createWriteStream(filename)
        ).tap(() => {
          gauge.hide()
          console.log(filename)
          gauge.show()
        })
      } else if (output === 'bbcode') {
        const filename = filenameize(fic.title)
        return pipe(ficStream, ficToBbcode(fic, filename)).tap(() => {
          gauge.hide()
          console.log(filename)
          gauge.show()
        })
      }
    }
  }
}
