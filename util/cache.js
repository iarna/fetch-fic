'use strict'
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
  const cacheUrl = await cacheUrlBase(fetchUrl)
  return cacheUrl + ext + '.gz'
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
  const err = new Error()
  let existingMeta = {}
  return inflight(['readUrl:', fetchUrl], thenReadExistingMetadata)

  async function thenReadExistingMetadata () {
    try {
      const meta = await readJSON(metafile, () => Promise.reject(noMetadata))
      // corrupt JSON, clear the entry
      if (!meta || typeof meta !== 'object' || !meta.finalUrl) {
        await clearUrl(fetchUrl)
      } else {
        existingMeta = meta
      }
    } catch (err) {
      if (err.code !== 'NOMETADATA') { throw err }
    }
    return thenReadContent()
  }

  async function thenReadContent () {
    let result
    let allow304 = false
    if (invalidated[fetchUrl]) {
      delete invalidated[fetchUrl]
      allow304 = true
      const [res, data] = await resolveCall(onMiss, fetchUrl, existingMeta)
      meta.finalUrl = res.url || meta.startUrl
      meta.status = res.status
      meta.statusText = res.statusText
      meta.headers = res.headers.raw()
      meta.fetchedAt = fetchedAt
      await writeJSON(metafile, meta)
      if (meta.status && meta.status === 304) {
        return thenReadContent()
      } else {
        await writeGzipFile(content, data)
        return rejectIfHTTPError(fetchUrl, meta, [meta, data], err)
      }
    } else {
      let data
      try {
        data = await readGzipFile(content, orFetchUrl)
      } catch (err) {
        // corrupted gzips we retry, anything else explode
        if (err.code !== 'Z_DATA_ERROR') throw err
        await clearUrl(fetchUrl)
        data = await readGzipFile(content, orFetchUrl)
      }
      return thenReadMetadata(data)
    }
  }

  async function orFetchUrl () {
    const [res, content] = await resolveCall(onMiss, fetchUrl, existingMeta)
    meta.finalUrl = res.url || meta.startUrl
    meta.status = res.status
    meta.statusText = res.statusText
    meta.headers = res.headers.raw()
    meta.fetchedAt = fetchedAt
    if (meta.status && meta.status === 304) {
      const [, data] = await thenReadContent()
      return data
    } else {
      return rejectIfHTTPError(fetchUrl, meta, content, err)
    }
  }

  async function thenReadMetadata (result) {
    const [newMetafile, newMeta] = await Promise.all([metafile, readJSON(metafile, () => meta)])
    newMeta.fromCache = newMeta.fetchedAt !== fetchedAt ? newMetafile : null
    if (newMeta.startURL) {
      newMeta.startUrl = newMeta.startURL
      delete newMeta.startURL
    }
    if (newMeta.finalURL) {
      newMeta.finalUrl = newMeta.finalURL
      delete newMeta.finalURL
    }
    if (!newMeta.finalUrl) newMeta.finalUrl = newMeta.startUrl
    return rejectIfHTTPError(newMeta.startUrl, newMeta, [newMeta, result], err)
  }
}

function rejectIfHTTPError (fetchUrl, meta, payload, err) {
  if (meta.status && meta.status === 403) {
    err.message = 'Got status: ' + meta.status + ' ' + meta.statusText + ' for ' + fetchUrl
    err.code = meta.status
    err.url = fetchUrl
    err.meta = meta
    return Promise.reject(err)
  } else if (meta.status && meta.status === 429) {
    err.message = 'Got status: ' + meta.status + ' ' + meta.statusText + ' for ' + fetchUrl
    err.code = meta.status
    err.url = fetchUrl
    err.meta = meta
    err.retryAfter = meta.headers['retry-after']
    return Promise.reject(err)
  } else if (meta.status && meta.status === 404) {
    err.message = 'Got status: ' + meta.status + ' ' + meta.statusText + ' for ' + fetchUrl
    err.code = meta.status
    err.url = fetchUrl
    err.meta = meta
    return Promise.reject(err)
  } else if (meta.status && (meta.status < 200 || meta.status >= 400) ) {
    err.message = 'Got status: ' + meta.status + ' ' + meta.statusText + ' for ' + fetchUrl
    err.code = meta.status
    err.url = fetchUrl
    err.meta = meta
    return Promise.reject(err)
  }
  return payload
}

async function ignoreHarmlessErrors (p) {
  try {
    return await p
  } catch (er) {
    if (er.code === 'ENOENT' || er.code === 'EINVAL') return
    throw er
  }
}

async function clearUrl (fetchUrl) {
  const metafile = cacheUrlMetaName(fetchUrl)
  const content = cacheUrlContentName(fetchUrl)
  return Promise.all([clearFile(metafile), clearFile(content)])
}

async function invalidateUrl (fetchUrl) {
  const furl = await fetchUrl
  invalidated[furl] = true
}
