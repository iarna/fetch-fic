#!/usr/bin/env node
'use strict'
const fs = require('fs')
const unrtf = require('unrtf')
const HTML2BBCode = require('html2bbcode').HTML2BBCode

const rtf = fs.readFileSync(process.argv[2], 'utf8')

unrtf(rtf, (err, result) => {
  if (err) throw err
  const converter = new HTML2BBCode()
  const bbcode = converter.feed(result.html)
  process.stdout.write(bbcode.toString().replace(/\n/g, '\n\n'))
  process.exit()
})

