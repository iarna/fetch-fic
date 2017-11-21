'use strict'
const url = require('url')
const Site = use('site')
const moment = require('moment')

// This exists to support pulling in singular posts relating to Worm as
// context in large works of fanfiction.

// The author of Worm would prefer that there not be complete epubs of Worm
// floating around on the internet as it would interfere with later
// publication.

// As such, this does not and will not provide any support for building an
// index of all of the chapters.

class Worm extends Site {
  static matches (siteUrlStr) {
    const siteUrl = url.parse(siteUrlStr)
    const hostname = siteUrl.hostname
    return hostname === 'parahumans.wordpress.com' && /^[/]\d{4,4}[/]\d\d[/]\d\d[/]/.test(siteUrl.pathname)
  }

  constructor (siteUrlStr) {
    super(siteUrlStr)
    this.publisher = 'parahumans.wordpress.com'
    this.publisherName = 'wildbow'
  }

  normalizeLink (link) {
    return link.replace(/[?#].*/, '')
  }

  async getFicMetadata (fetch, fic) {
    fic.link = this.link
    fic.publisher = this.publisherName
    fic.author = 'John McCrae'
    fic.authorUrl = 'https://wildbow.wordpress.com'

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
    const firstChapter = chapterUrl.path === '/2011/06/11/1-1/'
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
          return '<p><a external="false" href="' + link + '"><em>Worm</em>, ' + chapter.name + ' (comment ' + comment + ')</a></p>' + $comment.html()
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
          return vv.trim() ? '<p><a external="false" href="' + chapterInfo.link + '"><em>Worm</em>, ' + chapter.name + ' (para. ' + (++para) + ')</a></p>' : ''
        })
      }
      chapter.$content = $content
    }
    return chapter
  }
}

module.exports = Worm
