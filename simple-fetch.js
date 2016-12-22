'use strict'
const cache = require('./cache.js')
const Bluebird = require('bluebird')
const callLimit = require('./call-limit')
const rawFetch = require('node-fetch')
rawFetch.Promise = Bluebird
const util = require('util')
const tough = require('tough-cookie')
const CookieJar = tough.CookieJar
const url = require('url')

const cookieJar = new CookieJar()

module.exports = function (_opts) {
  const fetch = callLimit(rawFetch, _opts.maxConcurrency || 4, 1000 / (_opts.requestsPerSecond || 1))
  const ourCookieJar = _opts.cookieJar || cookieJar
  const ourGlobalCookies = []
  function simpleFetch (what, noCache) {
    const opts = Object.assign({}, simpleFetch.options)
    if (!opts.cookieJar) opts.cookieJar = ourCookieJar
    if (noCache != null) opts.cacheBreak = noCache
    const href = what.href || what
    for (let cookie of ourGlobalCookies) {
      opts.cookieJar.setCookieSync(cookie, href)
    }
    if (what.referer) {
      if (!opts.headers) opts.headers = {}
      opts.headers.Referer = what.referer
    }
    return fetchWithCache(fetch, href, opts)
  }
  simpleFetch.options = _opts || {}
  simpleFetch.setCookieSync = function () { return ourCookieJar.setCookieSync.apply(ourCookieJar, arguments) }
  simpleFetch.setGlobalCookie = cookie => ourGlobalCookies.push(cookie)
  return simpleFetch
}

module.exports.CookieJar = CookieJar

function NoNetwork (toFetch, opts) {
  const err = new Error(`Not found in cache: ${toFetch} ${util.inspect(opts)}`)
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

function setCookieP (jar, cookie, link) {
  const linkP = url.parse(link)
  linkP.pathname = ''
  return new Bluebird((resolve, reject) => {
    jar.setCookie(cookie, url.format(linkP), (err, cookie) => {
      return err ? reject(err) : resolve(cookie)
    })
  })
}

function fetchWithCache (fetch, toFetch, opts) {
  return Bluebird.resolve(opts).then(opts => {
    if (opts.cacheBreak) return cache.invalidateUrl(toFetch)
  }).then(() => {
    return cache.readUrl(toFetch, (toFetch, meta) => {
      if (opts.noNetwork) throw NoNetwork(toFetch, opts)
      return getCookieStringP(opts.cookieJar, toFetch).then(cookies => {
        if (!opts.headers) opts.headers = {}
        opts.headers.Cookie = cookies
        const domain = url.parse(toFetch).hostname.replace(/^forums?[.]/, '')
        if (meta.headers && meta.headers['last-modified']) {
          opts.headers['If-Modified-Since'] = meta.headers['last-modified']
        }
        return fetch(domain, toFetch, opts)
      })
    })
  }).spread((meta, content) => {
    if (meta.headers && meta.headers['set-cookie']) {
      const setCookies = meta.headers['set-cookie'].map(rawCookie => setCookieP(opts.cookieJar, rawCookie, meta.finalUrl || toFetch))
      return Bluebird.all(setCookies).thenReturn([meta, content])
    } else {
      return [meta, content]
    }
  })
}
