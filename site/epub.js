'use strict'
const Site = use('site')
const path = require('path')
const qr = require('@perl/qr')
const epubReader = require('epub-reader')
const tagmap = use('tagmap')('epub')
const url = require('url')

class EPub extends Site {
  static matches (siteUrlStr) {
    return qr`^epub:|epub$`.test(siteUrlStr)
  }

  constructor (siteUrlStr) {
    super(siteUrlStr)
    this.publisher = 'epub'
    this.publisherName = 'EPub'
    this.shortName = 'epub'
    this.type = 'epub'
    this.name = path.basename(siteUrlStr, '.epub')
  }

  async getFicMetadata (fetch, fic) {
    let epub
    if (/^https?:/.test(fic.link)) {
      const [meta, data] = await fetch(fic.link)
      epub = await epubReader(data)
    } else {
      epub = await epubReader(fic.link)
    }
    fic.updateFrom = fic.link
    let bestId
    epub.identifier.forEach(id => {
      if (/^https?:/.test(id)) {
        bestId = 'url:' + id
      } else if (/^url:/.test(id)) {
        bestId = id
      } else if (!bestId) {
        bestId = id
      }
    })
    fic.id = bestId
    fic.title = epub.title
    if (epub.source) fic.link = epub.source
    fic.publisher = epub.publisher
    fic.description = epub.description
    fic.created = epub.date
    fic.modified = epub.updated || epub.modified
    fic.words = epub.words
    epub.creator.forEach(_ => fic.authors.push({name: _}))
    fic.authorUrl = epub.authorurl
    fic.tags = epub.tags
    if (epub.status) fic.tags.push(`status:${epub.status}`)
    if (epub.fandom) fic.tags.push(`fandom:${epub.fandom}`)
    fic.tags = tagmap(fic.tags)
    fic.externals = false
    epub.toc.forEach(ch => {
      fic.addChapter({name: ch.name, link: 'epub:' + fic.updateFrom + '#' + unescape(ch.file)})
    })
  }

  async getChapter (fetch, chapterInfo) {
    const parsed = url.parse(chapterInfo.link)
    const epubPath = unescape(parsed.pathname)
    const file = unescape(parsed.hash.slice(1))
    let epub
    if (/^epub:https?:/.test(chapterInfo.link)) {
      const [meta, data] = await fetch(chapterInfo.link.replace(/^epub:/, ''))
      epub = await epubReader(data)
    } else {
      epub = await epubReader(epubPath)
    }
    const [ch] = epub.toc.filter(ch => unescape(ch.file) === file)
    const html = await ch.get()
    const ChapterContent = use('chapter-content')
    const chapter = new ChapterContent(chapterInfo, {site: this, html})
    chapter.$content = chapter.$('body')
    return chapter
  }
}
module.exports = EPub
