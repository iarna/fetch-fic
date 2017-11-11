'use strict'
module.exports = cacheClear

const cache = use('cache')

async function cacheClear (args) {
  await cache.clearUrl(args.url)
  process.stdout.write('cache cleared\n')
}
