'use strict'
const Transform = require('stream').Transform
const Bluebird = require('bluebird')

module.exports = bbcodeToHTML

function bbcodeToHTML (bbcode) {
  return new Bluebird((resolve, reject) => {
    const parser = new BBCodeParser()
    const toHTML = new BBCodeToHTML({passThroughText: true})
    parser.on('error', reject)
    toHTML.on('error', reject)
    let html = ''
    toHTML.on('data', chunk => html += chunk)
    toHTML.on('finish', () => resolve(html))
    parser.pipe(toHTML)
    return Promise.resolve(bbcode).then(bbcode => parser.end(bbcode))
  })
}

function passthrough (name) {
  return [node => `<${name}>`, node => `</${name}>`]
}

const unclosed = {
  '*': true,
}
const usesContent = {
  'email': (node, content) => `<a href="mailto:${content}">${content}</a>`,
  'url': (node, content) => `<a href="${content}">${content}</a>`,
  'img': (node, content) => `<img src="${content.trim()}">`
}
let quoteId = 0
const tags = {
  b: passthrough('b'),
  i: passthrough('i'),
  u: passthrough('u'),
  s: passthrough('s'),
  email: [ node => `<a href="mailto:${node.attr}">`, node => `</a>` ],
  url: [ node => `<a href="${node.attr}">`, node => `</a>` ],
  color: [ node => `<span style="color: ${node.attr}">`, node => `</span>` ],
  font: [ node => `<span style="font-family: ${node.attr}">`, node => `</span>` ],
  size: [ node => `<font size="${node.attr}">`, node => `</size>` ],
  quote: [
    node => {
      return node.attr
        ? `<style>`
        + `#quote${++quoteId} { position: relative; border: solid black 1px; padding: 1em; text-indent: 0; } `
        + `#quote${quoteId}::before { text-indent: 0; padding: 0 .25em 0 .25em; top: -.5em; position: absolute; background: white; content: attr(title)"${node.attr}";}</style>`
        + `<div id="quote${quoteId}" style="xenforo-quote: ${node.attr || 'true'};">`
        : `<div style="xenforo-quote: ${node.attr || 'true'}; text-indent: 0; border: solid black 1px; padding: 1em;">`
    },
    node => `</div>` ],
  spoiler: [ node => `<div style="border: solid black 1px; padding: 1em; xenforo-spoiler: ${node.attr};">`, node => `</div>` ],
  list: [ node => `<${node.attr == 1 ? 'ol' : 'ul'}>`, node => `</${node.attr == 1 ? 'ol' : 'ul'}>` ],
  '*': [ node => `<li>`, node => '' ],
  left: [ node => `<div style="text-align: left;">`, node => `</div>` ],
  center: [ node => `<div style="text-align: center;">`, node => `</div>` ],
  right: [ node => `<div style="text-align: right;">`, node => `</div>` ],
  code: [ node => `<code>`, node => `</code>` ],
  indent: [ node => `<div style="padding-left: 1em;">`, node => `{/div>` ]
  // ignore: media, attach, user, post, thread, php
  // plain, qs
}

class BBCodeToHTML extends Transform  {
  constructor (opts) {
    if (!opts) opts = {}
    super({objectMode: true})
    this.passThroughText = opts.passThroughText
    this.parserState = this.parseText
    this.lists = []
    this.content = ''
    this.open = null
  }
  _transform (node, encoding, done) {
    this.parserState(node)
    done()
  }
  _flush (done) {
    if (this.open) {
      this.emit('error', new Error(`Dangling open tag "${this.open.value}"`))
    }
    done()
  }
  parseText (node) {
    if (node.type === 'text') {
      let value
      if (this.passThroughText) {
        value = node.value
      } else {
        value = node.value.replace(/&/g, '&amp;')
                          .replace(/</g, '&lt;')
                          .replace(/\n/g, '<br>\n')
      }
      this.push(value)
    } else if (node.type === 'open') {
      if (node.value === 'list') {
        this.lists.push(node)
        this.push(tags[node.value][0](node))
      } else if (node.attr && usesContent[node.value] && tags[node.value]) {
        this.push(tags[node.value][0](node))
      } else if (usesContent[node.value]) {
        this.open = node
        this.content = ''
        this.parserState = this.parseContentTag
      } else if (tags[node.value]) {
        this.push(tags[node.value][0](node))
      } else {
        this.emit('error', new Error(`Unknown open tag "${node.value}" at line ${node.row}, column ${node.col}`))
      }
    } else if (node.type === 'close') {
      if (node.value === 'list') {
        const list = this.lists.pop()
        this.push(tags.list[1](list))
      } else if (tags[node.value]) {
        this.push(tags[node.value][1](node))
      } else {
        this.emit('error', new Error(`Unknown close tag "${node.value}" at line ${node.row}, column ${node.col}`))
      }
    } else if (node.type === 'error') {
      this.emit('error', new Error(`${node.value} at row ${node.row}, column ${node.col}`))
    }
  }
  parseContentTag (node) {
    if (node.type === 'text') {
      this.content += node.value
    } else if (node.type === 'open') {
      if (node.value === 'list') {
        this.lists.push(node)
        this.push(tags[node.value][0](node))
      } else if (tags[node.value]) {
        this.content += tags[node.value][0](node)
      } else {
        this.emit('error', new Error(`Unknown open tag "${node.value}" at line ${node.row}, column ${node.col}`))
      }
    } else if (node.type === 'close') {
      if (node.value === this.open.value) {
        this.push(usesContent[node.value](this.open, this.content))
        this.open = null
        this.content = ''
        this.parserState = this.parseText
      } else if (node.value === 'list') {
        const list = this.lists.pop()
        this.push(tags.list[1](list))
      } else if (tags[node.value]) {
        this.content += tags[node.value][1](node)
      } else {
        this.emit('error', new Error(`Unknown close tag "${node.value}" at line ${node.row}, column ${node.col}`))
      }
    } else if (node.type === 'error') {
      this.emit('error', new Error(node.value + ` at row ${node.row}, column ${node.col}`))
    }
  }
}

