'use strict'
module.exports = qw

function qw () {
  const args = Object.assign([], arguments[0])
  const values = [].slice.call(arguments, 1)
  const words = []
  while (args.length) {
    const arg = args.shift()
    if (arg.trim() !== '') {
      words.push.apply(words, arg.replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ').split(/ /))
    }
    if (values.length) {
      const val = values.shift()
      words.push(val)
    }
  }
  return words
}
