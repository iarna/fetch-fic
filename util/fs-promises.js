'use strict'
const fs = require('fs')

const promisify = use('promisify')

exports.readdir = promisify(fs.readdir, fs)
exports.readFile = promisify(fs.readFile, fs)
exports.writeFile = promisify(fs.writeFile, fs)
exports.rename = promisify(fs.rename, fs)
exports.unlink = promisify(fs.unlink)
exports.createWriteStream = fs.createWriteStream
