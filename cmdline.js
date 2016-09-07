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
var argv = require('yargs')
  .usage('Usage: $0 <url> [--xf_session=<sessionid>]')
  .demand(1, '<url> - The URL of the thread you want to epubize')
  .describe('xf_session', 'value of your xf_session variable')
  .boolean('scrape')
  .describe('scrape', 'scrape the index instead of using threadmarks')
  .boolean('and-scrape')
  .describe('and-scrape', 'pull chapters from BOTH the index AND the threadmarks')
  .boolean('chapter-list-only')
  .describe('chapter-list-only', 'fetch only the chapterlist and print as JSON')
  .string('from-chapter-list')
  .describe('from-chapter-list', 'build an epub from a JSON chapterlist on disk')
  .argv

main()

function main () {
  var toFetch = argv._[0]
  var cookie = argv.xf_session
  var fromThreadmarks = !argv.scrape
  var fromScrape = argv.scrape || argv['and-scrape']
  var chapterListOnly = argv['chapter-list-only']
  var fromChapterList = argv['from-chapter-list']

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
  var chapterList
  if (fromChapterList) {
    chapterList = readFile(fromChapterList, 'utf8').then(function (chaptertxt) {
      return JSON.parse(chaptertxt).map(function (chapter, ii) {
        chapter.order = ii
        return chapter
      })
    })
  } else {
    chapterList = new Bluebird(function (resolve) {
      if (fromThreadmarks) {
        return resolve(getChapterList(fetchWithOpts, thread, chapterList).then(function (chapters) {
          if (chapters.length === 0 || fromScrape) {
            return scrapeChapterList(fetchWithOpts, thread, chapters)
          } else {
            return chapters
          }
        }))
      } else {
        return resolve(scrapeChapterList(fetchWithOpts, thread))
      }
    })
  }
  if (chapterListOnly) {
    return chapterList.then(function (chapters) {
      tracker.finish()
      gauge.disable()
      // clear off the order flag, we'll fill it back in on import
      console.log(JSON.stringify(chapters.map(function (x) { delete x.order; return x }), null, 2))
    })
  }
  chapterList = chapterList.then(function (chapters) {
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
