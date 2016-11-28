#!/usr/bin/env node
'use strict'
const Bluebird = require('bluebird')
const simpleFetch = require('./simple-fetch')
const filenameize = require('./filenameize.js')
const fs = require('fs')
const TOML = require('@iarna/toml')
const cheerio = require('cheerio')
const Fic = require('./fic.js')
const argv = require('yargs')
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
  let toFetch = argv._[0]
  let filename = argv._[1]
  const cookie = argv.xf_session
  const user = argv.xf_user
  const fromThreadmarks = !argv.scrape
  const fromScrape = argv.scrape || argv['and-scrape']
  const cookieJar = new simpleFetch.CookieJar()
  const fetchOpts = {
    cacheBreak: !argv.cache,
    noNetwork: !argv.network,
    cookieJar: cookieJar
  }
  const fetchWithOpts = simpleFetch(fetchOpts)
  if (cookie) cookieJar.setCookieSync('xf_session=' + cookie, toFetch)
  if (user) cookieJar.setCookieSync('xf_user=' + user, toFetch)
  let existingFic
  if (filename) {
    existingFic = Fic.fromJSON(TOML.parse(fs.readFileSync(filename)))
  } else {
    let ficFile
    try {
      ficFile = fs.readFileSync(toFetch)
    } catch (_) {
    }
    if (ficFile) {
      existingFic = Fic.fromJSON(TOML.parse(ficFile))
      filename = toFetch
      toFetch = existingFic.updateFrom || existingFic.link
    }
  }
  let ficReady
  if (fromThreadmarks && fromScrape) {
    ficReady = Fic.fromUrlAndScrape(fetchWithOpts, toFetch)
  } else if (fromThreadmarks) {
    ficReady = Fic.fromUrl(fetchWithOpts, toFetch)
  } else {
    ficReady = Fic.scrapeFromUrl(fetchWithOpts, toFetch)
  }
  ficReady.then(fic => {
    fetchOpts.cacheBreak = false
    const actions = []
    let outFic
    if (existingFic) {
      outFic = existingFic
      // copy over any newly acquired metadata but don't
      if (outFic.title == null) outFic.title = fic.title
      if (outFic.author == null) outFic.author = fic.author
      if (outFic.authorUrl == null) outFic.authorUrl = fic.authorUrl
      if (outFic.created == null) outFic.created = fic.created
      if (outFic.modified == null) outFic.modified = fic.modified
      if (outFic.description == null) outFic.description = fic.description
      if (outFic.tags == null) outFic.tags = fic.tags
      const toAdd = []
      // Walk from the newest to the oldest marking chapters to add.
      // Stop when we find one that already exists.
      // This saves us from readding middle chapters that were previously pruned.
      for (let ii = fic.chapters.length - 1; ii>=0; --ii) {
        const newChapter = fic.chapters[ii]
        if (outFic.chapterExists(newChapter.link) || outFic.chapterExists(newChapter.fetchFrom)) break
        toAdd.unshift(newChapter)
      }
      // Find any chapters with created dates and update them if need be.
      for (let chapter of outFic.chapters) {
        const match = fic.chapters.filter(andChapterEquals(chapter)).filter(function (newChapter) {
          // the new chapter has our new metadata
          return !!newChapter.created
        })
        if (!match || !match.length) continue
        for (let newChapter of match) {
          if (newChapter.created && !dateEqual(newChapter.created, chapter.created)) {
            actions.push('Updated creation date for chapter "' + newChapter.name + '" from ' + chapter.created + ' to ' + newChapter.created)
            chapter.created = newChapter.created
          }
        }
      }
      // obviously the fic-level create/modified dates may have changed…
      if (!dateEqual(outFic.modified, fic.modified) && outFic.modified < fic.modified) {
        actions.push('Updated fic last update time from ' + outFic.modified + ' to ' + fic.modified)
        outFic.modified = fic.modified
      }
      // finally, push on those chapters we flagged for addition earlier.
      outFic.chapters.push.apply(outFic.chapters, toAdd)
      if (toAdd.length) actions.push('Added ' + toAdd.length + ' new chapters')
    } else {
      outFic = fic
    }
    if (!actions.length && filename) process.exit(1)
    if (!filename) filename = filenameize(outFic.title) + '.fic.toml'
    fs.writeFileSync(filename, TOML.stringify(outFic))
    process.stdout.write(filename + '\n')
    if (actions.length) process.stdout.write('    ' + actions.join('\n    ') + '\n')

    return null
  })
}

function andChapterEquals (chapterA) {
  return chapterB => chapterEqual(chapterA, chapterB)
}

function chapterEqual (chapterA, chapterB) {
  return (chapterA.link && chapterB.link && chapterA.link === chapterB.link) ||
         (chapterA.fetchFrom && chapterB.fetchFrom && chapterA.fetchFrom === chapterB.fetchFrom)
}

function dateEqual (dateA, dateB) {
  const dateAStr = dateA && dateA.toISOString && dateA.toISOString()
  const dateBStr = dateB && dateB.toISOString && dateB.toISOString()
  return dateAStr === dateBStr
}