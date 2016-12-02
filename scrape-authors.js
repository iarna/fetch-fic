'use strict'
const argv = require('yargs')
  .usage('Usage: $0 <fic> [--xf_session=<sessionid>] [--xf_user=<userid>]')
  .demand(1, '<fic> - A fic metadata file to fetch a fic for. Typically ends in .fic.toml')
  .describe('xf_session', 'value of your xf_session variable')
  .describe('xf_user', 'value of your xf_session variable')
  .boolean('cache')
  .default('cache', true)
  .describe('cache', 'fetch from the network even if we have it cached')
  .boolean('network')
  .default('network', true)
  .describe('network', 'allow network access; when false, cache-misses are errors')
  .argv
const TOML = require('@iarna/toml')
const Fic = require('./fic')
const fs = require('fs')
const wordcount = require('wordcount')
const simpleFetch = require('./simple-fetch')
const Bluebird = require('bluebird')
const cheerio = require('cheerio')
const url = require('url')


const fic = Fic.fromJSON(TOML.parse(fs.readFileSync(argv._[0])))

const cookie = argv.xf_session
const user = argv.xf_user
const cookieJar = new simpleFetch.CookieJar()
const fetchOpts = {
  cacheBreak: !argv.cache,
  noNetwork: !argv.network,
  cookieJar: cookieJar
}
const fetch = simpleFetch(fetchOpts)
var linkP = url.parse(fic.updateFrom || fic.link)
linkP.pathname = ''
var link = url.format(linkP)
if (cookie) cookieJar.setCookieSync('xf_session=' + cookie, link)
if (user) cookieJar.setCookieSync('xf_user=' + user, link)
const fics = (fic.chapters.length ? [fic] : []).concat(fic.fics)
Bluebird.each(fics, fic => {
  let words = 0
  return Bluebird.each(fic.chapters, meta => {
    process.stdout.write(`Updating chapter ${meta.order + 1}`)
    return fic.getChapter(fetch, meta.link).then(chapter => {
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
  })
}).then(() => {
  fs.writeFileSync(argv._[0], TOML.stringify(fic))
})
