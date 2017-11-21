'use strict'
module.exports = streamClose

function streamClose (stream) {
  return new Promise((resolve, reject) => {
    stream.on('error', reject)
    stream.on('close', resolve)
  })
}
