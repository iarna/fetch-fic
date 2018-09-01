'use strict'

module.exports = arr => {
  const seen = new Set()
  return arr.filter(v => {
    if (seen.has(v)) return false
    seen.add(v)
    return true
  })
}
module.exports.anyCase = arr => {
  const seen = {}
  arr.forEach(v => {
    const l = v.toLowerCase()
    if (l in seen) {
      if (v !== l) seen[l] = v
    } else {
      seen[l] = v
    }
  })
  return Object.keys(seen).map(_ => seen[_])
}