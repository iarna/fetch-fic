'use strict'
const progress = {}
const Bluebird = require('bluebird')
progress.id = Symbol()
if (process.progress) {
   if (progress.id !== process.progress.id) {
      process.emit('warn', 'MULTIPLE VERSIONS OF progress LOADED')
   }
   module.exports = process.progress
   return progress
} else {
   module.exports = process.progress = progress
}
const TrackerGroup = require('are-we-there-yet').TrackerGroup
const Gauge = require('gauge')

const caller = use('caller')

progress.setVerbose = setVerbose
progress.spinWhile = spinWhile
progress.spinWhileAnd = spinWhileAnd
progress.show = show
progress.hide = hide
progress.output = output
progress.errput = errput
progress.addWork = addWork
progress.newWork = newWork
progress.completeWorkWhenResolved = completeWorkWhenResolved


const gauge = new Gauge({
  template: [
    {type: 'progressbar', length: 20},
    {type: 'activityIndicator', kerning: 1, length: 1},
    {type: 'section', default: ''},
    ':',
    {type: 'message', kerning: 1, default: ''}
  ]
})
const sectionLabel = {}
const trackerGroup = new TrackerGroup().on('change', (section, completed) => {
  if (sectionLabel[section]) {
    gauge.show({section: sectionLabel[section], completed})
  } else {
    gauge.show({completed})
  }
  gauge.pulse()
})
progress.tracker = trackerGroup

let debugEnviron = process.env.NODE_DEBUG || '';
function setVerbose (value) {
  process.env.NODE_DEBUG = debugEnviron  = value
}

let spinning = 0
let pulseInterval
function spinStart () {
  if (++spinning > 1) return
  pulseInterval = setInterval(function () {
    gauge.pulse()
  }, 50)
}
function spinStop () {
  if (--spinning > 0) return
  clearInterval(pulseInterval)
}

function spinWhile (promise) {
  spinStart()
  return Bluebird.resolve(promise).finally(() => spinStop())
}

function spinWhileAnd (fn) {
  return function () {
    return spinWhile(fn.apply(this, arguments))
  }
}

function show (section, message) {
  if (message) {
    sectionLabel[section] = message
    gauge.show({section, message})
  } else if (section) {
    gauge.show({message: section})
  } else {
    gauge.show()
  }
  gauge.pulse()
}

function hide () {
  gauge.hide()
}

function output (line) {
  hide()
  process.stdout.write(line)
  show()
}

function errput (line) {
  hide()
  process.stderr.write(line)
  show()
}

process.on('log', function () {
  const args = [].slice.call(arguments, 0)
  hide()
  console.log.apply(console, args)
  show()
})

process.on('warn', function () {
  const args = [].slice.call(arguments, 0)
  hide()
  console.warn.apply(console, ['WARN '].concat(args))
  show()
})

process.on('error', function () {
  const args = [].slice.call(arguments, 0)
  hide()
  console.warn.apply(console, ['ERROR'].concat(args))
  show()
})

process.on('debug', function () {
  if (!debugEnviron) return
  const section = caller().replace(/^.*[/](.*?).js$/, '$1')
  if (debugEnviron !== true && !new RegExp('\\b' + section + '\\b', 'i').test(debugEnviron)) return

  const args = [].slice.call(arguments, 0)
  hide()
  console.warn.apply(console, ['DEBUG', section].concat(args))
  show()
})

function newWork (label, work) {
  return trackerGroup.newItem(label, work)
}

function addWork (todo, tracker) {
  tracker.addWork(1)
  return completeWorkWhenResolved(todo, tracker)
}

function completeWorkWhenResolved (todo, tracker) {
  return Bluebird.resolve(todo).finally(() => tracker.completeWork(1))
}
