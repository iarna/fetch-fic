'use strict'
const url = require('url')
const moment = require('moment')

const Site = use('site')

class GenericHTML extends Site {
  static matches (siteUrlStr) {
    return /[.](?:html)$/.test(siteUrlStr)
  }

  constructor (siteUrlStr) {
    super(siteUrlStr)
    this.publisher = url.parse(siteUrlStr).hostname
    this.publisherName = this.publisher
  }

  normalizeLink (href, base) {
    if (base) href = url.resolve(base, href)
    return href
  }

  async getFicMetadata (fetch, fic) {
    fic.title = this.link
    fic.link = this.link
    fic.publisher = this.publisher
    fic.link = this.normalizeLink(this.link)
    const Chapter = use('fic').Chapter
    const chapter = await Chapter.getContent(fetch, this.link)
    chapter.name = this.link
    fic.modified = chapter.modified
    fic.addChapter(chapter)
  }

  async getChapter (fetch, chapterInfo) {
    const [meta, html] = await fetch(chapterInfo.fetchWith())
    const ChapterContent = use('chapter-content')
    const modified = meta.headers['last-modified'] ? moment(meta.headers['last-modified'][0]) : undefined
    return new ChapterContent(chapterInfo, {
      site: this,
      base: chapterInfo.link,
      content: html,
      modified: modified
    })
  }
}
module.exports = GenericHTML
