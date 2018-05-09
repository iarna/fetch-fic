'use strict'
const url = require('url')
const Site = use('site')
// This exists to support pulling in singular posts relating to Worm2 (Ward) as
// context in large works of fanfiction.

// The author of Worm would prefer that there not be complete epubs of Worm
// floating around on the internet as it would interfere with later
// publication.

// As such, this does not and will not provide any support for building an
// index of all of the chapters.

class Worm2 extends Site {
  static matches (siteUrlStr) {
    const siteUrl = url.parse(siteUrlStr)
    const hostname = siteUrl.hostname
    return hostname === 'www.parahumans.net' && /^[/]\d{4,4}[/]\d\d[/]\d\d[/]/.test(siteUrl.pathname)
  }

  constructor (siteUrlStr) {
    super(siteUrlStr)
    this.publisher = 'www.parahumans.net'
    this.publisherName = 'wildbow'
    this.type = 'worm'
  }

  normalizeLink (link) {
    return link.replace(/[?#].*/, '').replace(/([^/])$/, '$1/').replace(/^http:/, 'https:')
  }

  async getFicMetadata (fetch, fic) {
    fic.link = this.link
    fic.publisher = this.publisherName
    fic.author = 'John McCrae'
    fic.authorUrl = 'https://www.parahumans.net'

    const Chapter = use('fic').Chapter
    const chap = await Chapter.getContent(fetch, fic.link)
    fic.title = chap.name
    fic.link = chap.fetchFrom || chap.link
    fic.modified = chap.modified
    fic.updated = chap.updated
    fic.addChapter(chap)
  }

  async getChapter (fetch, chapterInfo) {
    const chapterUrl = url.parse(chapterInfo.fetchWith())
    const firstChapter = chapterUrl.path === '/2017/11/11/daybreak-1-1/'
    const annotate = chapterUrl.hash === '#annotate'
    const useComments = chapterUrl.hash === '#comments'
    const [meta, html] = await fetch(chapterInfo.fetchWith())
    const ChapterContent = use('chapter-content')
    const chapter = new ChapterContent(chapterInfo, {site: this, html})
    chapter.base = chapter.$('base').attr('href') || meta.finalUrl
    if (meta.finalUrl !== chapter.link) {
      chapter.fetchFrom = chapter.link
      chapter.link = meta.finalUrl
    }
    chapter.name = chapter.$('h1.entry-title').text().trim()
    const moment = require('moment')
    chapter.created = moment(chapter.$('meta[property="article:published_time"]').attr('content') || chapter.$('time.entry-date').attr('datetime'))
    chapter.modified = moment(chapter.$('meta[property="article:modified_time"]').attr('content'))

    if (useComments) {
      const $comments = chapter.$('#comments')
      $comments.find('article.comment').replaceWith((ii, vv) => {
        const cheerio = require('cheerio')
        const $comment = cheerio.load(vv)
        const $vcard = $comment('.vcard')
        const $links = $vcard.find('a')
        const $lastLink = chapter.$($links[$links.length - 1])
        const link = $lastLink.attr('href')
        const linkMatched = link.match(/#comment-(\d+)/)
        if (linkMatched) {
          const comment = linkMatched[1]
          $lastLink.replaceWith($lastLink.text())
          return '<p><a external="false" href="' + link + '"><em>Ward</em>, ' + chapter.name + ' (comment ' + comment + ')</a></p>' + $comment.html()
        } else {
          process.emit('error', $vcard.html())
        }
      })
      $comments.find('div.reply').remove()
      $comments.find('#respond').remove()
      chapter.$content = $comments
    } else {
      const $content = chapter.$('div.entry-content')
      $content.find('a:contains("Last Chapter")').parent().remove()
      $content.find('a:contains("Next Chapter")').parent().remove()
      $content.find('p:contains("Previous Chapter")').remove()
      $content.find('p:contains("Next Chapter")').remove()
      $content.find('.sharedaddy').remove()
      // strip off the content warnings
      let found = false
      if (/\s[10][.]1$/.test(chapter.$('.entry-title').text())) {
        $content.find('p').each((ii, pp) => {
          if (found) return
          const $pp = chapter.$(pp)
          if ($pp.text() === '⊙') {
            found = true
          }
          $pp.remove()
        })
      }
      $content.find('#jp-post-flair').remove()
      if (firstChapter) {
        const paras = $content.find('p')
        chapter.$(paras[0]).remove()
        chapter.$(paras[1]).remove()
      }
      if (annotate) {
        let para = 0
        $content.find('p').before((ii, vv) => {
          vv = vv.replace(/&#xA0;/g, ' ')
          return vv.trim() ? '<p><a external="false" href="' + chapterInfo.link + '"><em>Ward</em>, ' + chapter.name + ' (para. ' + (++para) + ')</a></p>' : ''
        })
      }
      chapter.$content = $content
    }
    return chapter
  }
}

module.exports = Worm2
