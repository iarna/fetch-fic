'use strict'
module.exports = read
const progress = use('progress')
const Bluebird = require('bluebird')

function read (args) {
  const fs = use('fs-promises')
  return Bluebird.map(args.fic, fic => {
    return fs.stat(fic).then(file => {
      return file.isDirectory() ? ['url', fic] : ['file', fic]
    }, () => {
      return ['url', fic]
    })
  }).then(fics => {
    const urls = fics.filter(f => f[0] === 'url').map(f => f[1])
    const files = fics.filter(f => f[0] === 'file').map(f => f[1])
    const todo = []
    if (files.length) {
      todo.push(_generateInstead(files))
    }
    if (urls.length) {
      todo.push(_reallyRead(urls, args))
    }
    return Bluebird.all(todo)
  })
}

function _generateInstead (files) {
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

function _reallyRead (urls, args) {
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

  return Bluebird.map(urls, url => {
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
    const deflatedFic = progress.addWork(fetchFic(), fetchTracker).finally(enableCache)
    const ficInflate = use('fic-inflate')
    return ficInflate(deflatedFic, fetchAndSpin.withOpts({cacheBreak: false})).then(fic => {
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
      return fs.writeFile(filename, TOML.stringify(fic)).then(() => {
        progress.output(filename + '\n')
        return filename
      })
    })
  })
}
