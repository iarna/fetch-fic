#!/usr/bin/env node
'use strict'
const fs = require('fs')
const rtfToHTML = require('./rtf-to-html.js')
const promisify = require('./promisify.js')
const readFile = promisify(fs.readFile)
const HTMLToBBCode = require('./html-to-bbcode.js')
const stdoutWrite = promisify(process.stdout.write, process.stdout)

stdoutWrite(HTMLToBBCode(rtfToHTML(readFile(process.argv[2], 'ascii'))))
