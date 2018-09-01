'use strict'
/* eslint-disable no-return-assign */
const qw = require('qw')
const qr = require('@perl/qr')
const uniq = use('uniq')
const deepEqual = require('fast-deep-equal')

let Site

class Fic {
  constructor (fetch) {
    this._id = null
    this.fetch = fetch
    this.title = null
    this._link = null
    this.altlinks = null
    this.updateFrom = null
    this.authors = []
    this.created = null
    this.modified = null
    this.publisher = null
    this.description = null
    this.notes = null
    this.cover = null
    this.art = null
    this.chapterHeadings = null
    this.externals = null
    this.spoilers = null
    this.words = null
    this.tags = []
    this.fics = []
    this.chapters = new ChapterList()
    this.site = null
    this._includeTOC = null
    this._numberTOC = null
    this.fetchMeta = null
    this.scrapeMeta = null
    this.filename = null
    this.extra = {}
  }

  get author () {
    return this.authors.length && this.authors[0].name
  }
  set author (name) {
    if (!this.authors.length) this.authors.push({})
    this.authors[0].name = name
    if (!this.authors[0].name && !this.authors[0].link) this.authors.shift()
  }
  get authorUrl () {
    return this.authors.length && this.authors[0].link
  }
  set authorUrl (link) {
    if (!this.authors.length) this.authors.push({})
    this.authors[0].link = link
    if (!this.authors[0].name && !this.authors[0].link) this.authors.shift()
  }

  get id () {
    if (this._id) return this._id
    const link = this.link || this.updateFrom
    if (link) return 'url:' + link
  }
  set id (value) {
    return this._id = value
  }

  get includeTOC () {
    return this._includeTOC === null ? true : this._includeTOC
  }

  set includeTOC (value) {
    this._includeTOC = value
  }

  get numberTOC () {
    return this._numberTOC === null ? true : this._numberTOC
  }

  set numberTOC (value) {
    this._numberTOC = value
  }

  get words () {
    return this.chapters.filter(ch => ch.type === 'chapter').reduce((acc, ch) => acc + ch.words, 0) ||
           this.chapters.reduce((acc, ch) => acc + ch.words, 0)
  }

  set words (val) {
    return
  }

  get link () {
    if (this._link) return this._link
    return this.chapters[0].link
  }

  set link (val) {
    this._link = val
  }

  updateWith () {
    return this.updateFrom || this.link
  }

  chapterExists (link) {
    if (link == null) return false
    if (this.chapters.chapterExists(link, this)) return true
    if (this.fics.some(fic => fic.chapterExists(link))) return true
    return false
  }

  normalizeLink (link) {
    try {
      const site = Site.fromUrl(link)
      return site.normalizeLink(link)
    } catch (_) {
      return link
    }
  }

  normalizeChapterLink (link) {
    try {
      const site = Site.fromUrl(link)
      return site.normalizeChapterLink(link)
    } catch (_) {
      return link
    }
  }

  normalizeFicLink (link) {
    try {
      const site = Site.fromUrl(link)
      return site.normalizeFicLink(link)
    } catch (_) {
      return link
    }
  }

  addChapter (opts) {
    if (this.chapterExists(opts.link) || this.chapterExists(opts.fetchFrom)) return
    if (opts.spoilers === null) opts.spoilers = this.spoilers
    this.chapters.addChapter(opts)
  }

