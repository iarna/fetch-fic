'use strict'
module.exports = filenameize
const remove = require('diacritics').remove

function romanize (str) {
  return remove(str
    .replace(/ᔕ/g, 'S')
    .replace(/є/g, 'e')
    .replace(/и/g, 'n')
    .replace(/т/g, 't')
    .replace(/у/g, 'y')
    .replace(/α/g, 'a')
    .replace(/в/g, 'b')
    .replace(/ν/g, 'v')
    .replace(/ѕ/g, 's')
    .replace(/я/g, 'r')
  )
}

function filenameize (str) {
  return romanize(str.normalize('NFKC')).replace(/\W/g, '-').replace(/--+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}
