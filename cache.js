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
exports.readURL = readURL
exports.clearURL = clearURL

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

function writeJSON (filename, value) {
  return Bluebird.resolve(value).then(value => writeFile(filename, JSON.stringify(value, null, 2)))
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

function cacheURLBase (fetchURL) {
  return Bluebird.all([fetchURL, getUrlHash(fetchURL)]).spread((fetchURL, urlHash) => {
    const fetchP = url.parse(fetchURL)
    return path.join('urls', fetchP.hostname, urlHash.slice(0, 1), urlHash.slice(1, 2), urlHash)
  })
}
function cacheURLMetaName (fetchURL) {
  return cacheURLBase(fetchURL).then(cacheURL => cacheURL + '.json')
}
function cacheURLContentName (fetchURL) {
  return Bluebird.resolve(fetchURL).then((fetchURL) => {
    const fetchP = url.parse(fetchURL)
    const ext = path.parse(fetchP.pathname).ext || '.data'
    return cacheURLBase(fetchURL).then(cacheURL => cacheURL + ext + '.gz')
  })
}

function readURL (fetchURL, onMiss) {
  const metafile = cacheURLMetaName(fetchURL)
  const content = cacheURLContentName(fetchURL)
  const meta = {
    startURL: fetchURL,
    finalURL: null
  }
  return inFlight(fetchURL, thenReadContent)

  function thenReadContent () {
    return readGzipFile(content, orFetchURL).then(thenReadMetadata)
  }

  function orFetchURL () {
    return resolveCall(onMiss, fetchURL).then(res => {
      meta.finalURL   = res.url
      meta.status     = res.status
      meta.statusText = res.statusText
      meta.headers    = res.headers.raw()
      return res.buffer()
    })
  }

  function thenReadMetadata (result) {
    if (meta.status && meta.status !== 200) {
      const non404 = new Error('Got status: ' + meta.status + ' ' + meta.statusText + ' for ' + fetchURL)
      non404.meta = meta
      non404.result = result
      return Bluebird.reject(non404)
    }
    return readJSON(metafile, () => meta).then(meta => {
      return linkURL(meta).thenReturn([meta, result])
    })
  }
}

function ignoreHarmlessErrors (p) {
  return p.catch(er => {
    if (er.code === 'ENOENT' || er.code === 'EINVAL') return
    throw er
  })
}

function linkURL (meta) {
  if (meta.startURL === meta.finalURL) return Bluebird.resolve()
  const startm = cacheFilename(cacheURLMetaName(meta.startURL))
  const startc = cacheFilename(cacheURLContentName(meta.startURL))
  const finalm = cacheFilename(cacheURLMetaName(meta.finalURL))
  const finalc = cacheFilename(cacheURLContentName(meta.finalURL))
  return Bluebird.all([
    pathDirname(finalm),
    ignoreHarmlessErrors(fsReadlink(finalm)),
    ignoreHarmlessErrors(fsReadlink(finalc)),
    startm,
    startc
  ]).spread((fd, fm, fc, sc, sm) => {
    const rfm = fm && path.resolve(fd, fm)
    const rfc = fc && path.resolve(fd, fc)
    if (sm === rfm && sc === rfc) return Bluebird.resolve()
    return Bluebird.all([
      ignoreHarmlessErrors(fsUnlink(finalm)),
      ignoreHarmlessErrors(fsUnlink(finalc)),
      mkdirp(pathDirname(finalm))
    ]).then(() => {
      return Bluebird.all([
        fsSymlink(pathRelative(pathDirname(finalm), startm), finalm),
        fsSymlink(pathRelative(pathDirname(finalc), startc), finalc)
      ]).catch((er) => {
        if (er.code === 'EEXIST') return
        throw er
      })
    })
  })
}

function clearURL (fetchURL) {
  const metafile = cacheURLMetaName(fetchURL)
  const content = cacheURLContentName(fetchURL)
  return Bluebird.all([clearFile(metafile), clearFile(content)])
}
