'use strict'
module.exports = HTMLToBBCode

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
      a: {
        start: (tag, attrs) => {
          const href = attrs.filter(attr => attr.name === 'href')
          this.addText(`[url=${href[0].value}]`)
        },
        end: () => {
          this.addText('[/url]')
        }
      },
      abbr: this.inline(),
      acronym: this.inline(),
      address: this.block('[i]', '[/i]'),
      article: this.block(),
      aside: this.block(),
      b: this.inline('[b]', '[/b]'),
      big: this.inline('[size=5]', '[/size]'),
      blockquote: this.block('[indent]', '[/indent]'),
      // body: ignore
      br: {
        start: () => this.endLine(),
        end: nothing
      },
      caption: this.inline(), // table related
      center: this.inline('[center]', '[/center]'),
      cite: this.inline('[i]', '[/i]'),
      code: this.block('[code]', '[/code]'),
      col: this.inline(),
      colgroup: this.inline(),
      dd: this.block('[indent]', '[/indent]'),
      del: this.inline('[s]', '[/s]'),
      dfn: this.inline(),
      div: this.block(),
      dl: this.block(),
      dt: this.block('[b][u]', '[/u][/b]'),
      em: this.inline('[i]', '[/i]'),
      figcaption: this.block(),
      figure: this.block(),
      footer: this.block(),
      h1: this.paragraph('[size=7][b]', '[/b][/size]'), // 2em
      h2: this.paragraph('[size=6][b]', '[/b][/size]'), // 1.5em
      h3: this.paragraph('[size=5][b]', '[/b][/size]'), // 1.17em
      h4: this.paragraph('[b]', '[/b]'),
      h5: this.paragraph('[size=3][b]', '[/b][/size]'), // 0.83em
      h6: this.paragraph('[size=2][b]', '[/b][/size]'), // 0.67em
      // head: ignore
      header: this.block(),
      hgroup: this.block(),
      hr: this.block('[hr][/hr]', null, false),
      i: this.inline('[i]', '[/i]'),
      img: {
        start: (tag, attrs) => {
          const src = attrs.filter(attr => attr.name === 'src')
          this.addText(`[img]${src[0].value}[/img]`)
        },
        end: () => {
          this.addText('[/img]')
        }
      },
      ins: this.inline('[u]', '[/u]'),
      kbd: this.inline('[font=Courier New]', '[/font]'),
      li: this.block('[*]', null, false),
      // link: supress
      menu: this.block('[list]', '[/list]'),
      ol: this.block('[list=1]', '[/list]'),
      output: this.inline(),
      p: this.paragraph(),
      pre: this.block('[code]', '[/code]'),
      q: this.inline('“', '”'),
      // ruby: ignore
      // rp: ignore
      // rt: ignore
      s: this.inline('[s]', '[/s]'),
      samp: this.inline('[font=Courier New]', '[/font]'),
      section: this.block(),
      small: this.inline('[size=3]', '[/size]'),
      // source: supress (used w/ video)
      span: this.inline(),
      strike: this.inline('[s]', '[/s]'),
      strong: this.inline('[b]', '[/b]'),
      // style: suppress (BUT DON'T DO THIS FOREVER)
      sub: this.inline('[sub]', '[/sub]'),
      sup: this.inline('[sup]', '[/sup]'),
      table: this.inline('[xtable]', '[/xtable]'),
      // tbody: ignored
      td: this.inline('{td}', '{/td}'),
      // tfoot: ignored
      th: this.inline('{td}[b][center]', '[/center][/b]{/td}'),
      // thead: ignored
      time: this.inline(),
      // title: suppress
      tr: this.inline('{tr}', '{/tr}'),
      u: this.inline('[u]', '[/u]'),
      ul: this.block('[list]', '[/list]'),
      var: this.inline('[i]', '[/i]'),

      $ignore: {
        start: nothing,
        end: nothing
      },
      $suppress: {
        start: () => this.pauseText(),
        end: () => this.resumeText()
      }
    }

    this.tags.body = this.tags.$ignore
    this.tags.head = this.tags.$ignore
    this.tags.hgroup = this.tags.$ignore
    this.tags.html = this.tags.$ignore
    this.tags.link = this.tags.$suppress
    this.tags.ruby = this.tags.$ignore
    this.tags.rp = this.tags.$ignore
    this.tags.rt = this.tags.$ignore
    this.tags.script = this.tags.$suppress
    this.tags.source = this.tags.$suppress
    this.tags.style = this.tags.$suppress
    this.tags.tbody = this.tags.$ignore
    this.tags.tfoot = this.tags.$ignore
    this.tags.thead = this.tags.$ignore
    this.tags.time = this.tags.$ignore
    this.tags.title = this.tags.$suppress
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
      'margin-left': () => {
        this.addText('[indent]')
        return '[/indent]'
      },
      'font-size': (tag, name, value) => {
        const size = value.match(/^(\d*(?:[.]\d+)?)(em|px|pt)?$/)
        if (!size) return ''
        let px = size[1]
        const unit = size[2] || 'px'
        if (unit === 'pt') {
          px *= 1.33333
        } else if (unit === 'em') {
          px *= 13.33333
        }
        let xen = Math.round((px - 5) / 2.8571)
        if (xen > 7) xen = 7
        if (xen === 3) return
        this.addText(`[size=${xen}]`)
        return '[/size]'
      },
      'font-weight': (tag, name, value) => {
        if (value === 'bold' || value === 'bolder' || value >= 700) {
          this.addText(`[b]`)
          return '[/b]'
        } else {
          return ''
        }
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
          case 'sub':
            if (tag === 'sub') return ''
            this.addText('[sub]')
            return '[/sub]'
          default:
            return ''
        }
      },
      'text-align': (tag, name, value) => {
        switch (value) {
          case 'center':
            this.addText('[center]')
            return '[/center]'
          case 'right':
            this.addText('[right]')
            return '[/right]'
          case 'left':
            this.addText('[left]')
            return '[/left]'
          default:
            throw new Error('Unknown text alignment: ', value)
        }
      }
    }

    this.textDecorationsMap = {
      'underline': ['[u]', '[/u]'],
      'line-through': ['[s]', '[/s]']
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

    const matchEmoji = new RegExp(Object.keys(this.emojiMap).join('|'), 'g')
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
    let foundUnknown = false
    let closeWith = ''
    for (let attr of attrs) {
      if (attr.name === 'style') {
        try {
          const parseCSS = require('css-parse')
          let css = parseCSS(`this { ${attr.value} }`)
          for (let decl of css.stylesheet.rules[0].declarations) {
            let style = this.styles[decl.property]
            if (style) {
              closeWith = style(tag, decl.property, decl.value) + closeWith
              if (/^xenforo-/.test(decl.property)) break
            } else {
              const util = require('util')
              process.emit('debug', `UNKNOWN CSS: ${util.inspect(decl)} ${tag} ${util.inspect(attrs)}`)
            }
          }
        } catch (ex) {
          process.emit('debug', 'INVALID CSS value=' + attr.value + ', ' + ex.stack)
        }
      }
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
    const parse5 = require('parse5')
    const parser = new parse5.SAXParser()
    parser.on('startTag', (tag, attrs, selfClosing, location) => {
      if (this.tags[tag]) {
        this.tags[tag].start(tag, attrs, selfClosing, location)
      } else {
        const util = require('util')
        process.emit('debug', 'UNKNOWN', 'tag:', tag + ', attrs:', util.inspect(attrs) + ', selfClosing:', !!selfClosing + ', location:', location, '\n')
      }
    })
    parser.on('endTag', (tag, attrs, selfClosing, location) => {
      if (this.tags[tag]) {
        this.tags[tag].end(tag, attrs, selfClosing, location)
      } else {
        const util = require('util')
        process.emit('debug', 'UNKNOWN', 'endtag:', tag + ', attrs:', util.inspect(attrs) + ', selfClosing:', !!selfClosing + ', location:', location, '\n')
      }
    })
    parser.on('text', text => this.addText(text))

    const Bluebird = require('bluebird')
    return Bluebird.resolve(html).then(html => {
      return new Bluebird((resolve, reject) => {
        parser.on('error', reject)
        parser.on('finish', () => {
          this.endLine()
          resolve(this.output.join('\n').replace(/\n+$/, '') + '\n')
        })
        parser.end(html)
      })
    })
  }
}
