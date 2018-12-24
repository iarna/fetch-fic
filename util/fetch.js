'use strict'
const url = require('url')
const util = require('util')
const moment = require('moment')

const pkg = require('../package.json')
const USER_AGENT = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10.13; rv:59.0; ${pkg.name}/${pkg.version}; +${pkg.homepage}) Gecko/20100101 Firefox/59.0`

const fetchBackOff = use('fetch-back-off')
const rawFetch = require('make-fetch-happen').defaults({
  cache: 'no-store',
  retry: 0,
  redirect: 'manual'
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
    if (!jar) return resolve()
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
  if (opts.cacheBreak) await cache.invalidateUrl(toFetch)
  let meta = {}
  let content
  try {
    [meta, content] = await cache.get(toFetch)
    meta.fromCache = true
    if (!meta.finalUrl) meta.finalUrl = toFetch
  } catch (ex) {}
  if (!content || cache.cacheBreak) {
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
    if (meta.headers && meta.headers['set-cookie'] && /questionablequest/.test(toFetch)) {
      for (let rawCookie of meta.headers['set-cookie']) {
        try {
          await setCookieP(opts.cookieJar, rawCookie, meta.finalUrl || toFetch)
        } catch (_) {}
      }
    }
    //process.emit('warn', 'Downloading', toFetch)
    process.emit('debug', 'Fetching from net', toFetch, opts.cacheBreak)
    let [res, data] = await fetch(toFetch, opts)
    // only use this new version if:
    // 1. the cached version was an error
    // 2. OR the result from THIS fetch was a success
    // this means that errors from attempts to update don't stomp on earlier
    // successes.
    if (meta.status !== 200 || res.status === 200) {
      meta.finalUrl = res.url || toFetch
      meta.status = res.status
      meta.statusText = res.statusText
      meta.headers = res.headers.raw()
      meta.fetchedAt = Date.now()
      if (meta.status && meta.status !== 304) {
        meta.fromCache = false
        await cache.set(toFetch, meta, data)
        content = data
      }
    }
  }
  if (meta.fromCache) {
    process.emit('debug', 'Using cached', toFetch)
  }
  if (meta.status && meta.status === 403) {
    const err = new Error('Got status: ' + meta.status + ' ' + meta.statusText + ' for ' + toFetch)
    err.code = meta.status
    err.url = toFetch
    err.meta = meta
    throw err
  } else if (meta.status && meta.status === 429) {
    const err = new Error('Got status: ' + meta.status + ' ' + meta.statusText + ' for ' + toFetch)
    err.code = meta.status
    err.url = toFetch
    err.meta = meta
    err.retryAfter = meta.headers['retry-after']
    throw err
  } else if (meta.status && meta.status === 404) {
    const err = new Error('Got status: ' + meta.status + ' ' + meta.statusText + ' for ' + toFetch)
    err.code = meta.status
    err.url = toFetch
    err.meta = meta
    throw err
  } else if (meta.status && (meta.status < 200 || meta.status >= 400) ) {
    const err = new Error('Got status: ' + meta.status + ' ' + meta.statusText + ' for ' + toFetch)
    err.code = meta.status
    err.url = toFetch
    err.meta = meta
    throw err
  }
  return [meta, content]
}
