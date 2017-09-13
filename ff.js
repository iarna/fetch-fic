#!/usr/bin/env node --max_old_space_size=4096
'use strict'
const ff = require('./index.js')

const onExit = require('signal-exit')
const yargs = require('yargs')

const outputFormats = use('output-formats')
const progress = use('progress')

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

let command

function setCommand (cmd) {
  return () => command = cmd
}

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
    default: 6,
    describe: 'maximum number of chapters/images/etc to fetch at a time'
  })
  .option('requests-per-second', {
    alias: 'rps',
    type: 'number',
    default: 0.25,
    describe: 'maximum number of HTTP requests per second'
  })
}

const argv = yargs
  .usage('Usage: $0 <cmd> [options…]')
  .demand(1, 'ff <cmd> --help — for help on a specific command')
  .command({
    command: 'get <url|fic...>',
    aliases: [],
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
    handler: setCommand(ff.get)
  })
  .command({
    command: 'update <fic...>',
    desc: 'Update fic with latest chapter list',
    aliases: ['up'],
    builder: yargs => {
      yargs.option('add-all', {
        type: 'boolean',
        default: false,
        describe: 'if true, merge ALL missing chapters in instead of just NEW ones'
      })
      .option('add-none', {
        type: 'boolean',
        default: false,
        describe: 'if true, add no new chapters, just update other metadata'
      })
      .option('scrape', {
        type: 'boolean',
        describe: 'scrape the index instead of using threadmarks'
      })
      .option('and-scrape', {
        type: 'boolean',
        describe: 'pull chapters from BOTH the index AND the threadmarks'
      })
      .option('fast', {
        type: 'boolean',
        describe: "Don't do any updates if the chapter count hasn't changed"
      })
      .option('refresh', {
        type: 'boolean',
        describe: "Write a fresh copy of the fic.toml file even if there were not updates"
      })
      .demand(1, '<fic> - A fic metadata file to update with the latest chapters. Typically ends in .fic.toml')
      networkOptions(yargs, false)
    },
    handler: setCommand(ff.update)
  })
  .command({
    command: 'generate <fic...>',
    aliases: ['get', 'gen'],
    desc: 'Generate epub (or other) from fic',
    builder: yargs => {
      yargs.option('o', {
        alias: 'output',
        describe: 'Set output format',
        default: 'epub',
        choices: outputFormats
      })
      networkOptions(yargs, true)
      yargs.demand(1, '<fic> - A fic metadata file to generate an epub or other file format for. Typically ends in .fic.toml')
    },
    handler: setCommand(ff.generate)
  })
  .command({
    command: 'cache-clear <url>',
    desc: 'Remove a URL from the cache',
    aliases: ['clear-cache', 'clear'],
    builder: yargs => {
      yargs.demand(1, '<url> - A URL to remove from the cache.')
    },
    handler: setCommand(ff.cacheClear)
  })
  .option('debug', {
    type: 'boolean',
    default: process.env.BLUEBIRD_DEBUG && process.env.BLUEBIRD_DEBUG !== '0',
    global: true
  })
  .option('verbose', {
    global: true
  })
  .strict()
  .help()
  .argv

let exited = false

function errorHandler (err) {
  exited = true
  process.progress.hide()
  if (argv.debug) {
    console.log(err.stack)
  } else if (err.code === 'ENOENT') {
    console.log(err.message
      .replace(/^ENOENT: no such file or directory, (?:scandir|open) '(.*?)'$/, 'Could not find fic: $1'))
  } else if (err.code === 404) {
    console.log(`Fic not found at: ${err.url}`)
  } else if (err.code === 403) {
    console.log(`Authorization required to download fic. You may consider trying the "--xf_user" option.`)
  } else if (err.code === 503) {
    console.log(`${err.site || "Service"} Unavailable: ${err.message}`)
    if (err.link) console.log(`URL: ${err.link}`)
  } else if (err.meta) {
    console.log(`Error downloading fic: ${err.meta.status} ${err.meta.statusText} from ${err.url}`)
  } else if (err.code === 'ENOSCRAPE' || err.code === 'ENOSITE') {
    console.log(err.message)
  } else {
    console.log('An error occured: ' + err.message)
  }
  process.exit(1)
}

function exitCodeHandler (exitCode) {
  exited = true
 if (typeof exitCode === 'number') process.exit(exitCode)
}

onExit(() => {
  if (exited) return
  console.log('Exited without resolving promises!')
})

if (argv.debug) process.env.BLUEBIRD_DEBUG = '1'
if (argv.verbose) progress.setVerbose(argv.verbose)

process.on('unhandledRejection', (reason, p) => {
   console.log('Unhandled Rejection at:', p, 'reason:', reason);
});

command(argv).catch(errorHandler).then(exitCodeHandler)
