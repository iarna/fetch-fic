'use strict'
const argv = require('yargs').argv
const TOML = require('@iarna/toml')
const Fic = require('./fic')
const fs = require('fs')
const wordcount = require('wordcount')
const simpleFetch = require('./simple-fetch')
const Bluebird = require('bluebird')
const cheerio = require('cheerio')

const fic = Fic.fromJSON(TOML.parse(fs.readFileSync(argv._[0])))

const fetch = simpleFetch({noNetwork: true, cacheBreak: false})

console.log(`Index of ${fic.title}:`)
console.log(`[list]`)
Bluebird.each(fic.chapters, (chapter) => {
  let info = `[*] [url=${chapter.link}]${chapter.name}[/url]`
  const author = chapter.author || fic.author
  const authorUrl = chapter.authorUrl || fic.authorUrl
  if (author !== fic.author) {
    const authorBB = authorUrl
      ? `[url=${authorUrl}]${author}[/url]`
      : author
    info += ` (${authorBB})`
  }
  if (chapter.description) {
    info += ' – ' + chapter.description
  }
  if (chapter.words) {
    info += ` (${chapter.words} words)`
  }
  console.log(info)
}).then(() => console.log(`[/list]`))
