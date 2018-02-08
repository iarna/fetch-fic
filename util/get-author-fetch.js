'use strict'
module.exports = fetchFor

const path = require('path')
const fs = require('fs')
const requireInject = require('require-inject')

const progress = use('progress')
const plainFetch = use('fetch').wrapWith(progress.spinWhileAnd)

let cookieFile = '.authors_cookies.json'
let cookiePath 
const searchPath = [process.cwd(), __dirname]
for (let search of searchPath) {
  let lastPath
  while (search !== lastPath) {
    if (fs.existsSync(`${search}/${cookieFile}`)) {
      cookiePath = `${search}/${cookieFile}`
      break
    }
    lastPath = search
    search = path.resolve(search, '..')
  }
  if (cookiePath) break
}

const auth = {}

if (cookiePath) {
  const authCookies = require(cookiePath)
  Object.keys(authCookies).forEach(site => {
    let fetch = requireInject('./fetch.js')
    authCookies[site].forEach(cookie => {
      fetch = fetch.setGlobalCookie(cookie)
    })
    auth[site] = fetch.wrapWith(progress.spinWhileAnd)
  })
} else {
  process.emit('warn', `Could not find authors_cookies.json in ${searchPath.join(', ')}, falling back to uncookied fetch.}`)
}

function site (url) {
  if (/spacebattles/.test(url)) return 'sb'
  if (/sufficientvelocity/.test(url)) return 'sv'
  if (/fanfiction.net/.test(url)) return 'ff'
  if (/questionable/.test(url)) return 'qq'
  if (/archiveofourown/.test(url)) return 'ao3'
  return 'other'
}

function fetchFor (url) {
  return auth[site(url)] || plainFetch
}
