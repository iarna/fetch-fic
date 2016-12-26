'use strict'
const os = require('os')
const url = require('url')
const crypto = require('crypto')
const Bluebird = require('bluebird')
const promisify = require('./promisify')
const path = require('path')
const pathDirname = promisify.args(path.dirname)
const mkdirp = promisify(require('mkdirp'))
const fs = require('fs')
const fsReadFile = promisify(fs.readFile)
const fsWriteFile = promisify(fs.writeFile)
const fsUnlink = promisify(fs.unlink)
const zlib = require('zlib')
const zlibGzip = promisify(zlib.gzip)
const zlibGunzip = promisify(zlib.gunzip)
const inFlight = require('./in-flight.js')

exports.readFile = readFile
exports.clearFile = clearFile
exports.readUrl = readUrl
exports.clearUrl = clearUrl
exports.invalidateUrl = invalidateUrl

const invalidated = {}

function resolveCall () {
  return Bluebird.all(arguments).then(args => {
    const fn = args.shift()
    return Bluebird.resolve(fn.apply(null, args))
  })
}

function cacheFilename (filename) {
  return Bluebird.resolve(filename).then(filename => {
    return path.join(os.homedir(), '.fetch-fic', filename)
  })
}

function readFile (filename, onMiss) {
  const cacheFile = cacheFilename(filename)
  return inFlight(['read:', filename], thenReadFile)

  function thenReadFile () {
    return fsReadFile(cacheFile).catch(elseHandleMiss)
  }
  function elseHandleMiss () {
    return resolveCall(onMiss).then(content => writeFile(filename, Buffer.from(content)))
  }
}

function writeFile (filename, content) {
  const cacheFile = cacheFilename(filename)
  return inFlight(['write:', filename], thenWriteFile).thenReturn(content)

  function thenWriteFile () {
    return mkdirp(pathDirname(cacheFile)).then(() => fsWriteFile(cacheFile, content))
  }
}

function clearFile (filename) {
  const cacheFile = cacheFilename(filename)
  return ignoreHarmlessErrors(fsUnlink(cacheFile))
}

function readJSON (filename, onMiss) {
  return readFile(filename, stringifyOnMiss).then(result => JSON.parse(result))
  function stringifyOnMiss () {
    return resolveCall(onMiss).then(result => JSON.stringify(result, null, 2))
  }
}

/*
function writeJSON (filename, content) {
  return writeFile(filename, JSON.stringify(content, null, 2))
}
*/

function readGzipFile (filename, onMiss) {
  return readFile(filename, gzipOnMiss).then(buf => zlibGunzip(buf))

  function gzipOnMiss () {
    return resolveCall(onMiss).then(result => zlibGzip(result))
  }
}

function writeGzipFile (filename, content) {
  return writeFile(filename, zlibGzip(content)).thenReturn(content)
}

function getUrlHash (toFetch) {
  return Bluebird.resolve(toFetch).then(toFetch => {
    const parsed = url.parse(toFetch)
    parsed.hash = null
    const normalized = url.format(parsed)
    return crypto.createHash('sha256').update(normalized).digest('hex')
  })
}

function cacheUrlBase (fetchUrl) {
  return Bluebird.all([fetchUrl, getUrlHash(fetchUrl)]).spread((fetchUrl, urlHash) => {
    const fetchP = url.parse(fetchUrl)
    return path.join('urls', fetchP.hostname, urlHash.slice(0, 1), urlHash.slice(1, 2), urlHash)
  })
}
function cacheUrlMetaName (fetchUrl) {
  return cacheUrlBase(fetchUrl).then(cacheUrl => cacheUrl + '.json')
}
function cacheUrlContentName (fetchUrl) {
  return Bluebird.resolve(fetchUrl).then((fetchUrl) => {
    const fetchP = url.parse(fetchUrl)
    const ext = path.parse(fetchP.pathname).ext || '.data'
    return cacheUrlBase(fetchUrl).then(cacheUrl => cacheUrl + ext + '.gz')
  })
}

const noMetadata = new Error('NOMETADATA')
noMetadata.code = 'NOMETADATA'

function readUrl (fetchUrl, onMiss) {
  const metafile = cacheUrlMetaName(fetchUrl)
  const content = cacheUrlContentName(fetchUrl)
  const fetchedAt = Date.now()
  const meta = {
    startUrl: fetchUrl,
    finalUrl: null
  }
  let existingMeta = {}
  return inFlight(['readUrl:', fetchUrl], thenReadExistingMetadata)

  function thenReadExistingMetadata () {
    return readJSON(metafile, () => Promise.reject(noMetadata)).then(meta => {
      // corrupt JSON, clear the entry
      if (!meta || typeof meta !== 'object' || !meta.finalUrl) {
        return clearUrl(fetchUrl)
      } else {
        existingMeta = meta
        return null
      }
    }).catch(err => err.code !== 'NOMETADATA' && Promise.reject(err))
      .then(() => thenReadContent())
  }

  function thenReadContent () {
    let result
    if (invalidated[fetchUrl]) {
      delete invalidated[fetchUrl]
      result = writeGzipFile(content, orFetchUrl()).catch(err => {
        if (err.code !== 304) throw err
        return thenReadContent()
      })
    } else {
      result = readGzipFile(content, orFetchUrl).catch(err => {
        // corrupted gzips we retry, anything else explode
        if (err.code !== 'Z_DATA_ERROR') throw err
        return clearUrl(fetchUrl).then(() => {
          return readGzipFile(content, orFetchUrl)
        })
      })
    }
    return result.then(thenReadMetadata)
  }

  function orFetchUrl () {
    return resolveCall(onMiss, fetchUrl, existingMeta).then(res => {
      meta.finalUrl = res.url || meta.startUrl
      meta.status = res.status
      meta.statusText = res.statusText
      meta.headers = res.headers.raw()
      meta.fetchedAt = fetchedAt
      if (meta.status && meta.status === 304) {
        const err304 = new Error('Got status: ' + meta.status + ' ' + meta.statusText + ' for ' + fetchUrl)
        err304.code = meta.status
        err304.meta = meta
        return Bluebird.reject(err304)
        return thenReadContent().spread((_, data) => data)
      } else if (meta.status && meta.status !== 200) {
        const non200 = new Error('Got status: ' + meta.status + ' ' + meta.statusText + ' for ' + fetchUrl)
        non200.code = meta.status
        non200.meta = meta
        return Bluebird.reject(non200)
      }
      return res.buffer()
    })
  }

  function thenReadMetadata (result) {
    return Bluebird.all([metafile, readJSON(metafile, () => meta)]).spread((metafile, meta) => {
      meta.fromCache = meta.fetchedAt !== fetchedAt ? metafile : null
      if (meta.startURL) {
        meta.startUrl = meta.startURL
        delete meta.startURL
      }
      if (meta.finalURL) {
        meta.finalUrl = meta.finalURL
        delete meta.finalURL
      }
      if (!meta.finalUrl) meta.finalUrl = meta.startUrl
      return [meta, result]
    })
  }
}

function ignoreHarmlessErrors (p) {
  return p.catch(er => {
    if (er.code === 'ENOENT' || er.code === 'EINVAL') return
    throw er
  })
}

function clearUrl (fetchUrl) {
  const metafile = cacheUrlMetaName(fetchUrl)
  const content = cacheUrlContentName(fetchUrl)
  return Bluebird.all([clearFile(metafile), clearFile(content)])
}

function invalidateUrl (fetchUrl) {
  return Promise.resolve(fetchUrl).then(fetchUrl => { invalidated[fetchUrl] = true })
}
