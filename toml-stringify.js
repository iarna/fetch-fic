'use strict'
module.exports = stringify

function stringify (obj) {
  if (obj === null) throw typeError('null')
  if (obj === undefined) throw typeError('undefined')
  if (typeof obj !== 'object') throw typeError(typeof obj)

  return stringifyObject('', obj, true)
}

function typeError (type) {
  if (type instanceof Error) return type
  return new Error('Can only stringify objects, not ' + type)
}

function arrayOneTypeError () {
  return new Error("Array values can't have mixed types")
}

function stringifyObject (prefix, obj, multilineOk) {
  // classify our value types
  var inlineValues = []
  var complexValues = []
  Object.keys(obj).forEach(function (key) {
    var value = obj[key]
    var type = tomlType(value)
    if (type instanceof Error) throw type
    if (tomlType(value) === 'array') {
      var contentType = tomlType(value[0])
      if (value.length && contentType instanceof Error) {
        throw contentType
      } else if (!value.every(isType(contentType))) {
        throw arrayOneTypeError()
      }
    }
    if (isInline(value) || !multilineOk) {
      return inlineValues.push(key)
    } else {
      return complexValues.push(key)
    }
  })
  var result = []
  inlineValues.forEach(function (key) {
    result.push(stringifyKey(key) + ' = ' + stringifyInline(obj[key], multilineOk))
  })
  if (result.length) result.push('')
  complexValues.forEach(function (key) {
    var value = stringifyComplex(prefix, key, obj[key])
    if (prefix.length) {
      result.push(indent(value))
    } else {
      result.push(value)
    }
  })
  return result.join('\n')
}

function indent (str) {
  // can't just do this as we can't indent multiline strings, either indenting implies multilineOk=false OR
  // we need to detect that
  return str
  return str.split(/\n/).map(function (line) { return line !== '' ? '  ' + line : line }).join('\n')
}

function isType (type) {
  return function (value) {
    return tomlType(value) === type
  }
}

function isInline (value) {
  switch (tomlType(value)) {
    case 'string':
    case 'integer':
    case 'float':
    case 'boolean':
    case 'datetime':
      return true
    case 'array':
      return !value.length || tomlType(value[0]) !== 'table'
    case 'table':
      return !(Object.keys(value).length)
    default:
      return false
  }
}

function tomlType (value) {
  if (value === undefined) {
    return typeError('undefined')
  } else if (value === null) {
    return typeError('null')
  } else if (Number.isInteger(value)) {
    return 'integer'
  } else if (typeof value === 'number') {
    return 'float'
  } else if (typeof value === 'boolean') {
    return 'boolean'
  } else if (typeof value === 'string') {
    return 'string'
  } else if (value instanceof Date) {
    return 'datetime'
  } else if (Array.isArray(value)) {
    return 'array'
  } else {
    return 'table'
  }
}

function stringifyKey (key) {
  var keyStr = String(key)
  if (/^[-A-Za-z0-9_]+$/.test(keyStr)) {
    return keyStr
  } else {
    return stringifyBasicString(keyStr)
  }
}

function stringifyBasicString (str) {
  if (/"/.test(str) && !/'/.test(str)) {
    return "'" + escapeString(str) + "'"
  } else {
    return '"' + escapeString(str).replace(/"/g, '\\"') + '"'
  }
}

function escapeString (str) {
  return str.replace(/\\/g, '\\\\')
            .replace(/[\b]/g, '\\b')
            .replace(/\t/g, '\\t')
            .replace(/\n/g, '\\n')
            .replace(/\f/g, '\\f')
            .replace(/\r/g, '\\r')
}

function stringifyMultilineString (str) {
  return '"""\n' + str.split(/\n/).map(function (str) {
    return escapeString(str).replace(/"(?="")/g, '\\"')
  }).join('\n') + '"""'
}

function stringifyInline (value, multilineOk) {
  switch (tomlType(value)) {
    case 'string':
      if (multilineOk && /\n/.test(value)) {
        return stringifyMultilineString(value)
      } else {
        return stringifyBasicString(value)
      }
    case 'integer':
      return stringifyInteger(value)
    case 'float':
      return stringifyFloat(value)
    case 'boolean':
      return stringifyBoolean(value)
    case 'datetime':
      return stringifyDatetime(value)
    case 'array':
      return stringifyInlineArray(value)
    case 'table':
      return stringifyInlineTable(value)
    default:
      throw value
  }
}

function stringifyInteger (value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, "_")
}

function stringifyFloat (value) {
  if (value === Infinity) throw new Error("TOML can't store Infinity")
  if (Number.isNaN(value)) throw new Error("TOML can't store NaN")
  var chunks = String(value).split('.')
  var int = chunks[0]
  var dec = chunks[1]
  return stringifyInteger(int) + '.' + dec
}

function stringifyBoolean (value) {
  return String(value)
}

function stringifyDatetime (value) {
  return value.toISOString()
}

function stringifyInlineArray (values) {
  var result = '['
  var stringified = values.map(stringifyInline)
  if (stringified.join(', ').length > 60 || /\n/.test(stringified)) {
    result += '\n  ' + stringified.join(',\n  ') + '\n'
  } else {
    result += ' ' + stringified.join(', ') + (stringified.length ? ' ' : '')
  }
  return result + ']'
}

function stringifyComplex (prefix, key, value) {
  var valueType = tomlType(value)
  if (valueType === 'array') {
    return stringifyArrayOfTables(prefix, key, value)
  } else if (valueType === 'table') {
    return stringifyComplexTable(prefix, key, value)
  } else {
    throw typeError(valueType)
  }
}

function stringifyArrayOfTables (prefix, key, values) {
  var firstValueType = tomlType(values[0])
  if (firstValueType !== 'table') throw typeError(firstValueType)
  var fullKey = prefix + stringifyKey(key)
  var result = ''
  values.forEach(function (table) {
    if (result.length) result += '\n'
    result += '[[' + fullKey + ']]\n'
    result += stringifyObject(fullKey + '.', table, true)
  })
  return result
}

function stringifyComplexTable (prefix, key, value) {
  var fullKey = prefix + stringifyKey(key)
  return '[' + fullKey + ']\n' + stringifyObject(fullKey + '.', value, true)
}

function stringifyInlineTable (value) {
  var result = []
  Object.keys(value).forEach(function (key) {
    result.push(stringifyKey(key) + ' = ' + stringifyInline(value[key], false))
  })
  return '{ ' + result.join(', ') + (result.length ? ' ' : '') + '}'
}
