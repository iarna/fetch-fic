'use strict'
module.exports = filenameize

function filenameize (str) {
  return str.replace(/\W/g, '-').replace(/--+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}
