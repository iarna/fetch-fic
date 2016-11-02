'use strict'
module.exports = inFlight

var Bluebird = require('bluebird')

var active = {}

function inFlight () {
  return Bluebird.all(arguments).spread(function (unique, doFly) {
    if (Array.isArray(unique)) {
      return Bluebird.all(unique).then(function (uniqueArr) {
        return _inFlight(uniqueArr.join(''), doFly)
      })
    } else {
      return _inFlight(unique, doFly)
    }
  })

  function _inFlight (unique, doFly) {
    if (!active[unique]) {
      active[unique] = Bluebird.resolve(doFly.apply(null, Array.prototype.slice(arguments, 2)))
        .finally(function () { delete active[unique] })
    }
    return active[unique]
  }
}
