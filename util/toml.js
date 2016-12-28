'use strict'
const toml = require('@iarna/toml')
const promisify = use('promisify')

module.exports = {
  parse: promisify.args(toml.parse),
  stringify: promisify.args(toml.stringify)
}
