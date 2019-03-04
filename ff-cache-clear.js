'use strict'
module.exports = cacheClear

const cache = use('cache')

async function cacheClear (args) {
  for (let url of args.url) {
    await cache.clearUrl(url)
  }
  process.stdout.write('cache cleared\n')
}
