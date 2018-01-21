'use strict'

module.exports = arr => {
  const seen = new Set()
  return arr.filter(v => {
    if (seen.has(v)) return false
    seen.add(v)
    return true
  })
}
