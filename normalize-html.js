'use strict'
const parse5 = require('parse5')

module.exports = function (html) {
  return parse5.serialize(parse5.parse(html))
}
