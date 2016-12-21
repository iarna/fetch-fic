#!/usr/bin/env node
'use strict'
const outputFormats = require('./output-formats.js')
const yargs = require('yargs')

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

function networkOptions (yargs, cacheDefault) {
  return yargs.option('xf_user', {
    type: 'string',
    describe: 'the value to set the xf_user cookie to, for authenticating with xenforo sites'
  })
  .option('cache', {
    type: 'boolean',
    default: cacheDefault,
    describe: 'fetch from the network even if we have it cached'
  })
  .option('network', {
    describe: 'allow network access; when false, cache-misses are errors',
    type: 'boolean',
    default: true
  })
  .option('concurrency', {
    type: 'number',
    default: 4,
    describe: 'maximum number of chapters/images/etc to fetch at a time'
  })
  .option('requests-per-second', {
    alias: 'rps',
    type: 'number',
    default: 1,
    describe: 'maximum number of HTTP requests per second'
  })
}

const argv = yargs
//  .demand(1, 'ff <cmd> --help — for help on a specific command')
  .command({
    command: 'read <url>',
    aliases: ['get', 'meta'],
    desc: 'Get chapter list for a fic',
    builder: yargs => {
      yargs.option('scrape', {
        type: 'boolean',
        describe: 'scrape the index instead of using threadmarks'
      })
      .option('and-scrape', {
        type: 'boolean',
        describe: 'pull chapters from BOTH the index AND the threadmarks'
      })
      .demand(1, '<url> - The URL to fetch chapters for')
      networkOptions(yargs, false)
    },
    handler: ffRead
  })
  .command({
    command: 'update <fic...>',
    desc: 'Update fic with latest chapter list',
    builder: yargs => {
      yargs.option('add-all', {
        type: 'boolean',
        default: false,
        describe: 'if true, merge ALL missing chapters in instead of just NEW ones'
      })
      .option('scrape', {
        type: 'boolean',
        describe: 'scrape the index instead of using threadmarks'
      })
      .option('and-scrape', {
        type: 'boolean',
        describe: 'pull chapters from BOTH the index AND the threadmarks'
      })
      .demand(1, '<fic> - A fic metadata file to fetch a fic for. Typically ends in .fic.toml')
      networkOptions(yargs, false)
    },
    handler: ffUpdate
  })
  .command({
    command: 'gen <fic...>',
    aliases: ['write', 'fetch', 'generate',],
    desc: 'Generate epub (or other) from fic',
    builder: yargs => {
      yargs.option('o', {
        alias: 'output',
        describe: 'Set output format',
        default: 'epub',
        choices: outputFormats
      })
      networkOptions(yargs, true)
      yargs.demand(1, '<fic> - A fic metadata file to fetch a fic for. Typically ends in .fic.toml')
    },
    handler: ffWrite
  })
  .command({
    command: 'cache-clear <url>',
    desc: 'Remove a URL from the cache',
    builder: yargs => {
      yargs.demand(1, '<url> - A URL to remove from the cache.')
    },
    handler: ffCacheClear
  })
  .option('debug', {
    type: 'boolean',
    default: process.env.BLUEBIRD_DEBUG && process.env.BLUEBIRD_DEBUG !== '0',
    global: true
  })
  .demand(1, ['debug'])
  .strict()
  .help()
  .argv

function globalArgs (args) {
  if (args.debug) process.env.BLUEBIRD_DEBUG = '1'
}

function ffRead (args) {
  globalArgs(args)
  require('./ff-read.js')(args).catch(errorHandler)
}

function ffUpdate (args) {
  globalArgs(args)
  require('./ff-update.js')(args).catch(errorHandler)
}

function ffWrite (args) {
  globalArgs(args)
  require('./ff-write.js')(args).catch(errorHandler)
}

function ffCacheClear (args) {
  globalArgs(args)
  require('./ff-cache-clear.js')(args).catch(errorHandler)
}

function errorHandler (err) {
  if (argv.debug) {
    console.log(err.stack)
  } else if (err.code === 'ENOENT') {
    console.log(err.message.replace(/^ENOENT: no such file or directory, open '(.*?)'$/,
      'Could not find fic: $1'))
  } else {
    console.log('An error occured: ' + err.message)
  }
  process.exit(1)
}
