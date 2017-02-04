'use strict'
const promisify = use('promisify')

exports.require = function (mod) {
  const info = {
    loadWith: require,
    mod, func, promisify: promisifyWrap, 'new': create
  }
  info.promisify.args = prop => promisifyArgs.call(info, prop)
  return info
}
exports.use = function (mod) {
  const info = {
    loadWith: use,
    mod, func, promisify: promisifyWrap, 'new': create
  }
  info.promisify.args = prop => promisifyArgs.call(info, prop)
  return info
}

function func (prop) {
  const info = this
  if (prop) {
    return function () {
      if (!info.actual) info.actual = info.loadWith(info.mod)[prop]
      return info.actual.apply(info.actual, arguments)
    }
  } else {
    return function () {
      if (!info.actual) info.actual = info.loadWith(info.mod)
      return info.actual.apply(info.actual, arguments)
    }
  }
}

function promisifyWrap (prop) {
  const info = this
  if (prop) {
    return function () {
      if (!info.actual) info.actual = promisify(info.loadWith(info.mod)[prop])
      return info.actual.apply(info.actual, arguments)
    }
  } else {
    return function () {
      if (!info.actual) info.actual = promisify(info.loadWith(info.mod))
      return info.actual.apply(info.actual, arguments)
    }
  }
}

function promisifyArgs (prop) {
  const info = this
  if (prop) {
    return function () {
      if (!info.actual) info.actual = promisify.args(info.loadWith(info.mod)[prop])
      return info.actual.apply(info.actual, arguments)
    }
  } else {
    return function () {
      if (!info.actual) info.actual = promisify.args(info.loadWith(info.mod))
      return info.actual.apply(info.actual, arguments)
    }
  }
}

function create (prop) {
  const info = this
  if (prop) {
    return function () {
      if (!info.actual) info.actual = info.loadWith(info.mod).prop
      return new info.actual(...arguments)
    }
  } else {
    return function () {
      if (!info.actual) info.actual = info.loadWith(info.mod)
      return new info.actual(...arguments)
    }
  }
}
