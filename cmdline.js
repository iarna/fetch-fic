#!/usr/bin/env node
'use strict'
var fs = require('fs')
var xenforoToEpub = require('./index.js')

return main(process.argv.slice(2))

function main (args) {
  if (args.length < 1) {
    console.error('xenforo-to-epub <url> [<xf_session>]')
    process.exit(1)
  }
  var toFetch = args[0]
  var cookie = args[1]

  xenforoToEpub(toFetch, cookie).catch (function (err) {
    if (err.epub) {
      console.log('Error fetching story:', err.message)
    } else {
      console.log(err.stack)
    }
  }).then(function (epub) {
    epub.pipe(fs.createWriteStream(epub.filename))
    epub.on('error', function (err) {
      console.log('Error writing ' + epub.filename + ': ' + err)
    })
    epub.on('finish', function () {
      console.log(epub.filename)
    })
  })
}
