'use strict'
const cache = require('./cache.js')
const argv = require('yargs').argv

cache.clearUrl(argv._[0]).then(() => process.stdout.write('cache cleared\n'))
