'use strict'
const tomlParse = require('@iarna/toml/parse-string')
const fs = require('fs')
const path = require('path')
const uniq = use('uniq')
const qr = require('@perl/qr')
const flatMap = use('flat-map')
const tt = require('@fanfic/tag-tools')


let loaded = false
let tagmap = {}
let replacers = {}
let nextdir = process.cwd()
let checkdir
while (!checkdir || checkdir !== nextdir) {
  checkdir = nextdir
  try {
    const tagmapsrc = fs.readFileSync(`${checkdir}/.tagmap.toml`)
    tagmap = tt.createMapping(tomlParse(tagmapsrc))
    loaded = true
    break
  } catch (ex) {
    if (ex instanceof SyntaxError || ex.line) throw ex
  }
  nextdir = path.resolve(checkdir, '..')
}
if (!loaded) {
  console.error('Warning: Unable to find tagmap file in path')
}
module.exports = function mapTags (site, tags, opts) {
  if (!tags) return (tags, opts) => mapTags(site, tags, opts)
  if (!opts) opts = {}

  // If tagmap.toml doesn't exist, this won't be initialized
  if (typeof tagmap.translateTags === 'function') {
    return tagmap.translateTags(site, tags)
  }

  // Passable fallback
  const empty = () => undefined;
  tagmap = {
    changed: empty
  };

  return tagmap;
}
