#!/usr/bin/env node
'use strict'
module.exports = write

const fs = require('fs')
const url = require('url')

const TOML = require('@iarna/toml')

const fetch = use('fetch')
const Fic = use('fic')
const getFic = use('get-fic')
const Output = use('output')
const progress = use('progress')
const forEach = use('for-each')

function write (args) {
  const output = args.output
  const user = args.xf_user
  const maxConcurrency = args.concurrency
  const requestsPerSecond = args['requests-per-second']
  const fetchOpts = {
    cacheBreak: !args.cache,
    noNetwork: !args.network,
    timeout: 10000,
    maxConcurrency,
    requestsPerSecond
  }

  const fetchAndSpin = fetch.withOpts(fetchOpts).wrapWith(progress.spinWhileAnd)
  if (args.xf_user) fetchAndSpin.setGlobalCookie(`xf_user=${args.xf_user}`)

  const trackers = args.fic.map(() => progress.tracker.newItem(1))

  process.emit('debug', `Generating epubs for ${args.fic.join(', ')}`)
  return forEach(args.fic, {concurrency: 3}, async (ficFile, ficNum) => {
    process.emit('debug', `Generating #${ficNum} for ${ficFile}`)
    const topFic = Fic.fromJSON(TOML.parse(fs.readFileSync(ficFile, 'utf8')))
    let fics = (topFic.chapters.length ? [topFic] : []).concat(topFic.fics || [])
    const tracker = trackers[ficNum]
    const completeWhenDone = (fetch) => {
      return async (href, opts) => {
        try {
          return fetch(href, opts)
        } finally {
          tracker.completeWork(1)
        }
      }
    }
    const fetchAndFinish = fetchAndSpin.wrapWith(completeWhenDone)
    fetchAndFinish.tracker = tracker
    fics = fics.filter((fic, subficNum) => {
      if (topFic === fic && topFic.fics && !topFic.chapters) return false
      if (!fic.title) {
        process.emit('warn', `Skipping #${subficNum} in ${ficFile}, missing title`)
        return false
      }
      tracker.addWork(fic.chapters.length)
      process.emit('debug', `Fetching #${ficNum} for ${ficFile}: ${fic.title}`)
      return true
    })

    try {
      await forEach(fics, {concurrency: 10}, async (fic, subficNum, subficCount) => {
        let ficStatus = ''
        if (args.fic.length > 1) {
          ficStatus = subficCount > 1 ? ` [${ficNum + 1}.${subficNum + 1}/${args.fic.length}]` : ` [${ficNum + 1}/${args.fic.length}]`
        } else if (subficCount > 1) {
          ficStatus = ` [${subficNum + 1}/${subficCount}]`
        }
        progress.show(`${fic.title}${ficStatus}`, 'Fetching fic')
        process.emit('debug', `Outputting ${fic.title}`)
        const ficStream = getFic(fetchAndFinish, fic)
        const filename = await Output.as(output).from(ficStream).write()
        progress.output(`${filename}\n`)
      })
    } finally {
      process.emit('debug', `Fetching #${ficNum} for ${ficFile}: Complete`)
      tracker.finish()
      progress.hide()
      return
    }
  })
}
