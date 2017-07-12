'use strict'
require('@iarna/lib')('util', '.')

Object.defineProperty(exports, 'get', {
  get: () => require('./ff-get.js')
})

Object.defineProperty(exports, 'update', {
  get: () => require('./ff-update.js')
})

Object.defineProperty(exports, 'generate', {
  get: () => require('./ff-generate.js')
})

Object.defineProperty(exports, 'cacheClear', {
  get: () => require('./ff-cache-clear.js')
})

Object.defineProperty(exports, 'Fic', {
  get: () => require('./fic.js')
})
