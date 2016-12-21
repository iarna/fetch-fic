'use strict'
const url = require('url')
const Site = require('./site.js')
const cheerio = require('cheerio')
const Bluebird = require('bluebird')

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

  getFicMetadata (fetch, fic) {
    fic.link = this.link
    fic.publisher = this.publisherName
    fic.author = 'John McCrae'
    fic.authorUrl = 'https://wildbow.wordpress.com'

    return this.getChapter(fetch, this.link).then(info => {
      fic.created = info.created
      fic.modified = info.modified
      fic.title = info.name
      fic.addChapter({name: info.name, link: info.finalUrl, created: info.created})
    })
  }

  scrapeFicMetadata (fetch, fic) {
    // There's never any reason to scrape AO3 content, AFAIK.
    return Bluebird.resolve()
  }

  getChapter (fetch, chapter) {
    const chapterUrl = url.parse(chapter)
    const firstChapter = chapterUrl.path === '/2011/06/11/1-1/'
    const annotate = chapterUrl.hash === '#annotate'
    const useComments = chapterUrl.hash === '#comments'
    return fetch(chapter).spread((meta, html) => {
      const $ = cheerio.load(html)
      const base = $('base').attr('href') || meta.finalUrl
      const name = $('h1.entry-title').text().trim()
      const created = new Date($('meta[property="article:published_time"]').attr('content') || $('time.entry-date').attr('datetime'))
      const modified = new Date($('meta[property="article:modified_time"]').attr('content'))

      let content
      if (useComments) {
        const $comments = $('#comments')
        $comments.find('article.comment').replaceWith((ii, vv) => {
          const $comment = cheerio.load(vv)
          const $vcard = $comment('.vcard')
          const $links = $vcard.find('a')
          const $lastLink = $($links[$links.length - 1])
          const link = $lastLink.attr('href')
          const linkMatched = link.match(/#comment-(\d+)/)
          if (linkMatched) {
            const comment = linkMatched[1]
            $lastLink.replaceWith($lastLink.text())
            return '<p><a external="false" href="' + link + '"><em>Worm</em>, ' + name + ' (comment ' + comment + ')</a></p>' + $comment.html()
          } else {
            console.error($vcard.html())
          }
        })
        $comments.find('div.reply').remove()
        $comments.find('#respond').remove()
        content = $comments.html().trim()
      } else {
        const $content = $('div.entry-content')
        $content.find('a:contains("Last Chapter")').parent().remove()
        $content.find('a:contains("Next Chapter")').parent().remove()
        $content.find('#jp-post-flair').remove()
        if (firstChapter) {
          const paras = $content.find('p')
          $(paras[0]).remove()
          $(paras[1]).remove()
        }
        if (annotate) {
          let para = 0
          $content.find('p').before((ii, vv) => {
            vv = vv.replace(/&#xA0;/g, ' ')
            return vv.trim() ? '<p><a external="false" href="' + chapter + '"><em>Worm</em>, ' + name + ' (para. ' + (++para) + ')</a></p>' : ''
          })
        }
        content = $content.html().trim()
      }
      return {
        name: name,
        chapterLink: chapter,
        finalUrl: meta.finalUrl,
        base: base,
        raw: html,
        content: content,
        created: created === 'Invalid Date' ? null : created,
        modified: modified === 'Invalid Date' ? null : modified
      }
    })
  }
}

module.exports = Worm
