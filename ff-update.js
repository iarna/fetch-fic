'use strict'
module.exports = update

const fs = require('fs')
const TOML = require('@iarna/toml')
const Bluebird = require('bluebird')
const qw = require('qw')
const Fic = require('./fic.js')
const ficInflate = require('./fic-inflate.js')
const progress = require('./progress.js')
const simpleFetch = require('./simple-fetch.js')
const filenameize = require('./filenameize.js')
const promisify = require('./promisify.js')

const readFile = promisify(fs.readFile)
const writeFile = promisify(fs.writeFile)
const TOMLstringify = promisify.args(TOML.stringify)

function update (args) {
  const fetchOpts = {
    cacheBreak: !args.cache,
    noNetwork: !args.network,
    maxConcurrency: args.concurrency,
    requestsPerSecond: args['requests-per-second']
  }
  const fetch = simpleFetch.withOpts(fetchOpts).wrapWith(progress.spinWhileAnd)
  if (args.xf_user) fetch.setGlobalCookie(`xf_user=${args.xf_user}`)

  return Bluebird.map(args.fic, updateFic(fetch, args)).reduce((exit, result) => result != null ? result : exit)
}

function readFic (fic) {
  return readFile(fic).then(toml => Fic.fromJSON(TOML.parse(toml)))
}

function updateFic (fetch, args) {
  const addAll = args['add-all']
  let fromThreadmarks = !args.scrape
  let fromScrape = args.scrape || args['and-scrape']

  return ficFile => {
    const existingFic = readFic(ficFile)
    const newFic = fetchLatestVersion(fetch, existingFic, fromThreadmarks, fromScrape)
    const changes = mergeFic(existingFic, newFic, addAll)
    return writeUpdatedFic(ficFile, existingFic, changes)
  }
}

function writeUpdatedFic (ficFile, existingFic, changes) {
  return Bluebird.resolve(changes).then(changes => {
    if (!changes) return null
    return writeFile(ficFile, TOMLstringify(existingFic)).then(() => {
      progress.output(`${ficFile}\n`)
      if (changes.length) progress.output(`    ${changes.join('\n    ')} \n`)
      return 1
    })
  })
}

var fetchLatestVersion = promisify.args((fetch, existingFic, fromThreadmarks, fromScrape) => {
  const updateFrom = existingFic.updateWith()
  let thisFromThreadmarks = (!existingFic.scrapeMeta && fromThreadmarks) || existingFic.fetchMeta
  let thisFromScrape = fromScrape || existingFic.scrapeMeta

  function getFic (fetch) {
    if (thisFromThreadmarks && thisFromScrape) {
      return Fic.fromUrlAndScrape(fetch, updateFrom)
    } else if (thisFromThreadmarks) {
      return Fic.fromUrl(fetch, updateFrom)
    } else {
      return Fic.scrapeFromUrl(fetch, updateFrom)
    }
  }

  // Fetch the fic from cache first, which ensures we get any cookies
  // associated with it, THEN fetch it w/o the cache to get updates.
  let newFic = getFic(fetch.withOpts({cacheBreak: false})).then(()=> getFic(fetch))

  return ficInflate(newFic, fetch.withOpts({cacheBreak: false}))
})

var mergeFic = promisify.args(function mergeFic (existingFic, newFic, addAll) {
  let changed = false
  const changes = []
  const toAdd = []
  // Walk from the newest to the oldest marking chapters to add.
  // Stop when we find one that already exists.
  // This saves us from readding middle chapters that were previously pruned.
  for (let ii = newFic.chapters.length - 1; ii >= 0; --ii) {
    const newChapter = newFic.chapters[ii]
    if (existingFic.chapterExists(newChapter.link) || existingFic.chapterExists(newChapter.fetchFrom)) {
      if (addAll) { continue } else { break }
    }
    toAdd.unshift(newChapter)
  }
  // Find any chapters with created dates and update them if need be.
  for (let chapter of existingFic.chapters) {
    const match = newFic.chapters.filter(andChapterEquals(chapter))
    for (let newChapter of match) {
      if (newChapter.created && !dateEqual(newChapter.created, chapter.created)) {
        changes.push(`Updated creation date for chapter "${newChapter.name}" from ${chapter.created} to ${newChapter.created}`)
        chapter.created = newChapter.created
      }
      if (newChapter.modified && !dateEqual(newChapter.modified, chapter.modified)) {
        changes.push(`Updated modification date for chapter "${newChapter.name}" from ${chapter.modified} to ${newChapter.modified}`)
        chapter.modified = newChapter.modified
      }
      for (let prop of qw`name link fetchFrom author authorUrl tags words`) {
        if (chapter[prop] == null && newChapter[prop] != null) {
          chapter[prop] = newChapter[prop]
          changes.push(`Set ${prop} for chapter "${newChapter.name}" to ${chapter[prop]}`)
        }
      }
    }
  }
  if (existingFic.tags == null && newFic.tags != null && newFic.tags.length) {
    existingFic.tags = newFic.tags
    changes.push(`Set fic tags to ${newFic.tags.join(', ')}`)
  }
  for (let prop of qw`description publisher author authorUrl updateFrom link title`) {
    if (existingFic[prop] == null && newFic[prop] != null) {
      existingFic[prop] = newFic[prop]
      changes.push(`Set fic ${prop} to ${existingFic[prop]}`)
    }
  }
  if (!dateEqual(existingFic.created, newFic.created) && existingFic.created > newFic.created) {
    changes.push(`Updated fic publish time from ${existingFic.created} to ${newFic.created}`)
    existingFic.created = newFic.created
  }
  if (!dateEqual(existingFic.modified, newFic.modified) && existingFic.modified < newFic.modified) {
    changes.push(`Updated fic last update time from ${existingFic.modified} to ${newFic.modified}`)
    existingFic.modified = newFic.modified
  }
  // finally, push on those chapters we flagged for addition earlier.
  existingFic.chapters.push.apply(existingFic.chapters, toAdd)
  if (toAdd.length) changes.push(`Added ${toAdd.length} new chapters`)

  let words = existingFic.chapters.reduce((words, chapter) => { return words + chapter.words }, 0)
  if (existingFic.words !== words) {
    existingFic.words = words
  }

  if (!changed && !changes.length) return null
  return changes
})

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
