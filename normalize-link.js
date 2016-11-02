'use strict'
var url = require('url')
var ThreadURL = require('./thread-url.js')

module.exports = normalizeLink

function normalizeLink (href, thread, base) {
  if (!thread) thread = new ThreadURL(href)
  // force ssl
  if (thread && thread.known && !thread.known.unknown) href = href.replace(/^http:/, 'https:')
  // resolve base url
  if (base) href = url.resolve(base, href)
  // normalize post urls  
  href = href.replace(/[/]threads[/][^/]+[/](?:page-\d+)?#post-(\d+)$/,'/posts/$1')
             .replace(/([/]posts[/][^/]+)[/]$/, '$1')
             .replace(/[/]goto[/]post[?]id=(\d+).*?$/, '/posts/$1')
  return href
}
