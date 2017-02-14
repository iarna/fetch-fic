'use strict'
module.exports = read
const progress = use('progress')

function read (args) {
  const fs = use('fs-promises')
  return fs.stat(args.fic).then(file => {
    return file.isDirectory() ? _reallyRead(args) : _generateInstead()
  }, /*else*/ () => {
    return _reallyRead(args)
  })
}

function _generateInstead () {
  const args = [].concat(process.argv)
  for (let ii in args) {
    if (args[ii] === 'get') {
      args[ii] = 'generate'
      break
    }
  }
  const nodejs = args.shift()
  const Bluebird = require('bluebird')
  return new Bluebird((resolve, reject) => {
    const child_process = require('child_process')
    const child = child_process.spawn(nodejs, args, {
      argv0: 'ff',
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('close', resolve)
  })
}

function _reallyRead (args) {
  const addAll = args['add-all']
  const fromThreadmarks = !args.scrape
  const fromScrape = args.scrape || args['and-scrape']

  const fetchOpts = {
    cacheBreak: !args.cache,
    noNetwork: !args.network,
    maxConcurrency: args.concurrency,
    requestsPerSecond: args['requests-per-second'],
    timeout: 10000
  }
  const fetch = use('fetch')
  const fetchAndSpin = fetch.withOpts(fetchOpts).wrapWith(progress.spinWhileAnd)
  if (args.xf_user) fetchAndSpin.setGlobalCookie(`xf_user=${args.xf_user}`)

  function fetchFic () {
    const Fic = use('fic')
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
  const ficInflate = use('fic-inflate')
  return ficInflate(deflatedFic, fetchAndSpin.withOpts({cacheBreak: false})).then(fic => {
    const filenameize = use('filenameize')
    const filename = filenameize(fic.title) + '.fic.toml'
    const TOML = require('@iarna/toml')
    const fs = use('fs-promises')
    return fs.writeFile(filename, TOML.stringify(fic)).then(() => {
      progress.output(filename + '\n')
      return null
    })
  })
}
