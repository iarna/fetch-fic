'use strict'
exports.spinStart = spinStart
exports.spinStop = spinStop
exports.spinWhile = spinWhile
exports.spinWhileAnd = spinWhileAnd
exports.show = show
exports.hide = hide
exports.output = output
exports.errput = errput
exports.log = log
exports.warn = warn
exports.addWork = addWork
exports.newWork = newWork
exports.completeWorkWhenResolved = completeWorkWhenResolved

const Gauge = require('gauge')
const TrackerGroup = require('are-we-there-yet').TrackerGroup

const gauge = new Gauge()
const sectionLabel = {}
const trackerGroup = new TrackerGroup({
  template: [
    {type: 'progressbar', length: 20},
    {type: 'activityIndicator', kerning: 1, length: 1},
    {type: 'section', default: ''},
    ':',
    {type: 'message', kerning: 1, default: ''}
  ]
}).on('change', (section, completed) => {
  if (sectionLabel[section]) {
    gauge.show({section: sectionLabel[section], completed})
  } else {
    gauge.show({completed})
  }
})
exports.tracker = trackerGroup

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
  return promise.finally(() => spinStop())
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

function log () {
  hide()
  console.log.apply(console, arguments)
  show()
}

function warn () {
  hide()
  console.warn.apply(console, arguments)
  show()
}

function newWork (label, work) {
  return trackerGroup.newItem(label, work)
}

function addWork (tracker, todo) {
  tracker.addWork(1)
  return completeWorkWhenResolved(tracker, todo)
}

function completeWorkWhenResolved (tracker, todo) {
  return todo.finally(() => tracker.completeWork(1))
}
