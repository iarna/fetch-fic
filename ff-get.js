'use strict'
module.exports = read

const fs = require('fs')
const TOML = require('@iarna/toml')
const Fic = require('./fic.js')
const ficInflate = require('./fic-inflate.js')
const progress = require('./progress.js')
const simpleFetch = require('./simple-fetch.js')
const filenameize = require('./filenameize.js')
const promisify = require('./promisify.js')

const writeFile = promisify(fs.writeFile)

function read (args) {
  const addAll = args['add-all']
  const fromThreadmarks = !args.scrape
  const fromScrape = args.scrape || args['and-scrape']

  const fetchOpts = {
    cacheBreak: !args.cache,
    noNetwork: !args.network,
    maxConcurrency: args.concurrency,
    requestsPerSecond: args['requests-per-second']
  }
  const fetch = simpleFetch.withOpts(fetchOpts).wrapWith(progress.spinWhileAnd)
  if (args.xf_user) fetch.setGlobalCookie(`xf_user=${args.xf_user}`)

  function fetchFic () {
    if (fromThreadmarks && fromScrape) {
      return Fic.fromUrlAndScrape(fetch, args.url)
    } else if (fromThreadmarks) {
      return Fic.fromUrl(fetch, args.url)
    } else {
      return Fic.scrapeFromUrl(fetch, args.url)
    }
  }

  function enableCache () {
    fetch.options.cacheBreak = false
  }

  const fetchTracker = progress.newWork('Table of Contents', 0)
  progress.show('Table of Contents', `Downloading ${args.url}`)
  const deflatedFic = progress.addWork(fetchFic(), fetchTracker).finally(enableCache)
  return ficInflate(deflatedFic, fetch.withOpts({cacheBreak: false})).then(fic => {
    const filename = filenameize(fic.title) + '.fic.toml'
    return writeFile(filename, TOML.stringify(fic)).then(() => {
      progress.output(filename + '\n')
      return null
    })
  })
}
