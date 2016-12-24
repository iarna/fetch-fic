'use strict'
module.exports = promisify
const Bluebird = require('bluebird')

function promisify (fn, bind) {
  return function () {
    const self = bind || this
    return Bluebird.all(arguments).then(args => {
      return new Bluebird((resolve, reject) => {
        args.push((err, value) => err ? reject(err) : resolve(value))
        return fn.apply(self, args)
      })
    })
  }
}

promisify.args = function (fn, bind) {
  return function () {
    const self = bind || this
    return Bluebird.all(arguments).then(args => fn.apply(self, args))
  }
}