  importFromJSON (raw) {
    if (raw.parent) return SubFic.fromJSON(raw.parent, raw)
    const props = qw`id link altlinks title created modified
     description notes tags publisher cover art chapterHeadings words updateFrom
     includeTOC numberTOC fetchMeta scrapeMeta filename`

    for (let prop of props) {
      if (prop in raw) this[prop] = raw[prop]
    }

    if (raw.authors) {
      this.authors = raw.authors.map(au => {
        if (typeof au === 'string') {
          let [, name, link] = au.match(qr`^(.*?)(?: <([^<]+)>)?$`)
          if (link === 'null') link = null
          return {name, link}
        } else {
          return au
        }
      })
    } else {
      this.authors = []
    }
    if (raw.author || raw.authorUrl) {
      if (raw.authorUrl && !this.authors.some(_ => _.link === raw.authorUrl)) {
        this.authors.unshift({name: raw.author, link: raw.authorUrl})
      } else if (raw.author && !this.authors.some(_ => _.name === raw.author)) {
        this.authors.unshift({name: raw.author, link: raw.authorUrl})
      }
    }
    this.externals = raw.externals != null ? raw.externals : true
    this.spoilers = raw.spoilers != null ? raw.spoilers : true
    for (let prop of Object.keys(raw)) {
      if (props.indexOf(prop) !== -1) continue
      if (prop !== 'authors' && prop !== 'chapters' && prop !== 'fics' && prop !== 'externals' && prop !== 'spoilers') {
        this.extra[prop] = raw[prop]
      }
    }
    this.chapters.importFromJSON(this, raw)
    if (raw.fics) {
      for (let fic of raw.fics) {
        this.fics.push(SubFic.fromJSON(this, fic))
      }
    }
    try {
      this.site = Site.fromUrl(this.updateWith())
    } catch (ex) {
      process.emit('warn', ex)
    }
    return this
  }

  static async fromUrl (fetch, link) {
    const fic = new this(fetch)
    fic.site = Site.fromUrl(link)
    fic.link = fic.site.link
    try {
      await fic.site.getFicMetadata(fetch, fic)
    } catch (err) {
      if (!fic.site.canScrape || (err.code !== 'ENETWORKDISABLED' && (!err.meta || err.meta.status !== 404))) throw err
    }
    if (fic.chapters.length === 0 && fic.fics.length === 0) {
      fic.scrapeMeta = true
      if (fic.site.canScrape) {
        await fic.site.scrapeFicMetadata(fetch, fic)
      } else {
        const err = new Error(`No chapters found in: ${link}`)
        err.code = 404
        err.url = link
        throw err
      }
    } else {
      fic.fetchMeta = true
    }
    return fic
  }

  static async fromOnlyUrl (fetch, link) {
    const err = new Error(`Could not find chapters in: ${link}`)
    const fic = new this(fetch)
    fic.site = Site.fromUrl(link)
    fic.link = fic.site.link
    fic.fetchMeta = true
    await fic.site.getFicMetadata(fetch, fic)
    if (fic.chapters.length === 0 && fic.fics.length === 0) {
      err.code = 404
      err.url = link
      throw err
    }
    return fic
  }

  static async fromUrlAndScrape (fetch, link, scrapeType) {
    const fic = new this(fetch)
    fic.site = Site.fromUrl(link)
    fic.link = fic.site.link
    fic.fetchMeta = true
    await fic.site.getFicMetadata(fetch, fic)
    if (fic.site.canScrape) {
      fic.scrapeMeta = scrapeType
      await fic.site.scrapeFicMetadata(fetch, fic)
    }
    return fic
  }

  static async scrapeFromUrl (fetch, link, scrapeType) {
    const fic = new this()
    fic.site = Site.fromUrl(link)
    fic.link = fic.site.link
    fic.scrapeMeta = scrapeType
    if (!fic.site.canScrape) {
      const err = new Error(`Site ${fic.site.publisherName || fic.site.publisher} does not support fetching via scraping for ${fic.title} @ ${fic.link}`)
      err.code = 'ENOSCRAPE'
      throw err
    }
    await fic.site.scrapeFicMetadata(fetch, fic)
    return fic
  }

  static fromJSON (raw) {
    const fic = new this()
    return fic.importFromJSON(raw)
  }
  static publicMembers () {
    return qw`title id link altlinks updateFrom author authorUrl authors created modified publisher cover art description notes tags words fics chapterHeadings includeTOC numberTOC fetchMeta scrapeMeta filename`
  }

