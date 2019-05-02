'use strict'
const moment = require('moment')
const url = require('url')

const aliases = {
  "forums.spacebattles.com": "SB",
  "forums.sufficientvelocity.com": "SV",
  "archiveofourown.org": "AO3",
  "fanfiction.net": "FFN",
  "questionablequesting.com": "QQ",
  "forum.questionablequesting.com": "QQ",
  "www.alternatehistory.com": "AH"
}

let queueRunner
const state = {
  hosts: {},
  inflight: {},
  enqueued: 0
}

module.exports = (fetch) => {
  const start = Number(moment())
  async function backoffFetch (uri, opts) {
    if (state.inflight[uri]) return state.inflight[uri]
    state.inflight[uri] = enqueue(fetch, uri, opts)
    try {
      return await state.inflight[uri]
    } finally {
      //process.emit('warn', `Completed ${uri} in ${(moment() - start) / 1000}s`)
      delete state.inflight[uri]
    }
  }
  backoffFetch.defaults = fetch.defaults

  return backoffFetch
}

function enqueue (fetch, uri, opts) {
  const info = hostState(uri)
  ++ state.enqueued
  return new Promise(done => {
    info.queue.push({
      fetch,
      uri,
      opts,
      done: _ => {
        if (0 === -- state.enqueued) stopRunner()
        return done(_)
      }
    })
    startRunner()
  })
}

function startRunner () {
  if (queueRunner) return
  queueRunner = setInterval(runQueue, 150)
  runQueue()
}

function stopRunner () {
  if (!queueRunner) return
  clearInterval(queueRunner)
  queueRunner = null
}

function hostname (uri) {
  return url.parse(uri).host
}

function hostState (uri) {
  const host = hostname(uri)
  if (!state.hosts[host]) state.hosts[host] = {name: host, queue: [], flying: 0, nextReq: null, lastReq: null, lastComplete: null, waitfor: null}
  return state.hosts[host]
}


let last = Number(moment)
async function runQueue () {
  const now = Number(moment())

  let status = `Inflight: ${state.enqueued} / ${Object.keys(state.inflight).length} ` + Object.keys(state.hosts).filter(h => {
    const hi = state.hosts[h]
    return hi.queue.length || hi.flying
  }).map(h => {
    const hi = state.hosts[h]
    return `${aliases[h] || h} (Q:${hi.queue.length} F:${hi.flying} Lr:${(now - hi.lastReq) / 1000} lC${(now - hi.lastComplete) / 1000} N:${hi.nextReq ? hi.nextReq - now : '-'})`
  }).join(' ')
  status += '\n    ' + Object.keys(state.inflight).join('\n    ')
  if (now - last > 3 && (state.inflight || state.enqueued)) {
    last = now
    process.emit('debug', status)
  }
  for (let name of Object.keys(state.hosts)) {
    const host = state.hosts[name]
    if (host.nextReq && host.nextReq > now) continue
    while (host.queue.length) {
      const info = host.queue[0]
      const perSite = (info.opts.perSite || {})[hostname(info.uri)] || {}
      const maxRetries = perSite.maxRetries || info.opts.maxRetries || 5
      if (host.flying > (perSite.maxConcurrency || info.opts.maxConcurrency)) {
//        process.emit('warn', 'Defering due to concurrency controls', host.name, host.flying)
        break
      }
      const secondsPerRequest = 1 / (perSite.requestsPerSecond || info.opts.requestsPerSecond || 4)
      const sinceLast = host.lastReq ? (Number(moment()) - host.lastReq) / 1000 : Infinity
      const secondsBetweenRequests = perSite.secondsBetweenRequests || info.opts.secondsBetweenRequests || 0
      const sinceLastComplete = host.lastComplete ? (Number(moment()) - host.lastComplete) / 1000 : Infinity
      if (sinceLast < secondsPerRequest) {
//        process.emit('warn', `Delaying for ${secondsPerRequest - sinceLast}s due to rate controls`)
        const next = now + ((secondsPerRequest - sinceLast) * 1000)
        if (!host.nextReq || next > host.nextReq) host.nextReq = next
        break
      }
      if (sinceLastComplete < secondsBetweenRequests) {
//        process.emit('warn', `Delaying for ${secondsBetweenRequests - sinceLastComplete}s due to rate completion controls`)
        const next = now + ((secondsBetweenRequests - sinceLastComplete) * 1000)
        if (!host.nextReq || next > host.nextReq) host.nextReq = next
        break
      }
      host.queue.shift()
      host.lastReq = now
      ++host.flying
      info.fetch(info.uri, info.opts).then(async res => {
        const content = await res.buffer()
        if (res.status === 429) {
          let retryAfter = 3000 + (500* (info.tries ** 2))
          if (meta.headers['retry-after']) {
            if (/^\d+$/.test(meta.headers['retry-after'])) {
              retryAfter = Number(meta.headers['retry-after']) * 1000
            } else {
              retryAfter = (moment().unix() - moment.utc(meta.headers['retry-after'], 'ddd, DD MMM YYYY HH:mm:ss ZZ').unix()) * 1000
            }
          }
          process.emit('warn', 'Request backoff requested, sleeping', retryAfter / 1000, 'seconds', `(${meta.headers['retry-after'] ? 'at: ' + meta.headers['retry-after'] + ', ' : ''}now: ${moment.utc()})`)
          host.queue.unshift(info)
          host.nextReq = Number(moment()) + retryAfter
        } else {
          return info.done([res, content])
        }
      }).catch(err => {
        if (!info.tries) info.tries = 0
        ++info.tries
        if (info.tries > maxRetries) throw err
        const retryDelay = 1500 + (500* (info.tries ** 2))
        if (err.code === 408 || err.type === 'body-timeout' || /timeout/i.test(err.message)) {
          process.emit('warn', `Timeout on ${info.uri} sleeping`, retryDelay / 1000, 'seconds')
          host.queue.unshift(info)
          host.nextReq = Number(moment()) + retryDelay
        } else if (err.code === 429) {
          let retryAfter = 3000 + (500* (info.tries ** 2))
          if (err.retryAfter) {
            if (/^\d+$/.test(err.retryAfter)) {
              retryAfter = Number(err.retryAfter) * 1000
            } else {
              retryAfter = (moment().unix() - moment.utc(err.retryAfter, 'ddd, DD MMM YYYY HH:mm:ss ZZ').unix()) * 1000
            }
          }
          process.emit('warn', 'Request backoff requested, sleeping', retryAfter / 1000, 'seconds', `(${err.retryAfter ? 'at: ' + err.retryAfter + ', ' : ''}now: ${moment.utc()})`)
          host.queue.unshift(info)
          host.nextReq = Number(moment()) + retryAfter
        } else {
          throw err
        }
      }).finally(() => {
        -- host.flying
        host.lastComplete = Number(moment())
      }).catch(err => info.done(Promise.reject(err)))
    }
  }
}
