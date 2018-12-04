'use strict'
const crypto = require('crypto')
const os = require('os')
const path = require('path')
const url = require('url')
const inflight = require('promise-inflight')

const fs = use('fs-promises')
const mkdirp = use('mkdirp')
const promisify = use('promisify')
const zlib = use('zlib-promises')

const pathDirname = promisify.args(path.dirname)

exports.clearUrl = clearUrl
exports.invalidateUrl = invalidateUrl
exports.exists = cacheExists
exports.get = cacheGetUrl
exports.set = cacheSetUrl

const invalidated = {}

async function cacheFilename (filename) {
  return path.join(os.homedir(), '.fetch-fic', await filename)
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

async function ignoreHarmlessErrors (p) {
  try {
    return await p
  } catch (er) {
    if (er.code === 'ENOENT' || er.code === 'EINVAL') return
    throw er
  }
}

function clearFile (filename) {
  const cacheFile = cacheFilename(filename)
  return ignoreHarmlessErrors(fs.unlink(cacheFile))
}

async function clearUrl (fetchUrl) {
  const metafile = cacheUrlMetaName(fetchUrl)
  const content = cacheUrlContentName(fetchUrl)
  return Promise.all([clearFile(metafile), clearFile(content)])
}

async function invalidateUrl (fetchUrl) {
  const furl = await fetchUrl
  invalidated[furl] = true
  invalidated[furl.replace(/#.*$/, '')] = true
}

async function cacheExists (fetchUrl) {
  const metafile = cacheFilename(cacheUrlMetaName(fetchUrl))
  const content = cacheFilename(cacheUrlContentName(fetchUrl))
  const [metaExists, contentExists] = await Promise.all([fs.exists(metafile), fs.exists(content)])
  return metaExists && contentExists
}

async function cacheGetUrl (fetchUrl) {
  const furl = fetchUrl
  if (invalidated[furl]) {
    delete invalidated[furl]
    throw new Error('Cache entry invalidated')
  }
  if (!(await cacheExists(furl))) {
    throw new Error('URL does not exist in cache')
  }
  const metafile = cacheFilename(cacheUrlMetaName(furl))
  const contentfile = cacheFilename(cacheUrlContentName(furl))
  return inflight(['get:', furl], async () => {
    const [meta, content] = await Promise.all([
      fs.readFile(metafile),
      fs.readFile(contentfile)
    ])
    return Promise.all([parseJSON(meta), zlib.gunzip(content)])
  })
}

async function parseJSON (data) {
  try {
    return JSON.parse(data)
  } catch (_) {
    return Promise.reject(_)
  }
}

async function cacheSetUrl (fetchUrl, meta, content) {
  const metafile = cacheFilename(cacheUrlMetaName(fetchUrl))
  const contentfile = cacheFilename(cacheUrlContentName(fetchUrl))
  await mkdirp(pathDirname(metafile))
  return Promise.all([
    fs.writeFile(metafile, JSON.stringify(meta)),
    fs.writeFile(contentfile, zlib.gzip(content))
  ])
}
