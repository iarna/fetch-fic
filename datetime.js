'use strict'
module.exports = xenforoDateTime

function xenforoDateTime (elem) {
  if (elem.attr('data-datestring')) {
    return new Date(elem.attr('data-datestring') + ' ' + elem.attr('data-timestring'))
  } else if (elem.attr('title')) {
    return new Date(elem.attr('title').replace(/ at/,''))
  }
}
