'use strict'
/* eslint-disable no-return-assign */
const qw = require('qw')
const Bluebird = require('bluebird')

let Site

class Fic {
  constructor (fetch) {
    this.id = null
    this.fetch = fetch
    this.title = null
    this.link = null
    this.updateFrom = null
    this.author = null
    this.authorUrl = null
    this.created = null
    this.modified = null
    this.publisher = null
    this.description = null
    this.cover = null
    this.chapterHeadings = null
    this.externals = null
    this.words = null
    this.tags = []
    this.fics = []
    this.chapters = new ChapterList()
    this.site = null
    this.includeTOC = null
    this.numberTOC = null
    this.fetchMeta = null
    this.scrapeMeta = null
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

  addChapter (opts) {
    if (this.chapterExists(opts.link) || this.chapterExists(opts.fetchFrom)) return
    this.chapters.addChapter(opts)
  }

  importFromJSON (raw) {
    const props = qw`id link title author authorUrl created modified
     description tags publisher cover chapterHeadings words updateFrom
     includeTOC numberTOC fetchMeta scrapeMeta`

    for (let prop of props) {
      this[prop] = raw[prop]
    }
    this.chapters.importFromJSON(raw)
    if (raw.fics) {
      raw.fics.forEach(fic => this.fics.push(SubFic.fromJSON(this, fic)))
    }
    this.site = Site.fromUrl(this.updateWith())
    this.externals = raw.externals != null ? raw.externals : true
    for (let prop of Object.keys(raw)) {
      if (props.indexOf(prop) !== -1) continue
      if (prop !== 'chapters' && prop !== 'fics' && prop !== 'externals') {
        process.emit('warn', `Unknown property when importing fic: "${prop}"`)
      }
    }
    return this
  }

  static fromUrl (fetch, link) {
    const fic = new this(fetch)
    fic.site = Site.fromUrl(link)
    fic.link = fic.site.link
    return fic.site.getFicMetadata(fetch, fic).then(thenMaybeFallback, elseMaybeFallback).thenReturn(fic)
    function elseMaybeFallback (err) {
      if (err && (!err.meta || err.meta.status !== 404)) throw err
      return thenMaybeFallback(err)
    }
    function thenMaybeFallback (err) {
      if (fic.chapters.length === 0 ) {
        fic.scrapeMeta = true
        if (fic.site.canScrape) {
          return fic.site.scrapeFicMetadata(fetch, fic).catch(scrapeErr => Bluebird.reject(err || scrapeErr))
        } else {
          if (!err) {
            err = new Error(`Could not fetch: ${link}`)
            err.code = 404
            err.url = link
          }
          return Bluebird.reject(err)
        }
      } else {
        fic.fetchMeta = true
      }
    }
  }

  static fromUrlAndScrape (fetch, link) {
    const fic = new this(fetch)
    fic.site = Site.fromUrl(link)
    fic.link = fic.site.link
    fic.fetchMeta = true
    fic.scrapeMeta = true
    return fic.site.getFicMetadata(fetch, fic).then(() => {
      if (fic.site.canScrape) {
        return fic.site.scrapeFicMetadata(fetch, fic).thenReturn(fic)
      } else {
        return fic
      }
    })
  }

  static scrapeFromUrl (fetch, link) {
    const fic = new this()
    fic.site = Site.fromUrl(link)
    fic.link = fic.site.link
    fic.scrapeMeta = true
    if (!fic.site.canScrape) {
      const err = new Error(`Site ${fic.site.publisherName || fic.site.publisher} does not support fetching via scraping`)
      err.code = 'ENOSCRAPE'
      return Bluebird.reject(err)
    }
    return fic.site.scrapeFicMetadata(fetch, fic).thenReturn(fic)
  }

  static fromJSON (raw) {
    const fic = new this()
    return fic.importFromJSON(raw)
  }

  toJSON () {
    const result = {}
    for (let prop of qw`
         id title link updateFrom author authorUrl created modified publisher cover
         description tags words fics chapters chapterHeadings includeTOC numberTOC fetchMeta scrapeMeta
       `) {
      if (this[prop] != null && (!Array.isArray(this[prop]) || this[prop].length)) result[prop] = this[prop]
    }
    if (!this.externals) result.externals = this.externals
    return result
  }
}

class SubFic extends Fic {
  constructor (parentFic) {
    super()
    delete this.fics
    this.parent = parentFic
  }
  chapterExists (link) {
    return this.chapters.chapterExists(link, this)
  }
  static fromJSON (parent, raw) {
    const fic = new this(parent)
    fic.importFromJSON(raw)
    return fic
  }
  get author () {
    return this._author || this.parent.author
  }
  set author (value) {
    return this._author = value
  }
  get authorUrl () {
    return this._authorUrl || this.parent.authorUrl
  }
  set authorUrl (value) {
    return this._authorUrl = value
  }
  get publisher () {
    return this._publisher || this.parent.publisher
  }
  set publisher (value) {
    return this._publisher = value
  }
  get link () {
    return this._link || this.parent.link
  }
  set link (value) {
    return this._link = value
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
  toJSON () {
    const result = {}
    for (let prop of qw`
         title _link _author _authorUrl created modified _publisher
         description tags chapters _chapterHeadings words includeTOC numberTOC
         `) {
      const assignTo = prop[0] === '_' ? prop.slice(1) : prop
      if (this[prop] && (this[prop].length == null || this[prop].length)) result[assignTo] = this[prop]
    }
    return result
  }
}

class ChapterList extends Array {
  chapterExists (link, fic) {
    if (link == null) {
      return
    } else if (fic) {
      const normalizedLink = fic.normalizeLink(link)
      return this.some(chap => fic.normalizeLink(chap.link) === normalizedLink || chap.fetchFrom === normalizedLink)
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
  }
  importFromJSON (raw) {
    if (raw.fics && !raw.chapters) return
    if (!raw.chapters) {
      throw new Error('Fic "' + raw.title + '" is missing any chapters.')
    }
    raw.chapters.forEach(chapter => this.push(Chapter.fromJSON(this.length, chapter)))
  }
}

class Chapter {
  constructor (opts) {
    this.order = opts.order
    this.name = opts.name
    this.link = opts.link
    this.description = opts.description
    this.fetchFrom = opts.fetchFrom
    this.created = opts.created
    this.modified = opts.modified
    this.author = opts.author
    this.authorUrl = opts.authorUrl
    this.tags = opts.tags
    this.externals = opts.externals != null ? opts.externals : true
    this.headings = opts.headings
    this.words = opts.words
  }
  toJSON () {
    return {
      name: this.name,
      description: this.description,
      link: this.link,
      fetchFrom: this.fetchFrom,
      author: this.author,
      authorUrl: this.authorUrl,
      created: this.created === 'Invalid Date' ? null : this.created,
      modified: this.modified === 'Invalid Date' ? null : this.modified,
      tags: this.tags,
      externals: this.externals !== true ? this.externals : null,
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
module.exports.Chapter = Chapter

// defer 'cause `class` definitions don't hoist
Site = use('site')
