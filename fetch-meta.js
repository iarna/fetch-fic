#!/usr/bin/env node
'use strict'
var simpleFetch = require('./simple-fetch')
var getChapterList = require('./get-chapter-list.js').getChapterList
var scrapeChapterList = require('./get-chapter-list.js').scrapeChapterList
var getChapter = require('./get-chapter.js')
var filenameize = require('./filenameize.js')
var ThreadURL = require('./thread-url.js')
var fs = require('fs')
var TOML = require('./toml.js')
var argv = require('yargs')
  .usage('Usage: $0 <url> [--xf_session=<sessionid>] [--xf_user=<userid>]')
  .demand(1, '<url> - The URL of the thread you want to epubize')
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
  var cookie = argv.xf_session
  var user = argv.xf_user
  var fromThreadmarks = !argv.scrape
  var fromScrape = argv.scrape || argv['and-scrape']
  var fetchOpts = {cacheBreak: true}
  if (cookie) {
    if (!fetchOpts.headers) fetchOpts.headers = {}
    fetchOpts.headers.Cookie = 'xf_session=' + cookie
  }
  if (user) {
    if (!fetchOpts.headers) fetchOpts.headers = {}
    fetchOpts.headers.Cookie += '; xf_user=' + user
  }
  var fetch = simpleFetch(fetchOpts)
  var fetchWithOpts = function (url) { return fetch(url, fetchOpts) }
  var chapterList
  var thread = new ThreadURL(toFetch)
  if (fromThreadmarks) {
    chapterList = getChapterList(fetchWithOpts, thread, chapterList).then(function (chapters) {
      if (chapters.length === 0 || fromScrape) {
        return scrapeChapterList(fetchWithOpts, thread, chapters)
      } else {
        return chapters
      }
    })
  } else {
    chapterList = scrapeChapterList(fetchWithOpts, thread)
  }
  chapterList.then(function (chapters) {
    fetchOpts.cacheBreak = false
    return getChapter(fetch, chapters[0].link).then(function (firstChapter) {
      var title = firstChapter.workTitle
      var tags = []
      var tagExp = /[\[(](.*?)[\])]/
      var tagMatch = title.match(tagExp)
      if (tagMatch) {
        title = title.replace(tagExp, '').trim()
        tags = tagMatch[1].split('/').map(function (tag) { return tag.trim() })
      }
      var fic = {
        title: title,
        author: firstChapter.author,
        authorUrl: firstChapter.authorUrl,
        started: firstChapter.started,
        link: firstChapter.finalURL,
        description: 'Fetched from ' + firstChapter.finalURL + '\nTags: ' + tags.join(', '),
        tags: tags,
        publisher: thread.publisher,
        chapters: chapters.map(function (x) { delete x.order; return x })
      }
      var filename = filenameize(fic.title) + '.fic.toml'
      fs.writeFileSync(filename, TOML.stringify(fic))
      console.log(filename)
      return null
    })
  })
}
