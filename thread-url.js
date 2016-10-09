'use strict'
module.exports = ThreadURL
var url = require('url')

var knownSites = {
  'forums.sufficientvelocity.com': 'Sufficient Velocity',
  'forums.spacebattles.com': 'Spacebattles',
  'forum.questionablequesting.com': 'Questionable Questing'
}

function ThreadURL (thread) {
  this.raw = thread
  this.warnings = []
  var threadmarkURL = url.parse(thread)
  this.publisher = knownSites[threadmarkURL.hostname]
  if (knownSites[threadmarkURL.hostname]) {
    this.known = true
  } else {
    this.known = false
    this.warnings.push('Has not yet been tested with ' + threadmarkURL.hostname + ', may not work.')
    this.publisher = threadmarkURL.hostname
  }
  threadmarkURL.hash = ''
  var threadMatch = /^([/]threads[/][^/]+\.\d+)(?:[/].*)?$/
  this.path = threadmarkURL.pathname || threadmarkURL.path
  if (threadMatch.test(this.path)) {
    threadmarkURL.pathname = threadmarkURL.pathname.replace(threadMatch, '$1/threadmarks')
  } else {
    this.warnings.push("This does not appear to be a thread URL, can't find threadmarks: ", threadmarkURL)
  }
  this.threadmarks = url.format(threadmarkURL)
  var nameMatch = (this.path || '').match(/^[/]threads[/]([^.]+)/)
  this.name = nameMatch && nameMatch[1]
}