  toJSON () {
    const result = {}
    for (let prop of qw`
         title _id _link altlinks updateFrom authors created modified publisher cover art
         description notes tags words fics chapterHeadings _includeTOC _numberTOC fetchMeta scrapeMeta filename
       `) {
      if (this[prop] != null && (!Array.isArray(this[prop]) || this[prop].length)) result[prop.replace(/^_/,'')] = this[prop]
    }
    if (result.authors && result.authors.length === 0) delete result.authors
    if (result.authors) result.authors = result.authors.map(({name, link}) => name + (link ? ` <${link}>` : ''))
    for (let prop in this.extra) {
      result[prop] = this.extra[prop]
    }
    if (this.chapters.length) result.chapters = this.chapters.toJSON(this)
    if (result.fics) {
      result.fics.sort(sortFics)
    }
    if (!this.externals) result.externals = this.externals
    if (!this.spoilers) result.spoilers = this.spoilers
    return result
  }
  toFullJSON () {
    const result = {}
    for (let prop of Fic.publicMembers()) {
      result[prop] = this[prop]
    }
    for (let prop in this.extra) {
      result[prop] = this.extra[prop]
    }
    result.chapters = this.chapters.toFullJSON(this)
    if (!result.fics) result.fics = []
    result.fics.sort(sortFics)
    result.externals = this.externals
    result.spoilers = this.spoilers
    return result
  }
}

function sortFics (a, b) {
  const am = a.link.match(/fanfiction.net[/]s[/](\d+)[/](\d+)/)
  const bm = b.link.match(/fanfiction.net[/]s[/](\d+)[/](\d+)/)
  if (am && bm) {
    const fico = Number(am[1]) - Number(bm[1])
    if (fico) return fico
    const cho = Number(am[2]) - Number(bm[2])
    if (cho) return cho
  }
  if (a.created && b.created) {
    const dto = a.created > b.created ? 1 : a.created < b.created ? -1 : 0
    if (dto) return dto
  }
  const lo = a.link.localeCompare(b.link)
  if (lo) return lo
  return a.title.localeCompare(b.title)
}

class SubFic extends Fic {
  constructor (parentFic) {
    super()
    this.parent = parentFic
    delete this.fics
    for (let prop of qw`_title _created _modified _description _notes _link _authors _tags _chapterHeadings`) {
      this[prop] = null
    }
  }
  chapterExists (link) {
    return this.chapters.chapterExists(link, this)
  }
  static fromJSON (parent, raw) {
    if (typeof parent === 'string') {
      parent = Fic.fromJSON({id: parent})
    }
    const fic = new this(parent)
    const init = Object.assign({}, raw)
    delete init.parent
    fic.importFromJSON(init)
    return fic
  }
  // inherit from the main fic
  get publisher () {
    return this._publisher || this.parent.publisher
  }
  set publisher (value) {
    return this._publisher = value
  }
  get chapterHeadings () {
    return this._chapterHeadings || this.parent.chapterHeadings
  }
  set chapterHeadings (value) {
    return this._chapterHeadings = value
  }
  get externals () {
    return this._externals || this.parent.externals
  }
  set externals (value) {
    return this._externals = value
  }
  get spoilers () {
    return this._spoilers || this.parent.spoilers
  }
  set spoilers (value) {
    return this._spoilers = value
  }
  get tags () {
    if (!this._tags) return Object.assign([], this.parent.tags)
    return this._tags
  }
  set tags (value) {
    if (value.length === 0) value = null
    return this._tags = value
  }

