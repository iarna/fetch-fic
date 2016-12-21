#!/usr/bin/env node
'use strict'
module.exports = write

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
const url = require('url')

function write (args) {
  const output = args.output
  const user = args.xf_user
  const maxConcurrency = args.concurrency
  const requestsPerSecond = args['requests-per-second']
  const cookieJar = new simpleFetch.CookieJar()
  const fetchOpts = {
    cacheBreak: !args.cache,
    noNetwork: !args.network,
    cookieJar,
    maxConcurrency,
    requestsPerSecond
  }
  const fetchWithCache = simpleFetch(fetchOpts)
  const gauge = new Gauge()
  const trackerGroup = new TrackerGroup()
  trackerGroup.on('change', (name, completed) => gauge.show({completed: completed}))
  const trackers = args.fic.map(() => trackerGroup.newItem(1))
  const spin = spinWith(gauge)

  return Bluebird.each(args.fic, fetchTopFic)

  function fetchTopFic (ficFile, ficNum) {
    const topFic = Fic.fromJSON(TOML.parse(fs.readFileSync(ficFile, 'utf8')))
    let fics = (topFic.chapters.length ? [topFic] : []).concat(topFic.fics || [])
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
