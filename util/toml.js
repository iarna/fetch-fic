'use strict'
const TOML = require('@iarna/toml')
const promisify = use('promisify')

module.exports = {
  parse: promisify.args(TOML.parse.async),
  stringify: promisify.args(TOML.stringify),
  sync: TOML
}