  // inherit from the first chapter OR the main fic
  get authors () {
    if (!this._authors) {
      const chap = this.chapters[0]
      if (chap && (chap.author || chap.authorUrl)) {
        this._authors = [{name: chap.author, link: chap.authorUrl}]
      } else {
        this._authors = [...this.parent.authors.map(_ => ({..._}))]
      }
    }
    return this._authors
  }
  set authors (authors) {
    this._authors = authors
  }
  get author () {
    const author = this._authors && this._authors[0]
    if (author) return author.name
    if (this.chapters.length && this.chapters[0].author) return this.chapters[0].author
    return this.parent.author
  }
  set author (value) {
    if (!this.authors.length) this.authors.push({})
    this.authors[0].name = value
  }
  get authorUrl () {
    const author = this._authors && this._authors[0]
    if (author) return author.link
    if (this.chapters.length && this.chapters[0].authorUrl) return this.chapters[0].authorUrl
    return this.parent.authorUrl
  }
  set authorUrl (value) {
    if (!this.authors.length) this.authors.push({})
    this.authors[0].link = value
  }
  // inherit from the first chapter
  get title () {
    return this._title || (this.chapters.length && this.chapters[0].name)
  }
  set title (value) {
    return this._title = value
  }
  get link () {
    return this._link || (this.chapters.length && this.chapters[0].link)
  }
  set link (value) {
    return this._link = value
  }
  get description () {
    return this._description || (this.chapters.length && this.chapters[0].description)
  }
  set description (value) {
    return this._description = value
  }
  get notes () {
    return this._notes || (this.chapters.length && this.chapters[0].notes)
  }
  set notes (value) {
    return this._notes = value
  }
  get created () {
    return this._created || (this.chapters.length && this.chapters[0].created)
  }
  set created (value) {
    return this._created = value
  }
  // inherit from the _last_ chapter
  get modified () {
    const lastChapter = this.chapters.length && this.chapters[this.chapters.length-1]
    return this._modified || (lastChapter && (lastChapter.modified || lastChapter.created))
  }
  set modified (value) {
    return this._modified = value
  }
  toJSON () {
    const result = {}
    if (deepEqual(this._authors, this.parent.authors)) {
      this._authors = null
    }
    for (let prop of qw`
         _title _id _link altlinks updateFrom _authors _created _modified _publisher
         _description _notes cover art _tags chapters _chapterHeadings words _includeTOC _numberTOC
         `) {
      const assignTo = prop[0] === '_' ? prop.slice(1) : prop
      if (this[prop] && (this[prop].length == null || this[prop].length)) result[assignTo] = this[prop]
    }
    for (let prop in this.extra) {
      result[prop] = this.extra[prop]
    }

    return result
  }
}

class ChapterList extends Array {
  chapterExists (link, fic) {
    if (link == null) {
      return
    } else if (fic) {
      const normalizedLink = fic.normalizeChapterLink(link)
      return this.some(chap => fic.normalizeChapterLink(chap.link) === normalizedLink || chap.fetchFrom === normalizedLink)
    } else {
      return this.some(chap => chap.link === link || chap.fetchFrom === link)
    }
  }
  addChapter (opts) {
    if (this.chapterExists(opts.fetchFrom) || this.chapterExists(opts.link)) return
    let name = opts.name
    let ctr = 0
    while (this.some(chap => chap.name === name)) {
      name = opts.name + ' (' + ++ctr + ')'
    }
    if (opts.created && (!this.created || opts.created < this.created)) this.created = opts.created
    this.push(new Chapter(Object.assign({}, opts, {name, order: this.length})))
    this.sort()
  }
  sort () {
    const types = {}
    types['chapter'] = 0
    types['Sidestory'] = 50
    types['Media'] = 75
    types['Informational'] = 90
    types['Apocrypha'] = 100
    types['Staff Post'] = 9999
    Array.prototype.sort.call(this, (a, b) => {
      return (types[a.type] - types[b.type]) || a.order - b.order
    })
  }
  importFromJSON (fic, raw) {
    if (raw.fics && !raw.chapters) return
    if (raw.chapters) {
      for (let chapter of raw.chapters) {
        if (chapter.spoilers == null) chapter.spoilers = fic.spoilers
        this.push(Chapter.fromJSON(this.length, chapter))
      }
      this.sort()
    } else {
      process.emit('warn', 'Fic "' + raw.title + '" is missing any chapters.')
    }
  }
  toJSON (fic) {
    return this.map(chap => chap.toJSON ? chap.toJSON(fic) : chap)
  }
  toFullJSON (fic) {
    return this.map(chap => chap.toFullJSON ? chap.toFullJSON(fic) : chap.toJSON ? chap.toJSON(fic) : chap)
  }
}

