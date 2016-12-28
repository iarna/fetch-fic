'use strict'
module.exports = read

const TOML = require('@iarna/toml')

const fetch = use('fetch')
const Fic = use('fic')
const ficInflate = use('fic-inflate')
const filenameize = use('filenameize')
const fs = use('fs-promises')
const progress = use('progress')

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
  const fetchAndSpin = fetch.withOpts(fetchOpts).wrapWith(progress.spinWhileAnd)
  if (args.xf_user) fetchAndSpin.setGlobalCookie(`xf_user=${args.xf_user}`)

  function fetchFic () {
    if (fromThreadmarks && fromScrape) {
      return Fic.fromUrlAndScrape(fetchAndSpin, args.url)
    } else if (fromThreadmarks) {
      return Fic.fromUrl(fetchAndSpin, args.url)
    } else {
      return Fic.scrapeFromUrl(fetchAndSpin, args.url)
    }
  }

  function enableCache () {
    fetchAndSpin.options.cacheBreak = false
  }

  const fetchTracker = progress.newWork('Table of Contents', 0)
  progress.show('Table of Contents', `Downloading ${args.url}`)
  const deflatedFic = progress.addWork(fetchFic(), fetchTracker).finally(enableCache)
  return ficInflate(deflatedFic, fetchAndSpin.withOpts({cacheBreak: false})).then(fic => {
    const filename = filenameize(fic.title) + '.fic.toml'
    return fs.writeFile(filename, TOML.stringify(fic)).then(() => {
      progress.output(filename + '\n')
      return null
    })
  })
}
