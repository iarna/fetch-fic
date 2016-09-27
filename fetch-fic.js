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
  var fetchOpts = {cacheBreak: false}
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

  return Bluebird.each(argv._, fetchFic)

  function fetchFic (ficFile, ii) {
    var fic = TOML.parse(fs.readFileSync(ficFile, 'utf8'))
    fic.chapters.forEach(function (chapter, ii) {
      chapter.order = ii
    })

    var tracker = trackers[ii]
    gauge.show(fic.title + ': Fetching fic')
    var fetchWithOpts = function (url, noCache) {
      return spin(fetchWithCache(url, noCache)).tap(function () {
        tracker.completeWork(1)
      })
    }
    var filename = filenameize(fic.title) + '.epub'
    tracker.addWork(fic.chapters.length)

    return pipe(
      getFic(fetchWithOpts, fic.chapters, 1),
      ficToEpub(fic),
      fs.createWriteStream(filename)
    ).tap(function () {
      tracker.finish()
      gauge.hide()
      console.log(filename)
    })
  }
}
