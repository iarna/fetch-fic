'use strict'
const url = require('url')
const util = require('util')
const moment = require('moment')

const pkg = require('../package.json')
const USER_AGENT = `${pkg.name}/${pkg.version} (+${pkg.homepage})`

const fetchBackOff = use('fetch-back-off')
const rawFetch = require('make-fetch-happen').defaults({
  cache: 'no-store',
  retry: 0
})
const tough = require('tough-cookie')

const cache = use('cache')
const curryOptions = use('curry-options')

const CookieJar = tough.CookieJar

const cookieJar = new CookieJar()
const globalCookies = []

module.exports = curryOptions(cookiedFetch, addCookieFuncs, {cookieJar})


let limitedFetch
function cookiedFetch (href, opts) {
  const ourCookieJar = opts.cookieJar || cookieJar
  for (let cookie of globalCookies) {
    try {
      ourCookieJar.setCookieSync(cookie, href)
    } catch (_) {}
  }
  if (opts.referer) {
    if (!opts.headers) opts.headers = {}
    opts.headers.Referer = opts.referer
  }
  if (!limitedFetch) {
    limitedFetch = fetchBackOff(rawFetch.defaults({
      maxConcurrency: opts.maxConcurrency || 4,
      requestsPerSecond: opts.requestsPerSecond || 1
    }))
  }
  return fetchWithCache(limitedFetch, href, opts)
}

function addCookieFuncs (fetch) {
  fetch.setCookieSync = function () {
    const ourCookieJar = fetch.options.cookieJar || cookieJar
    return ourCookieJar.setCookieSync.apply(ourCookieJar, arguments)
  }
  fetch.setGlobalCookie = cookie => { globalCookies.push(cookie); return fetch }
  return fetch
}

function NoNetwork (toFetch, opts) {
  const err = new Error(`Not found in cache: ${toFetch}`)
  err.code = 'ENETWORKDISABLED'
  return err
}

function getCookieStringP (jar, url) {
  return new Promise((resolve, reject) => {
    return jar.getCookieString(url, (err, cookies) => {
      return err ? reject(err) : resolve(cookies)
    })
  })
}

function setCookieP (jar, cookie, link) {
  const linkP = url.parse(link)
  linkP.pathname = ''
  return new Promise((resolve, reject) => {
    jar.setCookie(cookie, url.format(linkP), (err, cookie) => {
      return err ? reject(err) : resolve(cookie)
    })
  })
}

async function fetchWithCache (fetch, toFetch, opts$) {
  const opts = Object.assign({}, await opts$)
  process.emit('debug', 'Fetching', toFetch, opts)
  if (opts.cacheBreak) await cache.invalidateUrl(toFetch)
  const [meta, content] = await cache.readUrl(toFetch, async (toFetch, meta) => {
    if (opts.noNetwork) throw NoNetwork(toFetch, opts)
    const cookies = await getCookieStringP(opts.cookieJar, toFetch)
    delete opts.cookieJar
    if (!opts.headers) opts.headers = {}
    opts.headers.Cookie = cookies
    const domain = url.parse(toFetch).hostname.replace(/^forums?[.]/, '')
    if (meta.headers && meta.headers['last-modified']) {
      opts.headers['If-Modified-Since'] = meta.headers['last-modified']
    }
    opts.headers['user-agent'] = USER_AGENT
    process.emit('debug', 'Downloading', toFetch, opts)
    return fetch(toFetch, opts)
  })
  if (meta.headers && meta.headers['set-cookie']) {
    for (let rawCookie of meta.headers['set-cookie']) {
      try {
        await setCookieP(opts.cookieJar, rawCookie, meta.finalUrl || toFetch)
      } catch (_) {}
    }
  }
  return [meta, content]
}
