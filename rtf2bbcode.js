#!/usr/bin/env node
'use strict'
const fs = require('fs')

const HTMLToBBCode = use('html-to-bbcode')
const promisify = use('promisify')
const rtfToHTML = use('rtf-to-html')

const readFile = promisify(fs.readFile)
const stdoutWrite = promisify(process.stdout.write, process.stdout)

stdoutWrite(HTMLToBBCode(rtfToHTML(readFile(process.argv[2], 'ascii'))))
