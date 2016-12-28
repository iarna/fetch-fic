'use strict'
const zlib = require('zlib')

const promisify = use('promisify')

exports.gzip = promisify(zlib.gzip)
exports.gunzip = promisify(zlib.gunzip)
