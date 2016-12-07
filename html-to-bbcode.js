'use strict'
module.exports = HTMLToBBCode
const Bluebird = require('bluebird')
const parse5 = require('parse5')
const util = require('util')
const parseCSS = require('css-parse')

function HTMLToBBCode (html) {
  return new Parser().parse(html)
}

function nothing () {}

class Parser {
  constructor () {
    this.output = []
    this.lineBuffer = ''
    this.tagBuffer = {}
    this.accumulatingContent = true

    this.tags = {
      b: this.inline('[b]', '[/b]'),
      i: this.inline('[i]', '[/i]'),
      u: this.inline('[u]', '[/u]'),
      s: this.inline('[s]', '[/s]'),
      dl: this.block(),
      dt: this.block('[b][u]', '[/u][/b]'),
      dd: this.block('[indent]', '[/indent]'),
      h1: this.paragraph('[size=7][b]', '[/b][/size]'), // 2em
      h2: this.paragraph('[size=6][b]', '[/b][/size]'), // 1.5em
      h3: this.paragraph('[size=5][b]', '[/b][/size]'), // 1.17em
      h4: this.paragraph('[b]', '[/b]'),
      h5: this.paragraph('[size=3][b]', '[/b][/size]'), // 0.83em
      h6: this.paragraph('[size=2][b]', '[/b][/size]'), // 0.67em
      center: this.inline('[center]', '[/center]'),
      hr: this.block('[hr][/hr]', null, false),
      table: this.inline('[xtable]', '[/xtable]'),
      tr: this.inline('{tr}', '{/tr}'),
      td: this.inline('{td}', '{/td}'),
      th: this.inline('{td}[b][center]', '[/center][/b]{/td}'),
      img: {
        start: (tag, attrs) => {
          const src = attrs.filter(attr => attr.name === 'src')
          this.addText(`[img]${src[0].value}[/img]`)
        },
        end: () => {
          this.addText('[/img]')
        }
      },
      a: {
        start: (tag, attrs) => {
          const href = attrs.filter(attr => attr.name === 'href')
          this.addText(`[url=${href[0].value}]`)
        },
        end: () => {
          this.addText('[/url]')
        }
      },
      span: this.inline(),
      div: this.block(),
      pre: this.block('[code]', '[/code]'),
      aside: this.block(),
      br: {
        start: () => this.endLine(),
        end: nothing
      },
      sub: this.inline('[sub]', '[/sub]'),
      sup: this.inline('[sup]', '[/sup]'),
      p: this.paragraph(),
      ul: this.inline('[list]','[/list]'),
      ol: this.inline('[list=1]', '[/list]'),
      li: this.inline('[*]', null, false),
      blockquote: this.inline('[indent]', '[/indent]'),
      $ignore: {
        start: nothing,
        end: nothing
      },
      $suppress: {
        start: () => this.pauseText(),
        end: () => this.resumeText()
      }
    }
    this.tags.strong = this.tags.b
    this.tags.em = this.tags.i
    this.tags.strike = this.tags.s
    this.tags.title = this.tags.$suppress
    this.tags.script = this.tags.$suppress
    this.tags.html = this.tags.$ignore
    this.tags.head = this.tags.$ignore
    this.tags.body = this.tags.$ignore
    this.tags.header = this.tags.$ignore
    this.tags.tbody = this.tags.$ignore
    this.tags.wbr = this.tags.$ignore

    this.styles = {
      'xenforo-spoiler': (tag, name, value) => {
        this.addText(`[spoiler=${value}]`)
        return '[/spoiler]'
      },
      'xenforo-color': (tag, name, value) => {
        this.addText(`[color={$value}]`)
        return '[/color]'
      },
      'xenforo-quote': (tag, name, value) => {
        const bits = value.match(/^(?:(\d+) )?'(.*)'|true/)
        if (bits[2]) {
          this.addText(`[quote="${bits[2]}, post: ${bits[1]}"]`)
        } else if (value !== 'true') {
          this.addText(`[quote="${bits[2]}"]`)
        } else {
          this.addText('[quote]')
        }
        return '[/quote]'
      },
      'text-decoration': (tag, name, valueStr) => {
        const values = valueStr.trim().split(/\s+/).filter(this.textDecorations())
        this.addText(values.map(this.textDecorations(0)).join(''))
        return values.map(this.textDecorations(1)).join('')
      },
      'color': (tag, name, valueStr) => {
        this.addText(`[color=${valueStr}]`)
        return '[/color]'
      },
      'border': () => '',
      'width': () => '',
      'display': () => '',
      'padding': () => {
        this.addText('[indent]')
        return '[/indent]'
      },
      'padding-left': () => {
        this.addText('[indent]')
        return '[/indent]'
      },
      'font-size': (tag, name, value) => {
        const size = value.match(/^(\d+)(em|px|pt)?$/)
        if (!size) return ''
        let px = size[1]
        const unit = size[2] || 'px'
        if (unit == 'pt') {
          px *= 72
        } else if (unit === 'em') {
          px *= 13.3
        }
        const xen = (px - 6) / 2.8571
        this.addText(`[size=${xen}]`)
        return '[/size]'
      },
      'font-family': (tag, name, value) => {
        this.addText(`[font=${value}]`)
        return '[/font]'
      },
      'vertical-align': (tag, name, value) => {
        switch (value) {
          case 'super':
            if (tag === 'sup') return ''
            this.addText('[sup]')
            return '[/sup]'
            break
          case 'sub':
            if (tag === 'sub') return ''
            this.addText('[sub]')
            return '[/sub]'
            break
          default:
            return ''
        }
      },
      'text-align': (tag, name, value) => {
        switch (value) {
          case 'center':
            this.addText('[center]')
            return '[/center]'
            break
          case 'right':
            this.addText('[right]')
            return '[/right]'
            break
          case 'left':
            this.addText('[left]')
            return '[/left]'
            break
          default:
            throw new Error('Unknown text alignment: ', value)
        }
      }
    }

    this.textDecorationsMap = {
      'underline': ['[u]', '[/u]'],
      'line-through': ['[s]', '[/s]'],
    }

    this.emojiMap = {
      '🙂': ':)',
      '😉': ';)',
      '🙁': ':(',
      '😡': ':mad:',
      '🙃': ':confused:',
      '😎': ':cool:',
      '😛': ':p',
      '😆': ':D',
      '😮': ':o',
      '😳': ':oops:',
      '🙄': ':rolleyes:',
      '😜': 'o_O',
      '😭': ':cry:',
      '😏': ':evil:',
      '😇': ':whistle:',
      '😂': ':lol:',
      '😆😂': ':rofl:',
      '😁': ':grin:',
      '😞': ':sad:',
      '😝': ':sour:'
    }
  }

