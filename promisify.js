'use strict'
module.exports = promisify
var Bluebird = require('bluebird')

function promisify (fn) {
  var pfn = Bluebird.promisify(fn)
  return function () {
    var self = this
    return Bluebird.all(arguments).spread(function () {
      return pfn.apply(self, arguments)
    })
  }
}
