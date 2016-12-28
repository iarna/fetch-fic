'use strict'
module.exports = cacheClear

const cache = use('cache')

function cacheClear (args) {
  return cache.clearUrl(args.url).then(() =>
    process.stdout.write('cache cleared\n'))
}
