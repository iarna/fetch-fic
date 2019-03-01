'use strict'
const stem = require('wink-porter2-stemmer')
const remove = require('diacritics').remove
const entitiesDecoder = require('html-entities-decoder');

module.exports = desc => remove(
    entitiesDecoder(desc || '')
    .normalize('NFKC')
    .replace(/<[^<>]+>/g, ' ')
    .replace(/\bno[ !]\S+/g, ''))
  .replace(/[^0-9a-zA-Z\/+&!:#;'"“”‘’-]/g, ' ')
//  .replace(/\s+/g, ' ')
//  .replace(/^\s+|\s+$/g, '')
  .split(/ /)
//  .map(_ => _.replace(/^[/+&!:#;'"“”‘’-]+|[/+&!:#;'"“”‘’-]+$/g, '')) // leading/trailing punctuation
//  .filter(_ => _ && /[A-Za-z]{2}/.test(_) && /^[A-Za-z]/.test(_))
  .filter(_ => _.toLowerCase)
