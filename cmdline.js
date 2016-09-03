#!/usr/bin/env node
'use strict'
var Bluebird = require('bluebird')
var fetch = require('node-fetch')
fetch.Promise = Bluebird
var fs = require('fs')
var ThreadURL = require('./thread-url.js')
var getChapterList = require('./get-chapter-list.js').getChapterList
var scrapeChapterList = require('./get-chapter-list.js').scrapeChapterList
var getFic = require('./get-fic.js')
var ficToEpub = require('./fic-to-epub.js')
var filenameize = require('./filenameize.js')
var Gauge = require('gauge')
var Tracker = require('are-we-there-yet').Tracker
var spinWith = require('./spin-with.js')

main(process.argv.slice(2))

function main (args) {
  if (args.length < 1) {
    console.error('xenforo-to-epub <url> [<xf_session>]')
    process.exit(1)
  }
  var toFetch = args[0]
  var cookie = args[1]

  var fetchOpts = {}
  if (cookie) {
    if (!fetchOpts.headers) fetchOpts.headers = {}
    fetchOpts.headers.Cookie = 'xf_session=' + cookie
  }

  var gauge = new Gauge()
  var tracker = new Tracker(1)
  tracker.on('change', function (name, completed) {
    gauge.show({completed: completed})
  })
  var spin = spinWith(gauge)

  var thread = new ThreadURL(toFetch)
  var name = thread.name || toFetch
  gauge.show(name + ': Fetching chapter list')
  var fetchWithOpts = function (url) {
    return spin(fetch(url, fetchOpts)).then(function (result) {
      tracker.completeWork(1)
      return result
    }, function (err) {
      tracker.completeWork(1)
      throw err
    })
  }
  var chapterList = getChapterList(fetchWithOpts, thread).then(function (chapters) {
    if (chapters.length === 0) {
      return scrapeChapterList(fetch, thread)
    } else {
      return chapters
    }
  }).then(function (chapters) {
    tracker.addWork(chapters.length + 1)
    gauge.show(name + ': Fetching chapters')
    return chapters
  })

  var fic = getFic(fetchWithOpts, chapterList)
  var epubStream = ficToEpub(fic)
  var filename

  epubStream.once('meta', function () {
    filename = filenameize(thread.name || epubStream.title) + '.epub'
    epubStream.pipe(fs.createWriteStream(filename))
  })
  epubStream.once('end', function () {
    tracker.finish()
    gauge.disable()
    console.log(filename)
  })
}
