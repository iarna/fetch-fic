#!/usr/bin/env node
'use strict'
var Bluebird = require('bluebird')
var simpleFetch = require('./simple-fetch')
var fs = require('fs')
var TOML = require('@iarna/toml')
var getFic = require('./get-fic.js')
var ficToEpub = require('./fic-to-epub.js')
var Gauge = require('gauge')
var TrackerGroup = require('are-we-there-yet').TrackerGroup
var spinWith = require('./spin-with.js')
var filenameize = require('./filenameize.js')
var ms = require('mississippi')
var pipe = Bluebird.promisify(ms.pipe)
var argv = require('yargs')
  .usage('Usage: $0 <fic> [--xf_session=<sessionid>] [--xf_user=<userid>]')
  .demand(1, '<fic> - A fic metadata file to fetch a fic for. Typically ends in .fic.toml')
  .describe('xf_session', 'value of your xf_session variable')
  .describe('xf_user', 'value of your xf_session variable')
  .argv

main()

function main () {
  var cookie = argv.xf_session
  var user = argv.xf_user
  var fetchOpts = {cacheBreak: false, noNetwork: false}
  if (cookie) {
    if (!fetchOpts.headers) fetchOpts.headers = {}
    fetchOpts.headers.Cookie = 'xf_session=' + cookie
  }
  if (user) {
    if (!fetchOpts.headers) fetchOpts.headers = {}
    fetchOpts.headers.Cookie += '; xf_user=' + user
  }
  var fetchWithCache = simpleFetch(fetchOpts)
  var gauge = new Gauge()
  var trackerGroup = new TrackerGroup()
  trackerGroup.on('change', function (name, completed) {
    gauge.show({completed: completed})
  })
  var trackers = argv._.map(function () { return trackerGroup.newItem(1) })
  var spin = spinWith(gauge)

  return Bluebird.each(argv._, fetchTopFic).catch(function (err) {
    console.error('TOP LEVEL ERROR', err.stack)
  })

  function fetchTopFic (ficFile, ficNum) {
    var topFic = TOML.parse(fs.readFileSync(ficFile, 'utf8'))
    var fics = [topFic].concat(topFic.fics||[])
    var tracker = trackers[ficNum]
    var fetchWithOpts = function (url, noCache, binary) {
      return spin(fetchWithCache(url, noCache, binary)).finally(function () {
        tracker.completeWork(1)
      })
    }
    fics = fics.filter(function (fic, ficNum) {
      if (topFic === fic && topFic.fics && !topFic.chapters) return false
      Object.keys(topFic).forEach(function (key) {
        if (key === 'fics' || key === 'chapters') return
        if (!fic[key]) fic[key] = topFic[key]
      })
      
      fic.chapters.forEach(function (chapter, ii) {
        chapter.order = ii
      })
      if (!fic.modified) fic.modified = fic.chapters[fic.chapters.length - 1].created

      gauge.show(fic.title + ': Fetching fic')
      tracker.addWork(fic.chapters.length)
      return true
    })
   
    return Bluebird.each(fics, fetchFic(fetchWithOpts))
      .finally(function () {
        tracker.finish()
        gauge.hide()
      })
  }
  function fetchFic (fetchWithOpts) {
    return function (fic) {
      var filename = filenameize(fic.title) + '.epub'

      return pipe(
        getFic(fetchWithOpts, fic, 1),
        ficToEpub(fic),
        fs.createWriteStream(filename)
      ).tap(function () {
        gauge.hide()
        console.log(filename)
        gauge.show()
      })
    }
  }
}
