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
var util = require('util')

fetch.Promise = Bluebird

module.exports = function (_opts) {
  return function (url, noCache, binary) {
    var opts = Object.assign({}, _opts)
    if (noCache) opts.noCache = true
    if (binary) opts.binary = true
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

var inFlight = {}

function fetchWithCache (toFetch, opts) {
  if (inFlight[toFetch]) return inFlight[toFetch]
  var finish
  inFlight[toFetch] = new Bluebird(function (resolve) { finish = resolve }).finally(function () {
    delete inFlight[toFetch]
  })
  var urlHash = getUrlHash(toFetch)
  var cachePath = path.join(homedir(), '.xenforo-to-epub', urlHash.slice(0, 1), urlHash.slice(0, 2))
  var cacheFile = path.join(cachePath, urlHash + '.json')
  if (!opts.noCache && inMemory[urlHash]) {
    finish(inMemory[urlHash])
    return inFlight[toFetch]
  }
  var useCache = opts.noCache || opts.cacheBreak ? Bluebird.reject(new Error()) : Bluebird.resolve()
  finish(useCache.then(function () {
    return readFile(cacheFile + '.gz').then(function (buf) {
      return zlib.gunzipSync(buf).toString('utf8')
    }).catch(function () {
      return readFile(cacheFile, 'utf8').tap(function (cached) {
        return writeFile(cacheFile + '.gz', gzip(cached)).then(function () {
          return unlink(cacheFile)
        }).reflect(function () {
          return cached
        })
      })
    })
  }).then(function (cached) {
    inMemory[urlHash] = JSON.parse(cached)
    return null
  }).catch(function (_) {
    if (opts.noNetwork) throw new Error('Not found in cache: ' + toFetch + ' ' + util.inspect(opts))
    return fetch(toFetch, opts).then(function (res) {
      toFetch = res.url
      return res.buffer()
    }).then(function (result) {
      var hashes = [urlHash]
      var newHash = getUrlHash(toFetch)
      if (newHash !== urlHash) hashes.push(newHash)
      return Bluebird.each(hashes, function (hash) {
        inMemory[hash] = [toFetch]
        if (opts.binary) {
          inMemory[hash][1] = result.toString('base64')
          inMemory[hash][2] = 'base64'
        } else {
          inMemory[hash][1] = result.toString('utf8')
        }
        if (/errorPanel/.test(result)) throw new Error('SKIP')
      }).then(function () {
        return mkdirp(cachePath)
      }).then(function () {
        return writeFile(cacheFile + '.gz', gzip(JSON.stringify(inMemory[urlHash])))
      }).catchReturn(true)
    })
  }).then(function () {
    var result = inMemory[urlHash]
    if (result[2]) {
      result[1] = Buffer.from ? Buffer.from(result[1], result[2]) : new Buffer(result[1], result[2])
    }
    return result
  }))
  return inFlight[toFetch]
}
