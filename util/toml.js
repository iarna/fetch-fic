'use strict'
const itoml = require('@iarna/toml')
const toml = require('toml')
const promisify = use('promisify')

const sync = {
  stringify: obj => {
    return itoml.stringify(obj)
  },
  parse: str => {
    try {
      return itoml.parse(str)
    } catch (_) {
      return toml.parse(str)
    }
  }
}

module.exports = {
  parse: promisify.args(sync.parse),
  stringify: promisify.args(sync.stringify),
  sync: sync
}
