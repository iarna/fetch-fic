'use strict'
const Bluebird = require('bluebird')
const Buffer = require('safe-buffer').Buffer
const crypto = require('crypto')
const mkdirpCB = require('mkdirp')
const os = require('os')
const path = require('path')
const url = require('url')
const inflight = require('promise-inflight')

const fs = use('fs-promises')
const mkdirp = use('mkdirp')
const promisify = use('promisify')
const zlib = use('zlib-promises')

const pathDirname = promisify.args(path.dirname)

exports.readFile = readFile
exports.clearFile = clearFile
exports.readUrl = readUrl
exports.clearUrl = clearUrl
exports.invalidateUrl = invalidateUrl

const invalidated = {}

async function resolveCall (...promisedArgs) {
  const [fn, ...args] = await Promise.all(promisedArgs)
  return fn.apply(null, args)
}

async function cacheFilename (filename) {
  return path.join(os.homedir(), '.fetch-fic', await filename)
}

function readFile (filename, onMiss) {
  const cacheFile = cacheFilename(filename)
  return inflight(['read:', filename], thenReadFile)

  async function thenReadFile () {
    try {
      return await fs.readFile(cacheFile)
    } catch (_) {
      const content = await resolveCall(onMiss)
      return writeFile(filename, Buffer.from(content))
    }
  }
}

async function writeFile (filename, content) {
  const cacheFile = cacheFilename(filename)
  await inflight(['write:', filename], thenWriteFile)
  return content

  async function thenWriteFile () {
    await mkdirp(pathDirname(cacheFile))
    return fs.writeFile(cacheFile, content)
  }
}

function clearFile (filename) {
  const cacheFile = cacheFilename(filename)
  return ignoreHarmlessErrors(fs.unlink(cacheFile))
}

async function readJSON (filename, onMiss) {
  let didMiss = false
  const result = await readFile(filename, stringifyOnMiss)
  try {
    return JSON.parse(result)
  } catch (ex) {
    if (didMiss) throw ex
    await clearFile(filename)
    return JSON.parse(await readFile(filename, stringifyOnMiss))
  }

  async function stringifyOnMiss () {
    didMiss = true
    const result = await resolveCall(onMiss)
    return JSON.stringify(result, null, 2)
  }
}

/*
function writeJSON (filename, content) {
  return writeFile(filename, JSON.stringify(content, null, 2))
}
*/

async function readGzipFile (filename, onMiss) {
  const buf = await readFile(filename, gzipOnMiss)
  try {
    return await zlib.gunzip(buf)
  } catch (_) {
    await clearFile(filename)
    return readGzipFile(filename, onMiss)
  }

  async function gzipOnMiss () {
    const result = await resolveCall(onMiss)
    return zlib.gzip(result)
  }
}

async function writeGzipFile (filename, content) {
  await writeFile(filename, zlib.gzip(content))
  return content
}

async function getUrlHash (toFetch) {
  const parsed = url.parse(await toFetch)
  parsed.hash = null
  const normalized = url.format(parsed)
  return crypto.createHash('sha256').update(normalized).digest('hex')
}

async function cacheUrlBase (promisedFetchUrl) {
  const [fetchUrl, urlHash] = await Promise.all([promisedFetchUrl, getUrlHash(promisedFetchUrl)])
  const fetchP = url.parse(fetchUrl)
  return path.join('urls', fetchP.hostname, urlHash.slice(0, 1), urlHash.slice(1, 2), urlHash)
}
async function cacheUrlMetaName (fetchUrl) {
  const cacheUrl = await cacheUrlBase(fetchUrl)
  return cacheUrl + '.json'
}
async function cacheUrlContentName (promisedFetchUrl) {
  const fetchUrl = await promisedFetchUrl
  const fetchP = url.parse(fetchUrl)
  const ext = path.parse(fetchP.pathname).ext || '.data'
  return cacheUrlBase(fetchUrl).then(cacheUrl => cacheUrl + ext + '.gz')
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
  return inflight(['readUrl:', fetchUrl], thenReadExistingMetadata)

  function thenReadExistingMetadata () {
    return readJSON(metafile, () => Bluebird.reject(noMetadata)).then(meta => {
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
    let allow304 = false
    if (invalidated[fetchUrl]) {
      delete invalidated[fetchUrl]
      allow304 = true
      return writeGzipFile(content, orFetchUrl()).then(thenReadMetadata).catch(err => {
        if (err.code !== 304) throw err
        return thenReadContent()
      })
    } else {
      return readGzipFile(content, orFetchUrl).catch(err => {
        // corrupted gzips we retry, anything else explode
        if (err.code !== 'Z_DATA_ERROR') throw err
        return clearUrl(fetchUrl).then(() => {
          return readGzipFile(content, orFetchUrl)
        })
      }).then(thenReadMetadata)
    }
  }

  function orFetchUrl () {
    return resolveCall(onMiss, fetchUrl, existingMeta).then(([res, content]) => {
      meta.finalUrl = res.url || meta.startUrl
      meta.status = res.status
      meta.statusText = res.statusText
      meta.headers = res.headers.raw()
      meta.fetchedAt = fetchedAt
      if (meta.status && meta.status === 304) {
        return thenReadContent().then(([_, data]) => data)
      } else if (meta.status && meta.status === 403) {
        const err403 = new Error('Got status: ' + meta.status + ' ' + meta.statusText + ' for ' + fetchUrl)
        err403.code = meta.status
        err403.url = fetchUrl
        err403.meta = meta
        return Bluebird.reject(err403)
      } else if (meta.status && meta.status === 429) {
        const err429 = new Error('Got status: ' + meta.status + ' ' + meta.statusText + ' for ' + fetchUrl)
        err429.code = meta.status
        err429.url = fetchUrl
        err429.meta = meta
        err429.retryAfter = res.headers['retry-after']
        return Bluebird.reject(err429)
      } else if (meta.status && meta.status === 404) {
        const non200 = new Error('Got status: ' + meta.status + ' ' + meta.statusText + ' for ' + fetchUrl)
        non200.code = meta.status
        non200.url = fetchUrl
        non200.meta = meta
        return JSON.stringify(non200)
      } else if (meta.status && meta.status !== 200) {
        const non200 = new Error('Got status: ' + meta.status + ' ' + meta.statusText + ' for ' + fetchUrl)
        non200.code = meta.status
        non200.url = fetchUrl
        non200.meta = meta
        return Bluebird.reject(non200)
      }
      return content
    })
  }

  function thenReadMetadata (result) {
    return Bluebird.all([metafile, readJSON(metafile, () => meta)]).then(([metafile, meta]) => {
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
      if (meta.status && meta.status !== 200) {
        const non200 = new Error('Got status: ' + meta.status + ' ' + meta.statusText + ' for ' + fetchUrl)
        non200.code = meta.status
        non200.url = fetchUrl
        non200.meta = meta
        return Bluebird.reject(non200)
      }
      return [meta, result]
    })
  }
}

async function ignoreHarmlessErrors (p) {
  try {
    return await p
  } catch (er) {
    if (er.code === 'ENOENT' || er.code === 'EINVAL') return
    throw er
  }
}

function clearUrl (fetchUrl) {
  const metafile = cacheUrlMetaName(fetchUrl)
  const content = cacheUrlContentName(fetchUrl)
  return Promise.all([clearFile(metafile), clearFile(content)])
}

async function invalidateUrl (fetchUrl) {
  invalidated[await fetchUrl] = true
}