  pauseText () {
    this.accumulatingContent = false
  }

  resumeText () {
    this.accumulatingContent = true
  }

  addText (text) {
    if (!this.accumulatingContent) return

    const matchEmoji = new RegExp(Object.keys(this.emojiMap).join('|'))
    this.lineBuffer += text.replace(matchEmoji, match => this.emojiMap[match])
  }

  currentLine () {
    return this.lineBuffer.replace(/\s+/g, ' ').trim()
  }

  endLine () {
    this.output.push(this.currentLine())
    this.lineBuffer = ''
  }

  textDecorations (which) {
    return value => which == null ? this.textDecorationsMap[value] : this.textDecorationsMap[value][which]
  }

  handleStyle (tag, attrs) {
  //span, attrs: [ { name: 'style', value: 'text-decoration: line-through' } ]
    let foundUnknown = false
    let closeWith = ''
    for (let attr of attrs) {
      if (attr.name === 'style') {
        try {
          let css = parseCSS(`this { ${attr.value} }`)
          for (let decl of css.stylesheet.rules[0].declarations) {
            let style = this.styles[decl.property]
            if (style) {
              closeWith = style(tag, decl.property, decl.value) + closeWith
              if (/^xenforo-/.test(decl.property)) break
            } else {
              throw new Error('UNKNOWN CSS', decl, tag, attrs)
            }
          }
        } catch (ex) {
          throw new Error('INVALID CSS value=' + attr.value + ', ' +ex.stack)
        }
      } else if (attr.name === 'id' || attr.name === 'epub:type') {
        // ignore
      } else {
        foundUnknown = true
      }
    }
    if (foundUnknown) {
      throw new Error('UNKNOWN ATTRIBUTES', tag, attrs)
    }
    if (!this.tagBuffer[tag]) this.tagBuffer[tag] = []
    this.tagBuffer[tag].push(closeWith)
  }

  inline (start, end, noStyle) {
    return {
      start: (tag, attrs) => {
        if (!noStyle) this.handleStyle(tag, attrs)
        if (start) this.addText(start)
      },
      end: (tag) => {
        if (end) this.addText(end)
        if (!noStyle) {
          const closeWith = this.tagBuffer[tag].pop()
          if (closeWith) this.addText(closeWith)
        }
      }
    }
  }

  block (start, end, noStyle) {
    return {
      start: (tag, attrs) => {
        if (this.currentLine().length) this.endLine()

        if (!noStyle) this.handleStyle(tag, attrs)
        if (start) this.addText(start)
      },
      end: (tag, attrs) => {
        if (end) this.addText(end)
        if (!noStyle) {
          const closeWith = this.tagBuffer[tag].pop()
          if (closeWith) this.addText(closeWith)
        }
        if (this.currentLine().length) this.endLine()
      }
    }
  }

  paragraph (start, end, noStyle) {
    return {
      start: (tag, attrs) => {
        // paragraphs end the current line, if any
        if (this.currentLine().length) this.endLine()

        // they also inject a blank line between themselves and any previous lines
        if (this.output.length && this.output[this.output.length - 1].length) this.endLine()
        if (!noStyle) this.handleStyle(tag, attrs)
        if (start) this.addText(start)
      },
      end: (tag, attrs) => {
        if (end) this.addText(end)
        if (!noStyle) {
          const closeWith = this.tagBuffer[tag].pop()
          if (closeWith) this.addText(closeWith)
        }
        if (this.currentLine().length) {
          this.endLine()
          this.endLine()
        } else {
          this.endLine()
        }
      }
    }
  }

  parse (html) {
    const parser = new parse5.SAXParser()
    parser.on('startTag', (tag, attrs, selfClosing, location) => {
      if (this.tags[tag]) {
        this.tags[tag].start(tag, attrs, selfClosing, location)
      } else {
        console.log('UNKNOWN', 'tag:', tag + ', attrs:', util.inspect(attrs) + ', selfClosing:', !!selfClosing + ', location:', location, '\n')
      }
    })
    parser.on('endTag', (tag, attrs, selfClosing, location) => {
      if (this.tags[tag]) {
        this.tags[tag].end(tag, attrs, selfClosing, location)
      } else {
        console.log('UNKNOWN', 'endtag:', tag + ', attrs:', util.inspect(attrs) + ', selfClosing:', !!selfClosing + ', location:', location, '\n')
      }
    })
    parser.on('text', text => this.addText(text))
    parser.end(html)

    return new Bluebird( (resolve, reject) => {
      parser.on('error', reject)
      parser.on('finish', () => {
        this.endLine()
        resolve(this.output.join('\n').replace(/\n+$/, '') + '\n')
      })
    })
  }
}
