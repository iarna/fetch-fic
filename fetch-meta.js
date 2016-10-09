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
  .argv

main()

function main () {
  var toFetch = argv._[0]
  var filename = argv._[1]
  var cookie = argv.xf_session
  var user = argv.xf_user
  var fromThreadmarks = !argv.scrape
  var fromScrape = argv.scrape || argv['and-scrape']
  var fetchOpts = {cacheBreak: true, noNetwork: false}
  if (cookie) {
    if (!fetchOpts.headers) fetchOpts.headers = {}
    fetchOpts.headers.Cookie = 'xf_session=' + cookie
  }
  if (user) {
    if (!fetchOpts.headers) fetchOpts.headers = {}
    fetchOpts.headers.Cookie += '; xf_user=' + user
  }
  var fic = {}
  if (filename) fic = TOML.parse(fs.readFileSync(filename))
  if (!filename) {
    try {
      fic = TOML.parse(fs.readFileSync(toFetch))
      filename = toFetch
      toFetch = fic.link
      var thread = new ThreadURL(toFetch)
      fic.chapters.forEach(function (chapter) {
        chapter.link = normalizeLink(chapter.link, thread)
      })
    } catch (_) {}
  }
  var fetchWithOpts = simpleFetch(fetchOpts)
  var chapterList
  if (!thread) thread = new ThreadURL(toFetch)
  if (fromThreadmarks) {
    chapterList = getChapterList(fetchWithOpts, thread, chapterList).then(function (chapters) {
      if (chapters.length === 0 || fromScrape) {
        return scrapeChapterList(fetchWithOpts, thread, chapters.length && chapters)
      } else {
        return chapters
      }
    })
  } else {
    chapterList = scrapeChapterList(fetchWithOpts, thread)
  }
  chapterList.then(function (chapters) {
    fetchOpts.cacheBreak = false
    var first = getChapter(fetchWithOpts, chapters[0].link)
    var last = getChapter(fetchWithOpts, chapters[chapters.length - 1].link)
    return Bluebird.all([first, last]).spread(function (firstChapter, lastChapter) {
      var title = chapters.workTitle || chapters[0].name || firstChapter.title || 'unknown'
      var tags = []
      var tagExp = /[\[(](.*?)[\])]/
      var tagMatch = title.match(tagExp)
      if (tagMatch) {
        title = title.replace(tagExp, '').trim()
        tags = tagMatch[1].split('/').map(function (tag) { return tag.trim() })
      }
      var $ = cheerio.load(firstChapter.content)
      var firstPara = $.text().trim().replace(/^([^\n]+)[\s\S]*?$/, '$1')
      if (fic.title == null) fic.title = title
      if (!filename && fic.author == null) fic.author = firstChapter.author
      if (!filename && fic.authorUrl == null) fic.authorUrl = firstChapter.authorUrl
      if (fic.started) delete fic.started
      if (fic.created == null) fic.created = chapters.created || firstChapter.created
      if (fic.modified == null) fic.modified = chapters.modified || lastChapter.created
      if (fic.link == null) fic.link = firstChapter.finalURL
      if (fic.description == null || /^Fetched from/.test(fic.description)) fic.description = firstPara
      if (fic.tags == null) fic.tags = tags
      if (!fic.publisher) fic.publisher = thread.publisher
      var newChapters = chapters.map(function (x) { delete x.order; return x })
      var actions = []
      if (fic.chapters && fic.chapters.length) {
        var toAdd = []
        for (var ii = newChapters.length - 1; ii>=0; --ii) {
          var newChapter = newChapters[ii]
          if (fic.chapters.some(andChapterEquals(newChapter))) break
          toAdd.unshift(newChapter)
        }
        fic.chapters.forEach(function (chapter) {
          var match = newChapters.filter(andChapterEquals(chapter)).filter(function (newChapter) {
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
        fic.chapters.push.apply(fic.chapters, toAdd)
        if (lastChapter.created && !dateEqual(fic.modified, lastChapter.created)) {
          actions.push('Updated fic last update time from ' + fic.modified + ' to ' + lastChapter.created)
          fic.modified = lastChapter.created
        }
        if (toAdd.length) actions.push('Added ' + toAdd.length + ' new chapters')
      } else {
        fic.chapters = newChapters
      }
      if (!actions.length && filename) return null
      if (!filename) filename = filenameize(fic.title) + '.fic.toml'
      fs.writeFileSync(filename, TOML.stringify(fic))
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
  var dateAStr = dateA && dateA.toISOString()
  var dateBStr = dateB && dateB.toISOString()
  return dateAStr === dateBStr
}