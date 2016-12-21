'use strict'
const Bluebird = require('bluebird')
const defaultMaxRunning = 50

const limit = module.exports = (func, maxRunning, minTimeMS) => {
  const state = {}
  if (!maxRunning) maxRunning = defaultMaxRunning
  return function limited () {
    const args = Array.prototype.slice.call(arguments)
    const grouping = args[0]
    if (!state[grouping]) state[grouping] = {running: 0, queue: [], lastCall: null}
    const self = this
    if (state[grouping].running >= maxRunning || tillNext(grouping) > 0) {
      if (!state[grouping].queue.length) setTimeout(callNext(grouping), tillNext(grouping))
      return new Bluebird(resolve => {
        state[grouping].queue.push({resolve, self, args})
      })
    }
    return callFunc(this, args)
  }
  function tillNext (grouping) {
    return Math.floor(state[grouping].lastCall ? minTimeMS - (Date.now() - state[grouping].lastCall) : 0)
  }
  function callNext (grouping) {
    return function () {
      if (state[grouping].queue.length) {
        const next = state[grouping].queue.shift()
        next.resolve(callFunc(next.self, next.args))
      }
    }
  }
  function callFunc (self, args) {
    const grouping = args.shift()
    ++state[grouping].running
    state[grouping].lastCall = Date.now()
    return func.apply(self, args).finally(() => {
      --state[grouping].running
      if (tillNext(grouping) > 0) {
        setTimeout(callNext(grouping), tillNext(grouping))
      } else {
        callNext(grouping)()
      }
    })
  }
}

module.exports.method = (classOrObj, method, maxRunning) => {
  if (typeof classOrObj === 'function') {
    const func = classOrObj.prototype[method]
    classOrObj.prototype[method] = limit(func, maxRunning)
  } else {
    const func = classOrObj[method]
    classOrObj[method] = limit(func, maxRunning)
  }
}
