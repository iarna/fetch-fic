'use strict'
const Bluebird = require('bluebird')
const concat = require('concat-stream')
const iconv = require('iconv-lite')
const pumpCB = require('pump')
const Transform = require('readable-stream').Transform

const normalizeHtml = use('normalize-html')

class ParseRTF extends Transform {
  constructor () {
    super({objectMode: true})
    this.charset = 'ascii' // 'windows-1252'
    this.char = null
    this.path = []
    this.ctx = null
    this.buffer = ''
    this.cmd = ''
    this.arg = ''
    this.parserState = this.parserGeneral
    this.uc = 1
  }
  _transform (buf, encoding, done) {
    const text = buf.toString('ascii')
    for (let ii = 0; ii < text.length; ++ii) {
      this.parserState(text[ii])
    }
    done()
  }
  _flush (done) {
    this.endStr()
    this.ctx = this.path[0] || this.ctx
    if (this !== this.ctx && this.ctx) {
      this.push(this.ctx)
    }
    done()
  }
  parserGeneral (char) {
    if (char === '{') {
      this.endStr()
      this.path.push(this.ctx)
      if (this.ctx == null) {
        this.ctx = this
      } else {
        this.ctx = doesPushable({command: 'group', args: []})
        this.ctx.uc = this.uc
      }
    } else if (char === '}') {
      this.endStr()
      const finished = this.ctx
      this.ctx = this.path.pop()
      if (this.ctx) this.ctx.push(finished)
    } else if (char === '\\') {
      this.parserState = this.parserCmd0
    } else {
      if (char !== '\n') this.buffer += char
    }
  }
  parserCmd0 (char) {
    if (char === '\n') {
      this.endStr()
      this.ctx.push({command: 'fakeParagraph', args: []})
      this.parserState = this.parserGeneral
    } else if (char === '\'') {
      this.parserState = this.parserHexCharArgs
      this.arg = ''
    } else {
      this.cmd = char
      this.parserState = this.parserCmd1
    }
  }
  parserHexCharArgs (char) {
    this.arg += char
    if (this.arg.length === 2) {
      this.buffer += iconv.decode(new Buffer(this.arg, 'hex'), this.charset)
      this.parserState = this.parserGeneral
    }
  }
  parserCmd1 (char) {
    if (/^[a-zA-Z*]$/.test(char)) {
      this.cmd += char
    } else {
      this.arg = ''
      this.parserState = this.parserCmd2
      this.parserState(char)
    }
  }
  parserCmd2 (char) {
    if (/^[-0-9]$/.test(char)) {
      this.arg += char
    } else {
      if (this.cmd === 'ansicpg') {
        this.charset = 'windows-' + this.arg
      } else if (this.cmd === 'u') {
        var charBuf = Buffer.alloc ? Buffer.alloc(2) : new Buffer(2)
        charBuf.writeUInt16LE(Number(this.arg), 0)
        this.buffer += iconv.decode(charBuf, 'ucs2')
        if (this.ctx.uc) return this.skipChars(this.ctx.uc)
      } else {
        this.endStr()
        this.ctx.push({command: this.cmd, args: [this.arg]})
      }
      this.parserState = this.parserGeneral
      this.parserState(char)
    }
  }
  skipChars (num) {
    if (num > 1) {
      this.parserState = () => this.skipChars(num - 1)
    } else {
      this.parserState = this.parserGeneral
    }
  }

  endStr () {
    if (this.buffer === '') return
    (this.ctx || this).push({command: 'text', args: [this.buffer]})
    this.buffer = ''
  }
}

const Pushable = {
  push (value) {
    this.args.push(value)
  }
}

function doesPushable (obj) {
  return Object.assign(Object.create(Pushable), obj)
}