class BBCodeParser extends Transform {
  constructor () {
    super({objectMode: true})
    this.text = ''
    this.tag = ''
    this.attr = ''
    this.char = 0
    this.row = 1
    this.col = 1
    this.parserState = this.parseText
  }
  _transform (text, encoding, done) {
    for (let ii = 0; ii < text.length; ++ii) {
      ++this.char
      if (text[ii] === '\n') {
        ++this.row
        this.col = 1
      } else {
        ++this.col
      }
      this.parserState(text[ii])
    }
    done()
  }
  _flush (done) {
    this.emitText()
    done()
  }
  parseText (char) {
    if (char === '[') {
      this.tag = ''
      this.attr = ''
      this.parserState = this.parseTagStart
    } else {
      this.text += char
    }
  }
  parseTagStart (char) {
    if (char === '/') {
      this.parserState = this.parseCloseTag
    } else {
      this.parserState = this.parseOpenTag
      this.parserState(char)
    }
  }
  parseCloseTag (char) {
    if (/^\w$/.test(char)) {
      this.tag += char
    } else if (char === ']') {
      this.emitCloseTag()
      this.parserState = this.parseText
    } else {
      this.emitError('invalid char in close tag')
      this.parserState = this.parseText
    }
  }
  parseOpenTag (char) {
    if (/^[*\w]$/.test(char)) {
      this.tag += char
    } else if (char === ']') {
      this.emitOpenTag()
      this.parserState = this.parseText
    } else if (char === '=') {
      this.parserState = this.parsePostAttrStart
    } else if (char === ' ') {
      this.parserState = this.parsePreAttrStart
    }
  }
  parsePreAttrStart (char) {
    if (char === '=') {
      this.parserState = this.parsePostAttrStart
    } else if (char === ']') {
      this.emitOpenTag()
      this.parserState = this.parseText
    } else if (char !== ' ') {
      this.emitError('invalid char in open tag')
      this.parserState = this.parseText
    }
  }
  parsePostAttrStart (char) {
    if (char === ']') {
      this.emitOpenTag()
      this.parserState = this.parseText
    } else if (char === '"' || char === '“') {
      this.parserState = this.parseQQAttr
    } else if (char === "'" || char === '‘') {
      this.parserState = this.parseQAttr
    } else if (char !== ' ') {
      this.parserState = this.parsePlainAttr
      this.parserState(char)
    }
  }
  parsePlainAttr (char) {
    if (char === ']') {
      this.attr = this.attr.trim()
      this.emitOpenTag()
      this.parserState = this.parseText
    } else {
      this.attr += char
    }
  }
  parseQQAttr (char) {
    if (char === '"' || char === '”') {
      this.parserState = this.parseAttrEnd
    } else {
      this.attr += char
    }
  }
  parseQAttr (char) {
    if (char === "'" || char === '’') {
      this.parserState = this.parseAttrEnd
    } else {
      this.attr += char
    }
  }
  parseAttrEnd (char) {
    if (char === ']') {
      this.emitOpenTag()
      this.parserState = this.parseText
    } else if (char !== ' ') {
      this.emitError('invalid char after attribute in open tag')
      this.parserState = this.parseText
    }
  }
  emitText () {
    if (this.text === '') return
    this.push({type: 'text', value: this.text, row: this.row, col: this.col, char: this.char, })
    this.text = ''
  }
  emitError (msg) {
    this.emitText()
    this.push({type: 'error', value: msg, row: this.row, col: this.col, char: this.char, stack: new Error().stack})
  }
  emitOpenTag () {
    this.emitText()
    this.push({type: 'open', value: this.tag.toLowerCase(), attr: this.attr, row: this.row, col: this.col, char: this.char, })
  }
  emitCloseTag () {
    this.emitText()
    this.push({type: 'close', value: this.tag.toLowerCase(), row: this.row, col: this.col, char: this.char, })
  }
}

