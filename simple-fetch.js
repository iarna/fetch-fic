'use strict'
var cache = require('./cache.js')
var Bluebird = require('bluebird')
var promisify = require('./promisify')
var fetch = require('node-fetch')
fetch.Promise = Bluebird

module.exports = function (_opts) {
  return function (url, noCache, binary) {
    var opts = Object.assign({}, _opts)
    if (noCache) opts.noCache = true
    if (binary) opts.binary = true
    return fetchWithCache(url, opts)
  }
}

var CacheBreak = new Error('CACHEBREAK')
CacheBreak.code = 'CACHEBREAK'

function NoNetwork (toFetch, opts) {
  var err = new Error(`Not found in cache: ${toFetch} ${util.inspect(opts)}`)
  err.code = 'NETWORKDISABLED'
  return err
}

function fetchWithCache (toFetch, opts) {
  return Bluebird.resolve(opts).then(function (opts) {
    if (opts.noCache || opts.cacheBreak) return cache.clearURL(toFetch)
  }).then(function () {
    return cache.readURL(toFetch, function (toFetch) {
      if (opts.noNetwork) throw NoNetwork(toFetch, opts)
      return fetch(toFetch, opts)
    })
  }).spread(function (meta, content) {
    return [meta.finalURL, content]
  })
}
