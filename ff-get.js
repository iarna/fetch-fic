'use strict'
module.exports = read
const progress = use('progress')
const map = use('map')
const streamClose = use('stream-close')

async function read (args) {
  const fs = use('fs-promises')
  const fics = await map(args.fic, async fic => {
    try {
      const file = await fs.stat(fic)
      return file.isDirectory() ? {type: 'url', fic} : {type: 'file', fic}
    } catch (_) {
      return {type: 'url', fic}
    }
  })

  const urls = fics.filter(f => f.type === 'url').map(f => f.fic)
  const files = fics.filter(f => f.type === 'file').map(f => f.fic)
  const todo = []
  if (files.length) {
    todo.push(_generateInstead(files))
  }
  if (urls.length) {
    todo.push(_reallyRead(urls, args))
  }
  return Promise.all(todo)
}

async function _generateInstead (files) {
  const nodejs = process.argv[0]
  let args = [process.argv[1]]
  for (let ii in process.argv) {
    if (ii <2) continue
    if (process.argv[ii] === 'get') {
      args.push('generate')
    } else if (process.argv[ii][0] !== '-') {
      // ignore non-options
    } else {
      args.push(process.argv[ii])
    }
  }
  args = args.concat(files)
  const spawn = require('child_process').spawn
  await streamClose(spawn(nodejs, args, {
    argv0: 'ff',
    stdio: 'inherit',
  }))
}

async function _reallyRead (urls, args) {
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

  return map(urls, async url => {
    function fetchFic () {
      const Fic = use('fic')
      if (fromThreadmarks && fromScrape) {
        return Fic.fromUrlAndScrape(fetchAndSpin, url)
      } else if (fromThreadmarks) {
        return Fic.fromUrl(fetchAndSpin, url)
      } else {
        return Fic.scrapeFromUrl(fetchAndSpin, url)
      }
    }

    function enableCache () {
      fetchAndSpin.options.cacheBreak = false
    }

    const fetchTracker = progress.newWork('Table of Contents', 0)
    progress.show('Table of Contents', `Downloading ${url}`)
    let deflatedFic
    try {
      deflatedFic = await progress.addWork(fetchFic(), fetchTracker)
    } finally {
      enableCache()
    }
    const ficInflate = use('fic-inflate')
    const fic = await ficInflate(deflatedFic, fetchAndSpin.withOpts({cacheBreak: false}))
    const filenameize = use('filenameize')
    // we shouldn't get here, but this acts as a final guard against an
    // empty fic getting written out to disk.
    if (fic.words === 0 && !fic.fics.length) {
      const err = Error(`${url} could not be retrieved.`)
      err.code = 404
      err.url = url
      throw err
    }
    const filename = filenameize(fic.title) + '.fic.toml'
    const TOML = require('@iarna/toml')
    const fs = use('fs-promises')
    await fs.writeFile(filename, TOML.stringify(fic))
    progress.output(filename + '\n')
    return filename
  })
}