class Chapter {
  constructor (opts) {
    this.order = opts.order
    this.name = opts.name
    this.link = opts.link
    this.altlinks = opts.altlinks
    if (opts.type) {
      this.type = opts.type
    } else if (/^Omake:/.test(this.name)) {
      this.type = 'Sidestory'
    } else if (/^Appendix:/.test(this.name)) {
      this.type = 'Apocrypha'
    } else if (/^Art:/.test(this.name)) {
      this.type = 'Media'
    } else {
      this.type = 'chapter'
    }
    this.description = opts.description
    this.notes = opts.notes
    this.cover = opts.cover
    this.art = opts.art
    this.fetchFrom = opts.fetchFrom
    this.created = opts.created
    this.modified = opts.modified
    this.author = opts.author
    this.authorUrl = opts.authorUrl
    this.tags = opts.tags
    this._externals = opts.externals
    this._spoilers = opts.spoilers
    this.headings = opts.headings
    this.words = opts.words || 0
  }
  get externals () {
    return this._externals == null ? true : this._externals
  }
  set externals (value) {
    this._externals = value
  }
  get spoilers () {
    return this._spoilers == null ? true : this._spoilers
  }
  set spoilers (value) {
    this._spoilers = value
  }
  toJSON (fic) {
    const ficExternals = (fic && fic.externals) == null ? true : Boolean(fic.externals)
    const ficSpoilers = (fic && fic.spoilers) == null ? true : Boolean(fic.spoilers)
    const ficHeadings = (fic && fic.chapterHeadings) == null ? true : Boolean(fic.chapterHeadings)
    return {
      name: this.name,
      type: this.type !== 'chapter' ? this.type : undefined,
      description: this.description,
      notes: this.notes,
      cover: this.cover,
      art: this.art,
      link: this.link,
      altlinks: this.altlinks,
      fetchFrom: this.fetchFrom,
      author: this.author,
      authorUrl: this.authorUrl,
      created: this.created === 'Invalid Date' ? null : this.created,
      modified: this.modified === 'Invalid Date' ? null : this.modified,
      externals: this._externals && this._externals !== ficExternals ? this._externals : null,
      spoilers: this._spoilers && this._spoilers !== ficSpoilers ? this._spoilers: null,
      headings: this.headings !== ficHeadings ? this.headings: null,
      words: this.words
    }
  }
  toFullJSON (fic) {
    return {
      name: this.name,
      type: this.type,
      description: this.description,
      notes: this.notes,
      cover: this.cover,
      art: this.art,
      link: this.link,
      altlinks: this.altlinks,
      fetchFrom: this.fetchFrom,
      author: this.author,
      authorUrl: this.authorUrl,
      created: this.created === 'Invalid Date' ? null : this.created,
      modified: this.modified === 'Invalid Date' ? null : this.modified,
      externals: this.externals,
      spoilers: this.spoilers,
      headings: this.headings,
      words: this.words
    }
  }
  static fromJSON (order, opts) {
    return new Chapter(Object.assign({order}, opts))
  }
  fetchWith () {
    return this.fetchFrom || this.link
  }
  getContent (fetch) {
    const site = Site.fromUrl(this.fetchWith())
    return site.getChapter(fetch, this)
  }
  static getContent (fetch, href) {
    return (new this({link: href})).getContent(fetch)
  }
}

module.exports = Fic
module.exports.SubFic = SubFic
module.exports.Chapter = Chapter

// defer 'cause `class` definitions don't hoist
Site = use('site')
