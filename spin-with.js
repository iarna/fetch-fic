'use strict'
module.exports = spinGauge

function spinGauge (gauge) {
  let spinning = 0
  let spinInterval
  return P => {
    if (++spinning === 1) {
      spinInterval = setInterval(function () { gauge.pulse() }, 50)
    }
    return P.finally(function (result) {
      if (--spinning === 0) clearInterval(spinInterval)
    })
  }
}
