'use strict';
const path = require('path')

// Call this function in a another function to find out the file from
// which that function was called from. (Inspects the v8 stack trace)
//
// Inspired by http://stackoverflow.com/questions/13227489

module.exports = function getCallerFile() {
  var oldPrepareStackTrace = Error.prepareStackTrace;
  Error.prepareStackTrace = function(err, stack) { return stack; };
  var stack = new Error().stack;
  Error.prepareStackTrace = oldPrepareStackTrace;

  // stack[0] holds this file
  // stack[1] holds where this function was called
  // stack[2] holds the file we're interested in
  const betterStack = []
  stack.shift() // remove ourselves
  const parentDir = path.dirname(stack.shift().getFileName())
  for (let callsite of stack) {
    const file = callsite.getFileName()
    if (!/[\\/]/.test(file)) continue // if it has no path, it's builtin
    if (/node_modules/.test(path.relative(parentDir, file))) continue // if it's relative path has node_modules its a lib
    return file
  }
  return null
};
