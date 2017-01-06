'use strict'
const cheerio = require('cheerio')

const Chapter = use('fic').Chapter

class ChapterContent extends Chapter {
  constructor (from, opts) {
    if (!from) {
      opts = {}
      super(opts)
    } else {
      if (from instanceof Chapter) {
        if (from instanceof ChapterContent && from._words == null) {
          from._words = 0
          super(Object.assign(from.toJSON(), {words: null}, opts || {}))
        } else {
          super(Object.assign(from.toJSON(), opts || {}))
        }
      } else {
        opts = from
        from = null
        super(opts)
      }
    }

    this.num = opts.num
    this.linkName = opts.linkName
    this.filename = opts.filename
    this.base = opts.base
    this._content = opts.content
    this._$content = null
    this._html = opts.html
    this._$html = null
    this.type = opts.type
    this.site = opts.site
    this._words = null
  }
  get html () {
    if (this._$html) {
      return this._$html.html().replace(/^\s+|\s+$/mg, '')
    } else {
      return (this._html || '').replace(/^\s+|\s+$/mg, '')
    }
  }
  set html (html) {
    this._html = html
    this._$html = null
  }
  get $ () {
    if (this._$html == null) {
      if (this._html == null) throw new Error('No html available')
      this._$html = cheerio.load(this._html)
      this._$html.find = select => this._$html(select)
      this._html = null
    }
    return this._$html
  }
  set $ (html) {
    this._$html = html
    if (!html.find) html.find = select => this._$html(select)
    this._html = null
  }
  get content () {
    if (this._$content) {
      return this._$content.html().replace(/^\s+|\s+$/mg, '')
    } else {
      return (this._content || '').replace(/^\s+|\s+$/mg, '')
    }
  }
  set content (html) {
    this._content = html
    this._$content = null
  }
  get $content () {
    if (this._$content == null) {
      if (this._content == null) throw new Error('No content available')
      this._$content = cheerio.load(this._content)
      this._$content.find = select => this._$content(select)
      this._content = null
    }
    return this._$content
  }
  set $content (html) {
    this._$content = html
    if (!this._$content.find) html.find = select => this._$content(select)
    this._content = null
    this._words = null
  }
  get words () {
    if (this._words == null) {
      if (this._content == null && this._$content == null) throw new Error('no words for no content')
      this._words = this.site.countStoryWords(this)
    }
    return this._words
  }
  set words (num) {
    this._words = num
  }
}


module.exports = ChapterContent
