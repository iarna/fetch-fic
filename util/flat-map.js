'use strict'
module.exports = flatMap

function flatMap (arr, fn) {
  return arr.map(fn).reduce((acc, val) => {
    if (Array.isArray(val)) {
      acc.push(...val)
    } else {
      acc.push(val)
    }
    return acc
  }, [])
}
