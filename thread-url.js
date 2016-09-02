'use strict'
module.exports = ThreadURL
var url = require('url')

var knownSites = {
  'forums.sufficientvelocity.com': true,
  'forums.spacebattles.com': true,
  'forum.questionablequesting.com': true
}

function ThreadURL (thread) {
  this.raw = thread
  this.warnings = []
  var threadmarkURL = url.parse(thread)
  if (!knownSites[threadmarkURL.hostname]) {
    this.warnings.push('Has not yet been tested with ' + threadmarkURL.hostname + ', may not work.')
  }
  threadmarkURL.hash = ''
  var threadMatch = /^([/]threads[/][^/]+\.\d+)(?:[/].*)?$/
  if (threadMatch.test(threadmarkURL.pathname)) {
    threadmarkURL.pathname = threadmarkURL.pathname.replace(threadMatch, '$1/threadmarks')
  } else {
    this.warnings.push("This does not appear to be a thread URL, can't find threadmarks: ", threadmarkURL)
  }
  this.threadmarks = url.format(threadmarkURL)
  var nameMatch = threadmarkURL.pathname.match(/^[/]threads[/]([^.]+)/)
  this.name = nameMatch && nameMatch[1]
}
