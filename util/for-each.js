'use strict'
module.exports = concurrently

async function concurrently (_todo, opts, forEach) {
  if (!forEach) {
    forEach = opts
    opts = {}
  }
  if (typeof opts === 'number') opts = { concurrency: opts }
  if (!opts.concurrency) opts.concurrency = 1
  const todo = Object.assign([], _todo)
  let index = 0
  let active = []
  
  while (active.length > 0 || todo.length > 0) {
    while (active.length < opts.concurrency && todo.length) {
      const action = forEach(todo.shift(), index++, _todo.length).then(() => {
        active = active.filter(p => p !== action)
      })
      active.push(action)
    }

    if (todo.length > 0) {
      await Promise.race(active)
    } else {
      await Promise.all(active)
    }
  }
}
