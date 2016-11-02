'use strict'
module.exports = ThreadURL
var url = require('url')

var knownSites = {
  'forums.sufficientvelocity.com': {
    name: 'Sufficient Velocity',
    type: 'xenforo',
  },
  'forums.spacebattles.com': {
    name: 'Spacebattles',
    type: 'xenforo',
  },
  'forum.questionablequesting.com': {
    name: 'Questionable Questing',
    type: 'xenforo',
  },
  'www.fanfiction.net': {
    name: 'FanFiction.net',
    type: 'ffn',
  },
  'deviantart.com': {
    name: 'Deviant Art',
    type: 'deviant'
  }
}

function ThreadURL (thread) {
  this.raw = thread
  this.warnings = []
  var threadURL = url.parse(thread)
  var hostname = threadURL.hostname
  if (/deviantart[.]com[/]art[/]/.test(thread)) {
    hostname = 'deviantart.com'
  }
  if (!(this.known = knownSites[hostname])) {
    this.warnings.push('Has not yet been tested with ' + threadURL.hostname + ', may not work.')
    this.publisher = threadURL.hostname
    this.known = {
      unknown: true,
      name: 'Unknown',
      type: 'xenforo'
    }
  }
  this.publisher = this.known.name
  this.path = threadURL.pathname || threadURL.path
  this.hash = threadURL.hash
  if (this.known.type === 'xenforo') {
    threadURL.hash = ''
    var threadMatch = /^([/]threads[/][^/]+\.\d+)(?:[/].*)?$/
    if (threadMatch.test(this.path)) {
      threadURL.pathname = threadURL.pathname.replace(threadMatch, '$1/threadmarks')
    } else {
      this.warnings.push("This does not appear to be a thread URL, can't find threadmarks: ", threadURL)
    }
    this.threadmarks = url.format(threadURL)
    var nameMatch = (this.path || '').match(/^[/]threads[/]([^.]+)/)
    this.name = nameMatch && nameMatch[1]
  } else if (this.known.type === 'ffn') {
    var ficMatch = (this.path || '').match(/^[/]s[/](\d+)[/](\d+)(?:[/](.*))?/)
    if (ficMatch) {
      this.ficId = ficMatch[1]
      this.chapter = ficMatch[2]
      this.name = ficMatch[3]
      this.chapterURL = function (num) {
        return 'https://www.fanfiction.net/s/' + this.ficId + '/' + num + '/' + this.name
      }
    }
  } else if (this.known.type === 'deviant') {
  }
}
