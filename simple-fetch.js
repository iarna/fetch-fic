'use strict'
var path = require('path')
var homedir = require('os-homedir')
var url = require('url')
var crypto = require('crypto')
var Bluebird = require('bluebird')
var mkdirp = Bluebird.promisify(require('mkdirp'))
var fetch = require('node-fetch')
fetch.Promise = Bluebird
var fs = require('fs')
var readFile = Bluebird.promisify(fs.readFile)
var writeFile = Bluebird.promisify(fs.writeFile)

fetch.Promise = Bluebird

module.exports = function (opts) {
  return function (url) {
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
  var cachePath = path.join(homedir(), '.xenforo-to-epub', urlHash.slice(0,1), urlHash.slice(0,2))
  var cacheFile = path.join(cachePath, urlHash + '.json')
  if (inMemory[urlHash]) {
    return Bluebird.resolve(inMemory[urlHash])
  }
  return Bluebird.resolve().then(function () {
    if (opts.cacheBreak) throw new Error('skip cache')
  }).then(function () {
    return readFile(cacheFile, 'utf8')
  }).then(function (cached) {
    return inMemory[urlHash] = JSON.parse(cached)
  }).catch(function (err) {
    return fetch(toFetch, opts).then(function (res) {
      toFetch = res.url
      return res.text()
    }).then(function (result) {
      var hashes = [urlHash]
      var newHash = getUrlHash(toFetch)
      if (newHash !== urlHash) hashes.push(newHash)
      return Bluebird.each(hashes, function (hash) {
        inMemory[hash] = [toFetch, result]
      }).then(function () {
        return mkdirp(cachePath)
      }).then(function () {
        return writeFile(cacheFile, JSON.stringify(inMemory[urlHash]))
      }).then(function () {
        return inMemory[urlHash]
      }).catch(function (ex) {
        return inMemory[urlHash]
      })
    })
  })
}
