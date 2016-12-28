'use strict'
module.exports = countStoryWords

const cheerio = require('cheerio')
const wordcount = require('wordcount')

function countStoryWords (chapter) {
  const $content = cheerio.load(chapter.content)
  $content('.bbCodeQuote').remove()
  return wordcount($content.text().trim())
}