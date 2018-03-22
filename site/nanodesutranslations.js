'use strict'
const Site = use('site')
const qr = require('@perl/qr')

class NanoDesu extends Site {
  static matches (siteUrlStr) {
    return qr`nanodesutranslations[.]org/qualia`.test(siteUrlStr)
  }

  constructor (siteUrlStr) {
    super(siteUrlStr)
    this.publisher = 'nanodesutranslations.org'
    this.publisherName = 'NanoDesu Translations Project'
  }

  async getFicMetadata (fetch, fic) {
    fic.link = this.link
    fic.publisher = this.publisherName
    fic.title = 'Qualia the Purple'
    fic.link = this.normalizeLink(this.link)
    fic.author = 'Hisamitsu Ueo'
    fic.publisher = this.publisherName

    const [meta, html] = await fetch(fic.link)
    const cheerio = require('cheerio')
    const $ = cheerio.load(html)
    const base = $('base').attr('href') || fic.link
    const chaps = $('a:contains("Volume 1") < li ul li')
    let arc = ''
    chaps.each((ii, ch) => {
      const $ch = $(ch)
      const link = $ch.find('a')
      if (link.length === 1) {
        fic.addChapter({
          name: (arc ? `${arc}: ` : '') + link.text().trim(),
          link: this.normalizeLink(link.attr('href'), base)
        })
      } else {
        arc = $(link[0]).text()
      }
    })
  }

  async getChapter (fetch, chapterInfo) {
    const [meta, html] = await fetch(chapterInfo.fetchWith())
    const ChapterContent = use('chapter-content')
    const chapter = new ChapterContent(chapterInfo, {site: this, html})
    chapter.base = chapter.$('base').attr('href') || meta.finalUrl
    const $heading = chapter.$('.panel-heading h4')
    $heading.find('a').remove()
    chapter.name = $heading.text()
    const link = meta.finalUrl
    if (link !== chapter.link) {
      chapter.fetchFrom = chapter.link
      chapter.link = link
    }
    chapter.author = 'Hisamitsu Ueo'
    chapter.$content = chapter.$('.panel-body')
    chapter.$content.find('p:contains("Next Page")').remove()
    chapter.$content.find('p:contains("Previous Page")').remove()
    chapter.$content.find('p:contains("Qualia the Purple")').remove()
    return chapter
  }
}
module.exports = NanoDesu
