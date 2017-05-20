'use strict'
const htmlEscape = require('html-escape')

module.exports = function (literals) {
  if (!literals.raw) return htmlEscape(literals)
  const substs = [].slice.call(arguments, 1)
  return literals.raw.reduce((acc, lit, i) => {
    let subst = i > 0 ? substs[i - 1] : ''
    if (Array.isArray(subst)) {
      subst = subst.join('')
    } else {
      subst = htmlEscape(subst)
    }

    return acc + subst + lit.replace(/\\n/g, '\n')
  }, '')
}
