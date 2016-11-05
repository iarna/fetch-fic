#!/usr/bin/env node
'use strict'
var Bluebird = require('bluebird')
var simpleFetch = require('./simple-fetch')
var getChapterList = require('./get-chapter-list.js').getChapterList
var scrapeChapterList = require('./get-chapter-list.js').scrapeChapterList
var getChapter = require('./get-chapter.js')
var filenameize = require('./filenameize.js')
var ThreadURL = require('./thread-url.js')
var normalizeLink = require('./normalize-link.js')
var fs = require('fs')
var TOML = require('@iarna/toml')
var cheerio = require('cheerio')
var Fic = require('./fic.js')
var argv = require('yargs')
  .usage('Usage: $0 [options] <url> [<fic>]')
  .demand(1, '<url> - The URL of the thread you want to epubize')
//  .describe('<fic> - Optionally, a fic.toml file to update from a previous run')
  .describe('xf_session', 'value of your xf_session variable')
  .describe('xf_user', 'value of your xf_session variable')
  .boolean('scrape')
  .describe('scrape', 'scrape the index instead of using threadmarks')
  .boolean('and-scrape')
  .describe('and-scrape', 'pull chapters from BOTH the index AND the threadmarks')
  .boolean('cache')
  .default('cache', false)
  .describe('cache', 'use the cache for metadata loookups')
  .boolean('network')
  .default('network', true)
  .describe('network', 'allow network access; when false, cache-misses are errors')
  .argv

main()

function main () {
  var toFetch = argv._[0]
  var filename = argv._[1]
  var cookie = argv.xf_session
  var user = argv.xf_user
  var fromThreadmarks = !argv.scrape
  var fromScrape = argv.scrape || argv['and-scrape']
  var fetchOpts = {cacheBreak: !argv['cache'], noNetwork: !argv['network']}
  if (cookie) {
    if (!fetchOpts.headers) fetchOpts.headers = {}
    fetchOpts.headers.Cookie = 'xf_session=' + cookie
  }
  if (user) {
    if (!fetchOpts.headers) fetchOpts.headers = {}
    if (fetchOpts.headers.Cookie) {
      fetchOpts.headers.Cookie += '; '
    } else {
      fetchOpts.headers.Cookie = ''
    }
    fetchOpts.headers.Cookie += 'xf_user=' + user
  }
  var fic = new Fic()
  if (filename) {
    var existingFic = new Fic()
    existingFic.importFromJSON(TOML.parse(fs.readFileSync(filename)))
  } else {
    try {
      var ficFile = fs.readFileSync(toFetch)
    } catch (_) {
    }
    if (ficFile) {
      var existingFic = new Fic()
      existingFic.importFromJSON(TOML.parse(ficFile))
      filename = toFetch
      fic.link = existingFic.link
    } else {
      fic.link = toFetch
    }
  }
  var fetchWithOpts = simpleFetch(fetchOpts)
  var chapterList
  var thread = new ThreadURL(fic.link)
  if (fromThreadmarks) {
    chapterList = getChapterList(fetchWithOpts, thread, fic).then(function () {
      if (chapters.length === 0 || fromScrape) {
        return scrapeChapterList(fetchWithOpts, thread, fic)
      } else {
        return chapters
      }
    }).catch(function () {
      return scrapeChapterList(fetchWithOpts, thread, fic)
    })
  } else {
    chapterList = scrapeChapterList(fetchWithOpts, thread, fic)
  }
  chapterList.then(function () {
    fetchOpts.cacheBreak = false
    var first = getChapter(fetchWithOpts, fic.chapters[0].link)
    var lastCreated = fic.chapters.filter(chapter => chapter.created).sort().slice(-1).created
//    var last = getChapter(fetchWithOpts, fic.chapters[fic.chapters.length - 1].link)
    return Bluebird.all([first]).spread(function (firstChapter) {
      var outFic = existingFic || fic
      var tags = []
      var tagExp = /[\[(](.*?)[\])]/
      var tagMatch = outFic.title.match(tagExp)
      if (tagMatch) {
        outFic.title = outFic.title.replace(tagExp, '').trim()
        tags = tagMatch[1].split('/').map(function (tag) { return tag.trim() })
      }
      var $ = cheerio.load(firstChapter.content)
      var firstPara = $.text().trim().replace(/^([^\n]+)[\s\S]*?$/, '$1')
      if (!filename && outFic.author == null) outFic.author = firstChapter.author
      if (!filename && outFic.authorUrl == null) outFic.authorUrl = firstChapter.authorUrl
      if (outFic.created == null) outFic.created = fic.created || firstChapter.created
      if (outFic.modified == null) outFic.modified = fic.modified || lastCreated
      if (outFic.link == null) outFic.link = firstChapter.finalURL
      if (outFic.description == null) outFic.description = firstPara
      if (outFic.tags == null) outFic.tags = tags
      if (!outFic.publisher) outFic.publisher = thread.publisher
      var actions = []
      if (existingFic) {
        var toAdd = []
        for (var ii = fic.chapters.length - 1; ii>=0; --ii) {
          var newChapter = fic.chapters[ii]
          if (outFic.chapterExists(newChapter.link)) break
          toAdd.unshift(newChapter)
        }
        fic.chapters.forEach(function (chapter) {
          var match = fic.chapters.filter(andChapterEquals(chapter)).filter(function (newChapter) {
            // the new chapter has our new metadata
            return !!newChapter.created
          })
          if (!match || !match.length) return
          match.forEach(function (newChapter) {
            if (newChapter.created && !dateEqual(newChapter.created, chapter.created)) {
              chapter.created = newChapter.created
              actions.push('Updated creation date for chapter ' + newChapter.name)
            }
          })
        })
        if (lastCreated && !dateEqual(outFic.modified, lastCreated)) {
          actions.push('Updated fic last update time from ' + outFic.modified + ' to ' + lastCreated)
          outFic.modified = lastCreated
        }
        outFic.chapters.push.apply(outFic.chapters, toAdd)
        if (toAdd.length) actions.push('Added ' + toAdd.length + ' new chapters')
      }
      if (!actions.length && filename) process.exit(1)
      if (!filename) filename = filenameize(outFic.title) + '.fic.toml'
      fs.writeFileSync(filename, TOML.stringify(outFic))
      process.stdout.write(filename + '\n')
      if (actions.length) process.stdout.write('    ' + actions.join('\n    ') + '\n')

      return null
    })
  })
}

function andChapterEquals (chapterA) {
  return function (chapterB) { return chapterEqual(chapterA, chapterB) }
}

function chapterEqual (chapterA, chapterB) {
  return chapterA.link === chapterB.link
}

function dateEqual (dateA, dateB) {
  var dateAStr = dateA && dateA.toISOString && dateA.toISOString()
  var dateBStr = dateB && dateB.toISOString && dateB.toISOString()
  return dateAStr === dateBStr
}