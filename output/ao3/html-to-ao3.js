'use strict'
module.exports = HTMLToAO3

function HTMLToAO3 (html) {
  return new Parser().parse(html)
}

function nothing () {}

class Parser {
  constructor () {
    this.output = []
    this.lineBuffer = ''
    this.tagBuffer = {}
    this.accumulatingContent = true

    const qw = require('qw')
    this.tags = {
      a: {
        start: (tag, attrs) => {
          const href = attrs.filter(attr => attr.name === 'href')
          this.addText(`<a href="${href[0].value}">`)
        },
        end: () => {
          this.addText('</a>')
        }
      },
      abbr: this.passthrough(qw`title`),
      acronym: this.passthrough(qw`title`),
      address: this.passthroughBlock(),
      article: this.block('<div>', '</div>'),
      aside: this.block('<div>', '</div>'),
      b: this.inline('<strong>', '</strong>'),
      big: this.passthrough(),
      blockquote: this.passthroughBlock(),
      // body: ignore
      br: {
        start: (tag, attrs) => {
          this.addText('<br>')
          this.endLine()
        },
        end: () => {}
      },
      caption: this.passthroughBlock(qw`align`),
      center: this.passthrough(),
      cite: this.passthrough(),
      code: this.passthrough(),
      col: this.passthrough(qw`align width`),
      colgroup: this.passthrough(qw`align width`),
      dd: this.passthrough(),
      del: this.passthrough(),
      dfn: this.passthrough(qw`title`),
      div: this.passthroughBlock(),
      dl: this.passthroughBlock(),
      dt: this.passthrough(),
      em: this.passthrough(),
      figcaption: this.block(),
      figure: this.block('<div>', '</div>'),
      footer: this.block('<div>', '</div>'),
      h1: this.passthroughBlock(),
      h2: this.passthroughBlock(),
      h3: this.passthroughBlock(),
      h4: this.passthroughBlock(),
      h5: this.passthroughBlock(),
      h6: this.passthroughBlock(),
      // head: ignore
      header: this.block('<div>', '</div>'),
      hgroup: this.block('<div>', '</div>'),
      hr: this.passthroughBlock(qw`align width`),
      // html: ignore
      i: this.passthrough(),
      img: this.passthrough(qw`align alt height name src width`),
      ins: this.passthrough(),
      kbd: this.passthrough(),
      li: this.passthroughBlock(),
      // link: supress
      menu: this.block('<ul>', '</ul>'),
      ol: this.passthroughBlock(),
      output: this.inline(),
      p: this.paragraph(),
      pre: this.passthroughBlock(qw`width`),
      q: this.passthrough(),
      // ruby: ignore
      // rp: ignore
      // rt: ignore
      s: this.passthrough(),
      samp: this.passthrough(),
      section: this.block('<div>', '</div>'),
      small: this.passthrough(),
      // source: supress (used w/ video)
      span: this.inline(),
      strike: this.passthrough(),
      strong: this.passthrough(),
      // style: suppress (BUT DON'T DO THIS FOREVER)
      sub: this.passthrough(),
      sup: this.passthrough(),
      table: this.passthroughBlock(qw`align width`),
      tbody: this.passthroughBlock(qw`align`),
      td: this.passthrough(qw`align width`),
      tfoot: this.passthroughBlock(qw`align`),
      th: this.passthrough(qw`align width`),
      thead: this.passthroughBlock(qw`align`),
      time: this.inline(),
      // title: suppress
      tr: this.passthroughBlock(qw`align`),
      u: this.passthrough(),
      ul: this.passthroughBlock(),
      var: this.passthrough(),

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
    this.tags.time = this.tags.$ignore
    this.tags.title = this.tags.$suppress
    this.tags.wbr = this.tags.$ignore

    this.styles = {
      'xenforo-spoiler': (tag, name, value) => {
        this.addText(`<b><u>${value}:</b></u><blockquote>`)
        return '</blockquote>'
      },
      'xenforo-color': (tag, name, value) => {
        this.addText(`<font color="{$value}">`)
        return '</font>'
      },
      'xenforo-quote': (tag, name, value) => {
        const bits = value.match(/^(?:(\d+) )?'(.*)'|true/)
        if (value !== 'true' && bits[2]) {
          this.addText(`<b><u>${bits[2]} said:</b></u><blockquote>`)
        } else {
          this.addText('<blockquote>')
        }
        return '</blockquote>'
      },
      'text-decoration': (tag, name, valueStr) => {
        const values = valueStr.trim().split(/\s+/).filter(this.textDecorations())
        this.addText(values.map(this.textDecorations(0)).join(''))
        return values.map(this.textDecorations(1)).join('')
      },
      'color': (tag, name, valueStr) => {
        this.addText(`<font color="${valueStr}">`)
        return '</font>'
      },
      'border': () => '',
      'width': () => '',
      'display': () => '',
      'padding': () => {
        this.addText('<blockquote>')
        return '</blockquote>'
      },
      'padding-left': () => {
        this.addText('<blockquote>')
        return '</blockquote>'
      },
      'margin-left': () => {
        this.addText('<blockquote>')
        return '</blockquote>'
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
        this.addText(`<font size="${xen}">`)
        return '</font>'
      },
      'font-weight': (tag, name, value) => {
        if (value === 'bold' || value === 'bolder' || value >= 700) {
          this.addText(`<b>`)
          return '</b>'
        } else {
          return ''
        }
      },
      'font-family': (tag, name, value) => {
        this.addText(`<font face="${value}">`)
        return '</font>'
      },
      'vertical-align': (tag, name, value) => {
        switch (value) {
          case 'super':
            if (tag === 'sup') return ''
            this.addText('<sup>')
            return '</sup>'
          case 'sub':
            if (tag === 'sub') return ''
            this.addText('<sub>')
            return '</sub>'
          default:
            return ''
        }
      },
      'text-align': (tag, name, value) => {
        switch (value) {
          case 'center':
            this.addText('<center>')
            return '</center>'
          case 'right':
          case 'left':
            break
          default:
            throw new Error('Unknown text alignment: ', value)
        }
      }
    }

    this.textDecorationsMap = {
      'underline': qw`<u> </u>`,
      'line-through': qw`<s> </s>`
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

    this.lineBuffer += text
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

  passthrough (validAttrs, noStyle) {
    if (!validAttrs) validAttrs = []
    return {
      start: (tag, attrs) => {
        if (!noStyle) this.handleStyle(tag, attrs)
        const html = use('html-template-tag')
        const attrStr = validAttrs.filter(n => attrs[n]).map(n => html`"${n}"="${attrs[n]}"`).join(' ')
        this.addText(`<${tag}${attrStr ? ' ' + attrStr : ''}>`)
      },
      end: (tag) => {
        this.addText(`</${tag}>`)
        if (!noStyle) {
          const closeWith = this.tagBuffer[tag].pop()
          if (closeWith) this.addText(closeWith)
        }
      }
    }
  }

  passthroughBlock (validAttrs, noStyle) {
    if (!validAttrs) validAttrs = []
    return {
      start: (tag, attrs) => {
        if (this.currentLine().length) this.endLine()

        if (!noStyle) this.handleStyle(tag, attrs)
        const html = use('html-template-tag')
        const attrStr = validAttrs.filter(n => attrs[n]).map(n => html`"${n}"="${attrs[n]}"`).join(' ')
        this.addText(`<${tag}${attrStr ? ' ' + attrStr : ''}>`)
      },
      end: (tag) => {
        this.addText(`</${tag}>`)
        if (!noStyle) {
          const closeWith = this.tagBuffer[tag].pop()
          if (closeWith) this.addText(closeWith)
        }
        if (this.currentLine().length) this.endLine()
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
        this.addText('<p>')
        if (!noStyle) this.handleStyle(tag, attrs)
        if (start) this.addText(start)
      },
      end: (tag, attrs) => {
        if (end) this.addText(end)
        if (!noStyle) {
          const closeWith = this.tagBuffer[tag].pop()
          if (closeWith) this.addText(closeWith)
        }
        this.addText('</p>')
        if (this.currentLine().length) {
          this.endLine()
          this.endLine()
        } else {
          this.endLine()
        }
      }
    }
  }

  async parse (html$) {
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

    parser.end(await html$)
    const fun = require('funstream')
    await fun(parser)
    this.endLine()
    return this.output.join('\n').replace(/\n+$/, '') + '\n'
  }
}
