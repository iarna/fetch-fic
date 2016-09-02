'use strict'
module.exports = spinGauge

function spinGauge (gauge) {
  var spinning = 0
  var spinInterval
  return function spinWith (P) {
    if (++spinning === 1) {
      spinInterval = setInterval(function () { gauge.pulse() }, 50)
    }
    return P.then(function (result) {
      if (--spinning === 0) clearInterval(spinInterval)
      return result
    }, function (err) {
      if (--spinning === 0) clearInterval(spinInterval)
      throw err
    })
  }
}