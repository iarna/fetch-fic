'use strict'
const url = require('url')
const util = require('util')

const Bluebird = require('bluebird')
const rawFetch = require('node-fetch')
const tough = require('tough-cookie')

const cache = use('cache')
const callLimit = use('call-limit')
const curryOptions = use('curry-options')

rawFetch.Promise = Bluebird
const CookieJar = tough.CookieJar

const cookieJar = new CookieJar()
const globalCookies = []

const curriedFetch = module.exports = curryOptions(cookiedFetch, addCookieFuncs, {cookieJar})

let limitedFetch
function cookiedFetch (href, opts) {
  for (let cookie of globalCookies) {
    opts.cookieJar.setCookieSync(cookie, href)
  }
  if (opts.referer) {
    if (!opts.headers) opts.headers = {}
    opts.headers.Referer = opts.referer
  }
  if (!limitedFetch) limitedFetch = callLimit(rawFetch, opts.maxConcurrency || 4, 1000 / (opts.requestsPerSecond || 1))
  return fetchWithCache(limitedFetch, href, opts)
}

function addCookieFuncs (fetch) {
  fetch.setCookieSync = function () {
    const ourCookieJar = fetch.options.cookieJar
    return ourCookieJar.setCookieSync.apply(ourCookieJar, arguments)
  }
  fetch.setGlobalCookie = cookie => globalCookies.push(cookie)
  return fetch
}

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
        process.emit('debug', 'Downloading', toFetch)
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
