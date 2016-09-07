#!/usr/bin/env node
'use strict'
var Listr = require('listr')
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
var callLimit = require('call-limit')
var argv = require('yargs')
  .usage('Usage: $0 <url> [--xf_session=<sessionid>]')
  .demand(1, '<url> - The URL of the thread you want to epubize')
  .describe('xf_session', 'value of your xf_session variable')
  .boolean('scrape')
  .describe('scrape', 'scrape the index instead of using threadmarks')
  .boolean('and-scrape')
  .describe('and-scrape', 'pull chapters from BOTH the index AND the threadmarks')
  .argv

main()

function main () {
  var toFetch = argv._[0]
  var cookie = argv.xf_session
  var fromThreadmarks = !argv.scrape
  var fromScrape = argv.scrape || argv['and-scrape']
  var fetchOpts = {}
  if (cookie) {
    if (!fetchOpts.headers) fetchOpts.headers = {}
    fetchOpts.headers.Cookie = 'xf_session=' + cookie
  }

  var thread = new ThreadURL(toFetch)

  var chapterPromises = {}

  var fetchWithOptsCB = callLimit(function (url, cb) {
    var result = fetch(url, fetchOpts)
    if (chapterPromises[url]) {
      chapterPromises[url].resolve(result)
    }
    result.then(function (result) {
      cb(null, result)
    }, function (err) { cb(err) })
  }, 1)
  var fetchWithOpts = function (url) {
    return new Bluebird(function (resolve, reject) {
      fetchWithOptsCB(url, function (err, result) {
        if (err) return reject(err)
        resolve(result)
      })
    })
  }

  var chapterList
  var fic
  var filename
  var tasks = new Listr([
    {
      title: 'Fetch List of Chapters',
      task: function () {
        return new Bluebird(function (resolve) {
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
        }).then(function (chapters) {
          chapterList = chapters
          chapters.forEach(function (chapter) {
            chapterPromises[chapter.link] = {name: chapter.name}
            var P = new Bluebird(function (resolve, reject) {
              chapterPromises[chapter.link].resolve = resolve
            })
            chapterPromises[chapter.link].promise = P
          })
        })
      }
    },
    {
      title: 'Fetch Chapters',
      task: function () {
        return new Listr([
          {
            title: 'Start',
            task: function () { return fic = getFic(fetchWithOpts, chapterList) }
          },
          {
            title: 'Fetch',
            task: function () {
              return new Listr(chapterList.map(function (chapter) {
                var chapFetch = chapterPromises[chapter.link].promise
                return {
                  title: chapter.name,
                  task: function () {
                    return chapFetch
                  }
                }
              }), {concurrent: true})
            }
          }
        ], {concurrent: true})
      }
    },
    { title: 'Write to disk',
      task: function () {
        return new Bluebird(function (resolve, reject) {
          var epubStream = ficToEpub(fic)

          epubStream.once('meta', function () {
            filename = filenameize(thread.name || epubStream.title) + '.epub'
            epubStream.pipe(fs.createWriteStream(filename)).once('finish', resolve).once('error', reject)
          })
          epubStream.once('error', reject)
        })
      }
    }
  ])
  tasks.run().then(function () {
    console.log(filename)
  }).catch(function (err) {
    console.error(err.stack)
  })
}
