'use strict'
const argv = require('yargs')
  .usage('Usage: $0 <fic> [--xf_session=<sessionid>] [--xf_user=<userid>]')
  .demand(1, '<fic> - A fic metadata file to fetch a fic for. Typically ends in .fic.toml')
  .option('xf_session', {
    type: 'string',
    describe: 'value of your xf_session variable'
  })
  .option('xf_user', {
    type: 'string',
    describe: 'value of your xf_user variable'
  })
  .option('cache', {
     type: 'boolean',
     default: true,
     describe: 'fetch from the network even if we have it cached'
  })
  .option('network', {
    describe: 'allow network access; when false, cache-misses are errors',
    type: 'boolean',
    default: true
   })
  .option('concurrency', {
     type: 'number',
     default: 4,
     describe: 'maximum number of chapters/images/etc to fetch at a time'
   })
  .option('requests-per-second', {
    alias: 'rps',
    type: 'number',
    default: 1,
    describe: 'maximum number of HTTP requests per second'
  })
  .argv
const TOML = require('@iarna/toml')
const Fic = require('./fic')
const fs = require('fs')
const wordcount = require('wordcount')
const simpleFetch = require('./simple-fetch')
const Bluebird = require('bluebird')
const cheerio = require('cheerio')
const url = require('url')
const Gauge = require('gauge')
const TrackerGroup = require('are-we-there-yet').TrackerGroup

const maxConcurrency = argv.concurrency
const requestsPerSecond = argv['requests-per-second']
const cookie = argv.xf_session
const user = argv.xf_user
const cookieJar = new simpleFetch.CookieJar()
const fetchOpts = {
  cacheBreak: !argv.cache,
  noNetwork: !argv.network,
  cookieJar,
  maxConcurrency,
  requestsPerSecond
}
const fetch = simpleFetch(fetchOpts)

const gauge = new Gauge()
const pulseInterval = setInterval(function () {
  gauge.pulse()
}, 50)
const trackerGroup = new TrackerGroup()
trackerGroup.on('change', (name, completed) => gauge.show({completed: completed}))

Bluebird.each(argv._, filename => {
  const fic = Fic.fromJSON(TOML.parse(fs.readFileSync(filename)))
  const fics = (fic.chapters.length ? [fic] : []).concat(fic.fics)

  const linkP = url.parse(fic.updateFrom || fic.link)
  linkP.pathname = ''
  const link = url.format(linkP)
  if (cookie) cookieJar.setCookieSync('xf_session=' + cookie, link)
  if (user) cookieJar.setCookieSync('xf_user=' + user, link)

  return Bluebird.map(fics, fic => {
    const ficTracker = trackerGroup.newItem(`${fic.title}`, fic.chapters.length)
    let words = 0
    return Bluebird.map(fic.chapters, meta => {
      gauge.show(`${fic.title}: Chapter ${meta.order + 1}`)
      return fic.getChapter(fetch, meta.link).then(chapter => {
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
      })
    }).then(() => {
      fic.chapters.forEach(meta => words += meta.words)
      fic.words = words
      ficTracker.finish()
    })
  }).then(() => {
    fs.writeFileSync(filename, TOML.stringify(fic))
  })
}).then(() => clearInterval(pulseInterval))
