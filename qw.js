'use strict'
module.exports = qw

function qw (args) {
  var template = args[0]
  return template.replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ').split(/ /)
}
