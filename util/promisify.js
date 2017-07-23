'use strict'
module.exports = promisify
const util = require('util')
const Bluebird = require('bluebird')

function promisify (fn, bind) {
  const raw = util.promisify(fn)
  return function () {
    const self = bind || this
    return Bluebird.all(arguments).then(args => {
      return raw.apply(self, args)
    })
  }
}

promisify.args = function (fn, bind) {
  return function () {
    const self = bind || this
    return Bluebird.all(arguments).then(args => fn.apply(self, args))
  }
}
