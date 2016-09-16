'use strict'
var simpleFetch = require('./simple-fetch')
var fs = require('fs')
var TOML = require('./toml.js')
var getFic = require('./get-fic.js')
var ficToEpub = require('./fic-to-epub.js')
var Gauge = require('gauge')
var Tracker = require('are-we-there-yet').Tracker
var spinWith = require('./spin-with.js')
var TOML = require('./toml.js')
var filenameize = require('./filenameize.js')
var argv = require('yargs')
  .usage('Usage: $0 <fic> [--xf_session=<sessionid>] [--xf_user=<userid>]')
  .demand(1, '<fic> - A fic metadata file to fetch a fic for. Typically ends in .fic.toml')
  .describe('xf_session', 'value of your xf_session variable')
  .describe('xf_user', 'value of your xf_session variable')
  .argv

main()

function main () {
  var ficFile = argv._[0]
  var cookie = argv.xf_session
  var user = argv.xf_user
  var fic = TOML.parse(fs.readFileSync(ficFile, 'utf8'))
  fic.chapters.forEach(function (chapter, ii) {
    chapter.order = ii
  })
  var fetchOpts = {cacheBreak: false}
  if (cookie) {
    if (!fetchOpts.headers) fetchOpts.headers = {}
    fetchOpts.headers.Cookie = 'xf_session=' + cookie
  }
  if (user) {
    if (!fetchOpts.headers) fetchOpts.headers = {}
    fetchOpts.headers.Cookie += '; xf_user=' + user
  }
  var fetch = simpleFetch(fetchOpts)

  var gauge = new Gauge()
  var tracker = new Tracker(1)
  tracker.on('change', function (name, completed) {
    gauge.show({completed: completed})
  })
  var spin = spinWith(gauge)
  gauge.show(fic.title + ': Fetching fic')
  var fetchWithCache = simpleFetch(fetchOpts)
  var fetchWithOpts = function (url) {
    return spin(fetchWithCache(url)).then(function (result) {
      tracker.completeWork(1)
      return result
    }, function (err) {
      tracker.completeWork(1)
      throw err
    })
  }
  var filename = filenameize(fic.title) + '.epub'
  tracker.addWork(fic.chapters.length)
  
  ficToEpub(fic, getFic(fetchWithOpts, fic.chapters, 1)).pipe(fs.createWriteStream(filename)).once('finish', function () {
    tracker.finish()
    gauge.disable()
    console.log(filename)
  })

}