// We assume formatting expressions are paired as they have to be in HTML.
// They don't in RTF, so it's entirely possible for valid RTF to produce weird HTML.
// This will likely be cleaned up by the parse/serialize step, but still.
const htmlExpression = {
  group: (exp, state, content) => {
    let group = exp.args.shift()
    if (group.command === '*') group = exp.args.shift()
//    console.log('STARTING', group, exp.args)
    return evaluate(group, state, exp.args.map(arg => evaluate(arg, state)))
  },
  fakeParagraph: (exp, state) => {
    if (!state.inPara) return ''
    state.inPara = false
    return '</p>\n'
  },
  text: (exp) => {
    return exp.args[0]
  },
  b: (exp) => {
    if (exp.args[0] === '0') {
      return '</strong>'
    } else {
      return '<strong>'
    }
  },
  i: (exp) => {
    if (exp.args[0] === '0') {
      return '</em>'
    } else {
      return '<em>'
    }
  },
  ul: (exp) => {
    if (exp.args[0] === '0') {
      return '</span>'
    } else {
      return '<span style="text-decoration: underline">'
    }
  },
  ulnone: (exp) => {
    return '</span>'
  },
  field: (exp, state, content) => {
    const args = []
    for (let item of content) {
      if (Array.isArray(item)) {
        args.push.apply(args, item)
      } else {
        args.push(item)
      }
    }
    const matchHyperlink = /HYPERLINK "(.*)"/
    const href = args[0].match(matchHyperlink)
    if (href) {
      return `<a href="${href[1]}">${args.slice(1).join('')}</a>`
    } else {
      process.emit('debug', 'FIELD', args)
      return args[1]
    }
  },
  '*': (exp, state, content) => {
    return content.filter(c => c !== '')
  },
  fldinst: (exp, state, content) => {
    return ''
  },
  fldrslt: (exp, state, content) => {
    return content.filter(c => c !== '')
  },
  fs: (exp, state) => {
    state.style.size = Number(exp.args[0]) / 2
    return ''
  },
  pard: (exp, state) => {
    state.style = Object.assign({}, state.defaultStyle)
    return ''
  },
  qc: (exp, state) => {
    state.style.align = 'center'
    return ''
  },
  ql: (exp, state) => {
    state.style.align = 'left'
    return ''
  },
  qr: (exp, state) => {
    state.style.align = 'right'
    return ''
  },
  qj: (exp, state) => {
    state.style.align = 'justify'
    return ''
  },
/*
  cf: exp => {
// foreground color
    return ''
  },
  cb: exp => {
// background color
    return ''
  },
  fonttbl: exp => '',
  colortbl: exp => '',
  expandedcolortbl: exp => ''
*/
}

function evaluate (exp, state, content) {
//  console.log('EVALUATE', exp.command, !!htmlExpression[exp.command])
  const result =  htmlExpression[exp.command] && htmlExpression[exp.command](exp, state, content)
  return result
}

class ToHTML extends Transform {
  constructor () {
    super({objectMode: true})
    this.inPara = null
    this.defaultStyle = {
      size: 10,
      align: 'left'
    }
    this.style = Object.assign({}, this.defaultStyle)
    this.lastStyle = this.styleStr()
  }
  styleStr () {
    let style = []
    if (this.style.size !== this.defaultStyle.size) {
      const em = this.style.size / this.defaultStyle.size
      style.push(`font-size: ${em}em;`)
    }
    if (this.style.align !== this.defaultStyle.align) {
      style.push(`text-align: ${this.style.align};`)
    }
    if (!style.length) return ''
    return ` style="${style.join(' ')}"`
  }
  _transform (exp, encoding, done) {
    const inPara = this.inPara
    const result = evaluate(exp, this)
    if (result) {
      let startP = ''
      if (!inPara) {
        this.inPara = true
        this.lastStyle = this.styleStr()
        startP = `<p${this.lastStyle}>`
      }
      if (/S/.test(result) && this.lastStyle !== this.styleStr()) {
        this.lastStyle = this.styleStr()
        this.push(`<span${this.lastStyle}>${startP}${result}</span>`)
      } else {
        this.push(`${startP}${result}`)
      }
    } else {
      if (result == null) process.emit('debug', exp)
    }
    done()
  }
  _flush (done) {
    if (this.inPara) this.push('</p>\n')
    done()
  }
}

module.exports = function (rtf) {
  return Bluebird.resolve(rtf).then(rtf => {
    var parser = new ParseRTF()
    return new Bluebird((resolve, reject) => {
      pumpCB(
        parser,
        new ToHTML(),
        concat(data => {
          const emptyInlineTags = /<(em|strong|span)[^>]*>(\s*)<[/]\1>/g
          const html = normalizeHtml(data).replace(emptyInlineTags, '$2')
          resolve(html)
        }),
        err => err && reject(err))
      parser.end(rtf)
    })
  })
}
