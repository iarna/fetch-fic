'use strict'
const fs = require('fs')

const promisify = use('promisify')

exports.readdir = promisify(fs.readdir, fs)
exports.readFile = promisify(fs.readFile, fs)
exports.writeFile = promisify(fs.writeFile, fs)
exports.rename = promisify(fs.rename, fs)
exports.unlink = promisify(fs.unlink)
exports.stat = promisify(fs.stat)
exports.createWriteStream = fs.createWriteStream
const access = exports.access = promisify(fs.access)
exports.exists = file => access(file, fs.constants.F_OK).then(() => true, () => false)
