'use strict'
module.exports = curryOptions

function curryOptions (fn, postWrap, defaults) {
  if (!defaults) defaults = {}
  const wrapped = function () {
    const args = [].slice.call(arguments, 0)
    let opts = args.length > 1 ? args.pop() : {}
    args.push(Object.assign({}, wrapped.options, opts))
    return fn.apply(this, args)
  }
  wrapped.options = defaults
  Object.defineProperty(wrapped, 'withOpts', {
    value: function (opts) {
      return curryOptions(fn, postWrap, Object.assign({}, opts, defaults))
    }
  })
  Object.defineProperty(wrapped, 'wrapWith', {
    value: function (fn) {
      const args = [].slice.call(arguments, 1)
      args.unshift(wrapped)
      return curryOptions(fn.apply(null, args), postWrap, {})
    }
  })
  if (postWrap) postWrap(wrapped, fn)
  return wrapped
}

/*
const ex = curryOptions((value, opts) => console.log('GOT:', value, opts), fn => { fn.foo = true }, {top: true})

const ex2 = ex.withOpts({step: 'ex2'})

const ex3 = ex2.wrapWith(fn => { return function () { return fn.apply(this, arguments) } })

console.log(ex, ex2, ex3)

ex('111', {call: 'ex'})
ex2('222', {call: 'ex2'})
ex3('333', {call: 'ex3'})
*/