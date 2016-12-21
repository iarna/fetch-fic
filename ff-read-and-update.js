'use strict'
exports.read = read
exports.update = update

const qw = require('qw')
const Bluebird = require('bluebird')
const promisify = require('./promisify.js')
const simpleFetch = require('./simple-fetch.js')
const filenameize = require('./filenameize.js')
const fs = require('fs')
const readFile = promisify(fs.readFile)
const writeFile = promisify(fs.writeFile)
const TOML = require('@iarna/toml')
const Fic = require('./fic.js')
const url = require('url')
const Gauge = require('gauge')
const TrackerGroup = require('are-we-there-yet').TrackerGroup
const cheerio = require('cheerio')
const wordcount = require('wordcount')

function read (args) {
  return track((gauge, group) => main(args, args.url, gauge, group))
}

function update (args) {
  let anyUpdates = false
  return track((gauge, group) => Bluebird.each(args.fic, fic => {
    return readFile(fic).then(toml => {
      return Fic.fromJSON(TOML.parse(toml))
    }).then(existingFic => {
      const updateFrom = existingFic.updateFrom || existingFic.link
      return main(args, updateFrom, gauge, group, existingFic, fic)
    }).then(thisUpdated => { if (thisUpdated) anyUpdates = true })
  })).then(() => anyUpdates ? 1 : 0)
}

function track (cb) {
  const gauge = new Gauge()
  const pulseInterval = setInterval(function () {
    gauge.pulse()
  }, 50)
  const trackerGroup = new TrackerGroup()
  trackerGroup.on('change', (name, completed) => gauge.show({completed: completed}))

  return cb(gauge, trackerGroup).then(() => clearInterval(pulseInterval))
}

