'use strict'
var path = require('path')
var homedir = require('os-homedir')
var url = require('url')
var crypto = require('crypto')
var Bluebird = require('bluebird')
var promisify = require('./promisify')
var mkdirp = promisify(require('mkdirp'))
var fetch = require('node-fetch')
fetch.Promise = Bluebird
var fs = require('fs')
var readFile = promisify(fs.readFile)
var writeFile = promisify(fs.writeFile)
var unlink = promisify(fs.unlink)
var zlib = require('zlib')
var gzip = promisify(zlib.gzip)

fetch.Promise = Bluebird

module.exports = function (opts) {
  return function (url, noCache) {
    if (noCache) opts.noCache = true
    return fetchWithCache(url, opts)
  }
}

function getUrlHash (toFetch) {
  var parsed = url.parse(toFetch)
  parsed.hash = null
  var normalized = url.format(parsed)
  return crypto.createHash('sha1').update(normalized).digest('hex')
}

var inMemory = {}

function fetchWithCache (toFetch, opts) {
  var urlHash = getUrlHash(toFetch)
  var cachePath = path.join(homedir(), '.xenforo-to-epub', urlHash.slice(0, 1), urlHash.slice(0, 2))
  var cacheFile = path.join(cachePath, urlHash + '.json')
  if (!opts.noCache && inMemory[urlHash]) {
    return Bluebird.resolve(inMemory[urlHash])
  }
  var useCache = opts.noCache || opts.cacheBreak ? Bluebird.reject(new Error()) : Bluebird.resolve()
  return useCache.then(function () {
    return readFile(cacheFile + '.gz').then(function (buf) {
      return zlib.gunzipSync(buf).toString('utf8')
    }).catch(function () {
      return readFile(cacheFile, 'utf8').tap(function (cached) {
        return writeFile(cacheFile + '.gz', gzip(cached)).then(function () {
          return unlink(cacheFile)
        }).catchReturn(true)
      })
    })
  }).then(function (cached) {
    inMemory[urlHash] = JSON.parse(cached)
    return null
  }).catch(function (_) {
    return fetch(toFetch, opts).then(function (res) {
      toFetch = res.url
      return res.text()
    }).then(function (result) {
      var hashes = [urlHash]
      var newHash = getUrlHash(toFetch)
      if (newHash !== urlHash) hashes.push(newHash)
      return Bluebird.each(hashes, function (hash) {
        inMemory[hash] = [toFetch, result]
        if (/errorPanel/.test(result)) throw new Error('SKIP')
      }).then(function () {
        return mkdirp(cachePath)
      }).then(function () {
        return writeFile(cacheFile + '.gz', gzip(JSON.stringify(inMemory[urlHash])))
      }).catchReturn(true)
    })
  }).then(function (result) {
    return inMemory[urlHash]
  })
}
