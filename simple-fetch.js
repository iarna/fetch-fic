'use strict'
var cache = require('./cache.js')
var Bluebird = require('bluebird')
var promisify = require('./promisify')
var fetch = require('node-fetch')
fetch.Promise = Bluebird
var util = require('util')
var tough = require('tough-cookie')
var CookieJar = tough.CookieJar

var cookieJar = new CookieJar();

module.exports = function (_opts) {
  function simpleFetch (url, noCache) {
    var opts = Object.assign({}, simpleFetch.options)
    opts.cookieJar = cookieJar
    if (noCache != null) opts.cacheBreak = noCache
    return fetchWithCache(url, opts)
  }
  simpleFetch.options = _opts || {}
  return simpleFetch
}

module.exports.CookieJar = CookieJar

function NoNetwork (toFetch, opts) {
  var err = new Error(`Not found in cache: ${toFetch} ${util.inspect(opts)}`)
  err.code = 'NETWORKDISABLED'
  return err
}

function getCookieStringP (jar, url) {
  return new Bluebird((resolve, reject) => {
    return jar.getCookieString(url, (err, cookies) => {
      return err ? reject(err) : resolve(cookies)
    })
  })
}

function setCookieP (jar, cookie, url) {
  return new Bluebird((resolve, reject) => {
    jar.setCookie(cookie, url, (err, cookie) => {
      return err ? reject(err) : resolve(cookie)
    })
  })
}

function fetchWithCache (toFetch, opts) {
  return Bluebird.resolve(opts).then(function (opts) {
    if (opts.noCache || opts.cacheBreak) return cache.clearUrl(toFetch)
  }).then(function () {
    return cache.readUrl(toFetch, function (toFetch) {
      if (opts.noNetwork) throw NoNetwork(toFetch, opts)
      return getCookieStringP(opts.cookieJar, toFetch).then(cookies => {
        if (!opts.headers) opts.headers = {}
        opts.headers.Cookies = cookies
        return fetch(toFetch, opts)
      })
    })
  }).spread(function (meta, content) {
    if (meta.headers && meta.headers['set-cookie']) {
      const setCookies = meta.headers['set-cookie'].map(rawCookie => setCookieP(opts.cookieJar, rawCookie, toFetch))
      return Bluebird.all(setCookies).thenReturn([meta, content])
    } else {
      return [meta, content]
    }
  })
}
