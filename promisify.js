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
    console.log('resolving', fn.name)
    return Bluebird.all(arguments).then(args => { console.log('calling', fn.name, args) ; return fn.apply(self, args) })
  }
}
