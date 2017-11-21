'use strict'
module.exports = map

const forEach = use('for-each')

async function map (values, opts, mapEach) {
  if (!mapEach) {
    mapEach = opts
    opts = {}
  }
  if (typeof opts === 'number') opts = { concurrency: opts }
  if (!opts.concurrency) opts.concurrency = Infinity

  const results = []
  await forEach(values, opts, async (value, ii, len) => {
    results[ii] = await mapEach(value, ii, len)
  })
  return results
}
