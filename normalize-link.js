'use strict'
var url = require('url')

module.exports = normalizeLink

function normalizeLink (href, thread, base) {
  // force ssl
  if (thread && thread.publisher) href = href.replace(/^http:/, 'https:')
  // resolve base url
  if (base) href = url.resolve(base, href)
  // normalize post urls  
  href = href.replace(/[/]threads[/][^/]+[/](?:page-\d+)?#post-(\d+)$/,'/posts/$1')
             .replace(/([/]posts[/][^/]+)[/]$/, '$1')
             .replace(/[/]goto[/]post[?]id=(\d+).*?$/, '/posts/$1')
  return href
}
