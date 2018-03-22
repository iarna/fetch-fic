'use strict'
const Site = use('site')
const qr = require('@perl/qr')

class Youtube extends Site {
  static matches (siteUrlStr) {
    return qr`youtube[.]com/watch[?]v=|youtu.be`.test(siteUrlStr)
  }

  constructor (siteUrlStr) {
    super(siteUrlStr)
    this.publisher = 'youtube.com'
    this.publisherName = 'You Tube'
    const matches = siteUrlStr.match(qr`/watch[?]v=(.*)$`) || siteUrlStr.match(qr`youtu.be/(.*)`)
    this.id = matches[1]
  }

  async getFicMetadata (fetch, fic) {
    fic.link = this.link
    fic.publisher = this.publisherName
    // currently we only support /art/ urls, which can only have one thing on them
    const Chapter = use('fic').Chapter
    const chapter = await Chapter.getContent(fetch, this.link)
    fic.title = chapter.name
    fic.link = this.normalizeLink(chapter.link)
    fic.author = chapter.author
    fic.authorUrl = chapter.authorUrl
    fic.publisher = this.publisherName
    fic.description = chapter.description
    fic.addChapter(chapter)
  }

  async getChapter (fetch, chapterInfo) {
    const [meta, html] = await fetch(chapterInfo.fetchWith())
    const ChapterContent = use('chapter-content')
    const chapter = new ChapterContent(chapterInfo, {site: this, html})
    chapter.base = chapter.$('base').attr('href') || meta.finalUrl
    const title = (chapter.$('meta[property="og:title"]').attr('content') || '').replace(/- YouTube$/, '')
    if (!title) throw new Error('Skipping due to missing video or shutdown account.')
    chapter.name = `Watch ${title} on Youtube`
    chapter.description = chapter.$('meta[property="og:description"]').attr('content')
    let width = chapter.$('meta[property="og:video:width"]').attr('content')
    let height = chapter.$('meta[property="og:video:height"]').attr('content')
    let link = chapter.$('meta[property="og:url"]').attr('content')
    let image = chapter.$('link[itemprop="thumbnailUrl"]').attr('href')
    let $author = chapter.$('div.yt-user-info')
    chapter.author = $author.find('a').text()
    const url = require('url')
    chapter.authorUrl = url.resolve(chapter.base, $author.find('a').attr('href'))
    chapter.headings = true
    chapter.content = `<p><a external="false" href="${chapter.fetchWith()}">` +
      `<img width="${width}" height="${height}" src="${image}" alt="${title} by ${chapter.author}">`+
      `</a></p><p>${chapter.description}</p>`
    return chapter
  }
}
module.exports = Youtube
