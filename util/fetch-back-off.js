'use strict'
const moment = require('moment')
const url = require('url')

const aliases = {
  "forums.spacebattles.com": "SB",
  "forums.sufficientvelocity.com": "SV",
  "archiveofourown.org": "AO3",
  "fanfiction.net": "FFN",
  "questionablequesting.com": "QQ",
  "forum.questionablequesting.com": "QQ"
}
const state = {
  hosts: {},
  inflight: {}
}

module.exports = function (fetch) {
  function backoffFetch (uri, opts) {
    if (state.inflight[uri]) return state.inflight[uri]
    const start = moment()
    return state.inflight[uri] = ready(uri, opts, async () => {
      try {
        return await tryFetch(fetch, uri, opts)
      } finally {
//      process.emit('warn', `Completed ${uri} in ${(moment() - start) / 1000}s`)
        delete state.inflight[uri]
      }
    })
  }
  backoffFetch.defaults = fetch.defaults

  return backoffFetch
}

/*
setInterval(() => {
  if (Object.keys(state.inflight).length === 0) return
  let status = `Inflight: ${Object.keys(state.inflight).length} ` + Object.keys(state.hosts).filter(h => {
    const hi = state.hosts[h]
    return hi.queue.length || hi.flying
  }).map(h => {
    const hi = state.hosts[h]
    return `${aliases[h] || h} (Q:${hi.queue.length} F:${hi.flying} Lr:${(moment() - hi.lastReq) / 1000} lC${(moment() - hi.lastComplete) / 1000} B:${hi.waitfor ? hi.waitfor.till : '-'})`
  }).join(' ')
  status += '\n    ' + Object.keys(state.inflight).join('\n    ')
  process.emit('warn', status)
}, 1500).unref()
*/

async function tryFetch (fetch, uri, opts, tries) {
  if (!tries) tries = 0
  const info = hostState(uri)
  if (tries) process.emit('warn', `Fetching ${uri}, #${tries + 1}, in flight: ${info.flying}, lastS: ${moment(info.lastReq)}, lastC: ${moment(info.lastComplete)}, backingoff: ${info.waitfor ? info.waitfor.till : 'false'}`)
  info.lastReq = Number(moment())
  try {
    const res = await fetch(uri, opts)
    const content = await res.buffer()
    return [res, content]
  } catch (err) {
    const perSite = (opts.perSite || {})[hostname(uri)] || {}
    const maxRetries = perSite.maxRetries || opts.maxRetries || 5
    ++ tries
    if (tries > maxRetries) throw err
    const retryDelay = 1500 * (tries ** 2)
    if (err.code === 408 || err.type === 'body-timeout' || /timeout/i.test(err.message)) {
      process.emit('warn', `Timeout on ${uri} sleeping`, retryDelay / 1000, 'seconds')
      await backoff(uri, retryDelay)
      return tryFetch(fetch, uri, opts, tries)
    } else if (err.code === 429) {
      let retryAfter = 3000 * (tries ** 2)
      if (err.retryAfter) {
        if (/^\d+$/.test(err.retryAfter)) {
          retryAfter = Number(err.retryAfter) * 1000
        } else {
          retryAfter = (moment().unix() - moment.utc(err.retryAfter, 'ddd, DD MMM YYYY HH:mm:ss ZZ').unix()) * 1000
        }
      }
      process.emit('warn', 'Request backoff requested, sleeping', retryAfter / 1000, 'seconds', `(${err.retryAfter ? 'at: ' + err.retryAfter + ', ' : ''}now: ${moment.utc()})`)
      await backoff(uri, retryAfter)
      return tryFetch(fetch, uri, opts, tries)
    } else {
      throw err
    }
  }
}

function hostname (uri) {
  return url.parse(uri).host
}

function hostState (uri) {
  const host = hostname(uri)
  if (!state.hosts[host]) state.hosts[host] = {name: host, queue: [], flying: 0, lastReq: null, lastComplete: null, waitfor: null}
  return state.hosts[host]
}

function ready (uri, opts, fn) {
  const info = hostState(uri)
  return new Promise(done => {
    info.queue.push({fn, done})
    runqueue(info, opts, uri)
  })
}

async function runqueue (info, opts, enqueued) {
  if (info.waitfor) {
    if (enqueued) process.emit('warn', 'Defering due to backoff', enqueued)
    return
  }
  const perSite = (opts.perSite || {})[info.name] || {}
  if (info.flying > (perSite.maxConcurrency || opts.maxConcurrency)) {
//    if (enqueued) process.emit('warn', 'Defering due to concurrency controls', enqueued)
    return
  }
  const secondsPerRequest = 1 / (perSite.requestsPerSecond || opts.requestsPerSecond || 4)
  const sinceLast = info.lastReq ? (Number(moment()) - info.lastReq) / 1000 : Infinity
  const secondsBetweenRequests = perSite.secondsBetweenRequests || opts.secondsBetweenRequests || 0
  const sinceLastComplete = info.lastComplete ? (Number(moment()) - info.lastComplete) / 1000 : Infinity
  if (sinceLast < secondsPerRequest) {
//    if (enqueued) process.emit('warn', `Delaying for ${secondsPerRequest - sinceLast}s due to rate controls`, enqueued)
    return setTimeout(() => runqueue(info, opts), (secondsPerRequest - sinceLast) * 1000)
  }
  if (sinceLastComplete < secondsBetweenRequests) {
//    if (enqueued) process.emit('warn', `Delaying for ${secondsBetweenRequests - sinceLastComplete}s due to rate completion controls`, enqueued)
    return setTimeout(() => runqueue(info, opts), (secondsBetweenRequests - sinceLastComplete) * 1000)
  }

  if (!info.queue.length) return
//  if (enqueued) process.emit('warn', 'Fetching immediately', enqueued)
  const next = info.queue.shift()
  ++ info.flying
  info.lastReq = Number(moment())
  next.done((function () {
    try {
      return next.fn()
    } finally {
      -- info.flying
      info.lastComplete = Number(moment())
      setImmediate(runqueue, info, opts)
    }
  })())
}

function backoff (uri, time) {
  const info = hostState(uri)
  if (info.waitfor) {
//process.emit('warn', 'Backing off of', info.name, 'extending time by', time)
    info.waitfor.till += time
  } else {
//process.emit('warn', 'Backing off of', info.name, 'for', time)
    info.waitfor = {}
    info.waitfor.till = moment() + time
    info.waitfor.promise = new Promise((resolve, reject) => {
      setTimeout(() => checkTime(info, resolve), time)
    })
  }
  return info.waitfor.promise
}

function checkTime (info, resolve) {
  const timeLeft = info.waitfor.till - Number(moment())
  if (timeLeft >= 1) {
    process.emit('warn', 'Backoff woke up for', info.name, 'but need to sleep for another', timeLeft, 'ms')
    setTimeout(() => checkTime(info, resolve), timeLeft)
  } else {
    process.emit('warn', 'Backoff complete for', info.name)
    delete info.waitfor
    resolve()
  }
}
