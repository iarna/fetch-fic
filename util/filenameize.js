'use strict'
module.exports = filenameize
const remove = require('diacritics').remove

function filenameize (str) {
  return remove(str.normalize('NFKC')).replace(/\W/g, '-').replace(/--+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}
