/**********************************************************
 * Author : nanyuantingfeng
 * Timestamp : 2016-02-01 12:00
 **********************************************************/
var nfix = require('nfix').nfix;
var Class = require('nclass').Class;

var defaultOptions = {indent: '', ignore: []};

var REGs = {
  b: new RegExp('\b', 'g'),
  t: new RegExp('\t', 'g'),
  n: new RegExp('\n', 'g'),
  f: new RegExp('\f', 'g'),
  r: new RegExp('\r', 'g'),
  x: new RegExp('\"', 'g')
};

var SPCs = /[`~!@#$%^&*()_+<>?:"{},.\/;'\[\]]/im;

var TOMLifer = Class(Object, function (option) {
  this.option = option;
});

TOMLifer.fn.getIndent = function (levels) {
  var ret = '';
  while (levels > 0 && this.option.indent) {
    ret += this.option.indent;
    levels -= 1;
  }
  return ret;
};

TOMLifer.fn.pad = function (num) {
  if (num < 10) {
    return '0' + num;
  }
  return num.toString();
};

TOMLifer.fn.isoDateString = function (date) {
  return date.getUTCFullYear() + '-' +
    this.pad(date.getUTCMonth() + 1) + '-' +
    this.pad(date.getUTCDate()) + 'T' +
    this.pad(date.getUTCHours()) + ':' +
    this.pad(date.getUTCMinutes()) + ':' +
    this.pad(date.getUTCSeconds()) + 'Z';
};

TOMLifer.fn.escapeString = function (s) {
  return s.replace(REGs.b, '\\b')
    .replace(REGs.t, '\\t')
    .replace(REGs.n, '\\n')
    .replace(REGs.f, '\\f')
    .replace(REGs.r, '\\r')
    .replace(REGs.x, '\\"');
};

TOMLifer.fn.isSimpleType = function (value) {
  return nfix.isString(value) ||
    nfix.isNumber(value) ||
    nfix.isBoolean(value) ||
    nfix.isDate(value) ||
    (nfix.isArray(value) && (value.length === 0 || this.isSimpleType(value[0])));
};

TOMLifer.fn.dumpObject = function (value, context, inArray) {
  var contextName, bracket;
  context = context || [];

  if (nfix.isDate(value)) {
    return this.isoDateString(value);
  }

  if (nfix.isArray(value)) {
    if (value.length === 0) {
      return null;
    }
    contextName = '';
    bracket = '';
    if (context.length === 0) {
      bracket = '[';
    }

    var index = -1;
    while (++index < value.length) {
      bracket += this.dump(value[index], context, true);
      if (context.length === 0) {
        bracket += ', ';
      }
    }

    if (context.length > 0) {
      return bracket;
    }
    return bracket.substring(0, bracket.length - 2) + ']';
  }

  var result = '', simpleProps = '';
  var pret = '', postt = '';


  nfix.each(value, function (k, v) {
    if (this.option.ignore.indexOf(k) == -1 && this.isSimpleType(v)) {
      simpleProps += this.getIndent(context.length - 1) + k + '=' + this.dump(v) + '\n';
    }
  }, this);

  if (simpleProps) {
    if (context.length > 0) {
      contextName = this.join(context);
      if (inArray) {
        pret = '[';
        postt = ']';
      }
      result += this.getIndent(context.length - 1) + pret + '[' + contextName + ']' + postt + '\n';
    }
    result += simpleProps;
  }

  nfix.each(value, function (k, v) {
    if (!this.isSimpleType(v)) {
      result += this.dump(v, context.concat(k));
    }
  }, this);

  return result + '\n';
};

TOMLifer.fn.dump = function (value, context, inArray) {
  return nfix.isString(value) ? this.dumpSNB(this.escapeString(value))
    : nfix.isNumber(value) || nfix.isBoolean(value) ? this.dumpSNB(value)
    : nfix.isObject(value) ? this.dumpObject(value, context, inArray)
    : '';
};

TOMLifer.fn.dumpSNB = function (value) {
  return JSON.stringify(value);
};

TOMLifer.fn.join = function (arr) {
  var contextName = "";
  arr.forEach(function (v) {
    if (SPCs.test(v))
      contextName += this.dumpSNB(v);
    else
      contextName += v;
    contextName += ".";
  }, this);
  return contextName.slice(0, -1);
};

TOMLifer.fn.toString = function (obj) {
  var R = this.dump(obj);
  return R.slice(0, -1);
};

TOMLifer.stringify = function (obj, options) {
  return TOMLifer(nfix.merge({}, defaultOptions, options)).toString(obj);
};

module.exports = TOMLifer.TOMLifer = TOMLifer;
