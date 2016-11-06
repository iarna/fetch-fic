'use strict'
var cache = require('./cache.js')
var Bluebird = require('bluebird')
var promisify = require('./promisify')
var fetch = require('node-fetch')
var util = require('util')
fetch.Promise = Bluebird

module.exports = function (_opts) {
  return function (url, noCache) {
    var opts = Object.assign({}, _opts)
    if (noCache != null) opts.cacheBreak = noCache
    return fetchWithCache(url, opts)
  }
}

function NoNetwork (toFetch, opts) {
  var err = new Error(`Not found in cache: ${toFetch} ${util.inspect(opts)}`)
  err.code = 'NETWORKDISABLED'
  return err
}

function fetchWithCache (toFetch, opts) {
  return Bluebird.resolve(opts).then(function (opts) {
    if (opts.noCache || opts.cacheBreak) return cache.clearUrl(toFetch)
  }).then(function () {
    return cache.readUrl(toFetch, function (toFetch) {
      if (opts.noNetwork) throw NoNetwork(toFetch, opts)
      return fetch(toFetch, opts)
    })
  }).spread(function (meta, content) {
    return [meta, content]
  })
}