function main (args, toFetch, gauge, trackerGroup, existingFic, filename) {
  const user = args.xf_user
  const addAll = args['add-all']
  const maxConcurrency = args.concurrency
  const requestsPerSecond = args['requests-per-second']
  const cookieJar = new simpleFetch.CookieJar()
  const fetchOpts = {
    cacheBreak: !args.cache,
    noNetwork: !args.network,
    cookieJar,
    maxConcurrency,
    requestsPerSecond
  }
  const fetchWithOpts = simpleFetch(fetchOpts)
  const linkP = url.parse(toFetch)
  linkP.pathname = ''
  const link = url.format(linkP)
  if (user) cookieJar.setCookieSync('xf_user=' + user, link)
  const ficSourced = existingFic && (existingFic.fetchMeta != null || existingFic.scrapeMeta != null)
  const fromThreadmarks = ficSourced ? existingFic.fetchMeta : !args.scrape
  const fromScrape = ficSourced ? existingFic.scrapeMeta : (args.scrape || args['and-scrape'])
  let ficReady
  if (fromThreadmarks && fromScrape) {
    ficReady = Fic.fromUrlAndScrape(fetchWithOpts, toFetch)
  } else if (fromThreadmarks) {
    ficReady = Fic.fromUrl(fetchWithOpts, toFetch)
  } else {
    ficReady = Fic.scrapeFromUrl(fetchWithOpts, toFetch)
  }
  return ficReady.then(fic => {
    fetchOpts.cacheBreak = false

    const ficTracker = trackerGroup.newItem(`${fic.title}`, fic.chapters.length)
    let words = 0
    return Bluebird.map(fic.chapters, meta => {
      gauge.show(`${fic.title}: Chapter ${meta.order + 1}`)
      return fic.getChapter(fetchWithOpts, meta.fetchFrom || meta.link).then(chapter => {
        gauge.show(`${fic.title}: Chapter ${meta.order + 1}`)
        ficTracker.completeWork(1)
        const $content = cheerio.load(chapter.content)
        $content('.bbCodeQuote').remove()
        meta.words = wordcount($content.text().trim())
        const author = meta.author || chapter.author || fic.author
        const authorUrl = meta.authorUrl || chapter.authorUrl || fic.authorUrl
        if (author !== fic.author) {
          meta.author = author
          meta.authorUrl = authorUrl
        }
        if (chapter.modified && (!meta.modified || chapter.modified > meta.modified)) {
          meta.modified = chapter.modified
          if (!fic.modified || meta.modified > fic.modified) {
            fic.modified = meta.modified
          }
        }
        if (chapter.created && (!meta.created || chapter.created < meta.created)) {
          meta.created = chapter.created
          if (!fic.created || meta.created < fic.created) {
            fic.created = meta.created
          }
          if (!fic.modified || meta.created > fic.modified) {
            fic.modified = meta.created
          }
        }
      }).catch(err => {
        gauge.hide()
        console.error(err.stack)
        gauge.show()
        ficTracker.completeWork(1)
      })
    }).then(() => {
      fic.chapters.forEach(meta => { words += meta.words })
      fic.words = words
      ficTracker.finish()
      return fic
    })
  }).then(fic => {
    let changed = false
    const changes = []
    let outFic
    if (existingFic) {
      outFic = existingFic
      // copy over any newly acquired metadata but don't
      const ficProps = qw`id title link updateFrom author authorUrl
        publisher description cover chapterHeadings externals tags includeTOC
        numberTOC fetchMeta scrapeMeta created modified`
      for (let prop of ficProps) {
        if (outFic[prop] == null && fic[prop] != null) {
          changed = true
          outFic[prop] = fic[prop]
        }
      }
      const toAdd = []
      // Walk from the newest to the oldest marking chapters to add.
      // Stop when we find one that already exists.
      // This saves us from readding middle chapters that were previously pruned.
      for (let ii = fic.chapters.length - 1; ii >= 0; --ii) {
        const newChapter = fic.chapters[ii]
        if (outFic.chapterExists(newChapter.link) || outFic.chapterExists(newChapter.fetchFrom)) {
          if (addAll) { continue } else { break }
        }
        toAdd.unshift(newChapter)
      }
      // Find any chapters with created dates and update them if need be.
      for (let chapter of outFic.chapters) {
        const match = fic.chapters.filter(andChapterEquals(chapter))
        for (let newChapter of match) {
          for (let prop of qw`name link fetchFrom created modified author authorUrl tags externals headings`) {
            if (chapter[prop] == null && newChapter[prop] != null) {
              changed = true
              chapter[prop] = newChapter[prop]
            }
          }
          chapter.words = newChapter.words
          if (newChapter.created && !dateEqual(newChapter.created, chapter.created)) {
            changes.push(`Updated creation date for chapter "${newChapter.name}" from ${chapter.created} to ${newChapter.created}`)
            chapter.created = newChapter.created
          }
          if (newChapter.modified && !dateEqual(newChapter.modified, chapter.modified)) {
            changes.push(`Updated modification date for chapter "${newChapter.name}" from ${chapter.modified} to ${newChapter.modified}`)
            chapter.modified = newChapter.modified
          }
        }
      }
      if (!dateEqual(outFic.created, fic.created) && outFic.created > fic.created) {
        changes.push('Updated fic publish time from ' + outFic.created + ' to ' + fic.created)
        outFic.created = fic.created
      }
      if (!dateEqual(outFic.modified, fic.modified) && outFic.modified < fic.modified) {
        changes.push('Updated fic last update time from ' + outFic.modified + ' to ' + fic.modified)
        outFic.modified = fic.modified
      }
      // finally, push on those chapters we flagged for addition earlier.
      outFic.chapters.push.apply(outFic.chapters, toAdd)
      if (toAdd.length) changes.push('Added ' + toAdd.length + ' new chapters')
    } else {
      outFic = fic
    }
    if (!changed && !changes.length || !args.fic) return null
    if (!filename) filename = filenameize(outFic.title) + '.fic.toml'
    return writeFile(filename, TOML.stringify(outFic)).then(() => {
      gauge.hide()
      process.stdout.write(filename + '\n')
      if (changes.length) process.stdout.write('    ' + changes.join('\n    ') + '\n')
      gauge.show()
      return true
    })
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
