'use strict'
const os = require('os')
const url = require('url')
const crypto = require('crypto')
const Bluebird = require('bluebird')
const promisify = require('./promisify')
const path = require('path')
const pathDirname = promisify.sync(path.dirname)
const pathRelative = promisify.sync(path.relative)
const mkdirp = promisify(require('mkdirp'))
const fs = require('fs')
const fsReadFile = promisify(fs.readFile)
const fsWriteFile = promisify(fs.writeFile)
const fsUnlink = promisify(fs.unlink)
const fsSymlink = promisify(fs.symlink)
const fsReadlink = promisify(fs.readlink)
const zlib = require('zlib')
const zlibGzip = promisify(zlib.gzip)
const zlibGunzip = promisify(zlib.gunzip)
const util = require('util')
const inFlight = require('./in-flight.js')

exports.readFile = readFile
exports.clearFile = clearFile
exports.readUrl = readUrl
exports.clearUrl = clearUrl

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
    return resolveCall(onMiss).then(content => writeFile(filename, new Buffer(content)))
  }
}

function writeFile (filename, content) {
  const cacheFile = cacheFilename(filename)
  return inFlight('write:' + filename, thenWriteFile).thenReturn(content)

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

function readGzipFile (filename, onMiss) {
  return readFile(filename, gzipOnMiss).then(buf => zlibGunzip(buf))

  function gzipOnMiss () {
    return resolveCall(onMiss).then(result => zlibGzip(result))
  }
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

function readUrl (fetchUrl, onMiss) {
  const metafile = cacheUrlMetaName(fetchUrl)
  const content = cacheUrlContentName(fetchUrl)
  const fetchedAt = Date.now()
  const meta = {
    startUrl: fetchUrl,
    finalUrl: null
  }
  return inFlight(fetchUrl, thenReadContent)

  function thenReadContent () {
    return readGzipFile(content, orFetchUrl).then(thenReadMetadata)
  }

  function orFetchUrl () {
    return resolveCall(onMiss, fetchUrl).then(res => {
      meta.finalUrl   = res.url || meta.startUrl
      meta.status     = res.status
      meta.statusText = res.statusText
      meta.headers    = res.headers.raw()
      meta.fetchedAt  = fetchedAt
      if (meta.status && meta.status !== 200) {
        const non200 = new Error('Got status: ' + meta.status + ' ' + meta.statusText + ' for ' + fetchUrl)
        non200.meta = meta
        return Bluebird.reject(non200)
      }
      return res.buffer()
    })
  }

  function thenReadMetadata (result) {
    return readJSON(metafile, () => meta).then(meta => {
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
      return linkUrl(meta).thenReturn([meta, result])
    })
  }
}

function ignoreHarmlessErrors (p) {
  return p.catch(er => {
    if (er.code === 'ENOENT' || er.code === 'EINVAL') return
    throw er
  })
}

function linkUrl (meta) {
  if (meta.startUrl === meta.finalUrl) return Bluebird.resolve()
  const startm = cacheFilename(cacheUrlMetaName(meta.startUrl))
  const startc = cacheFilename(cacheUrlContentName(meta.startUrl))
  const finalm = cacheFilename(cacheUrlMetaName(meta.finalUrl))
  const finalc = cacheFilename(cacheUrlContentName(meta.finalUrl))
  return Bluebird.all([
    pathDirname(finalm),
    ignoreHarmlessErrors(fsReadlink(finalm)),
    ignoreHarmlessErrors(fsReadlink(finalc)),
    startm,
    startc
  ]).spread((fd, fm, fc, sm, sc) => {
    const rfm = fm && path.resolve(fd, fm)
    const rfc = fc && path.resolve(fd, fc)
    if (sm === rfm && sc === rfc) return Bluebird.resolve()
    return Bluebird.all([
      ignoreHarmlessErrors(fsUnlink(finalm)),
      ignoreHarmlessErrors(fsUnlink(finalc)),
      mkdirp(pathDirname(finalm))
    ]).then(() => {
      return Bluebird.all([
//        fsSymlink(pathRelative(pathDirname(finalm), startm), finalm),
//        fsSymlink(pathRelative(pathDirname(finalc), startc), finalc)
      ]).catch((er) => {
        if (er.code === 'EEXIST') return
        throw er
      })
    })
  })
}

function clearUrl (fetchUrl) {
  const metafile = cacheUrlMetaName(fetchUrl)
  const content = cacheUrlContentName(fetchUrl)
  return Bluebird.all([clearFile(metafile), clearFile(content)])
}
