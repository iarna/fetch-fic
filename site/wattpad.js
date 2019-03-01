'use strict'
const url = require('url')
const Site = use('site')
const moment = require('moment')
const tagmap = use('tagmap')('wattpad')
const wordmap = use('tagmap')('words')
const qr = require('@perl/qr')
const wordsFromDesc = use('words-from-desc')

class WattPad extends Site {
  static matches (siteUrlStr) {
    const siteUrl = url.parse(siteUrlStr)
    const hostname = siteUrl.hostname
//    https://www.wattpad.com/story/115993614-creator%27s-demons
    if (hostname !== 'www.wattpad.com') return false
//   const path = siteUrl.pathname || siteUrl.path || ''
//    if (!qr`^/works/\d+|^/users/`.test(path)) return false
    return true
  }
  constructor (siteUrlStr) {
    super(siteUrlStr)
    this.publisher = 'wattpad.com'
    this.publisherName = 'wattpad'
    this.shortName = 'wattpad'
    this.type = 'wattpad'
  }
  normalizeLink (href, base) {
    if (!href) return
    return super.normalizeLink(href, base)
      .replace(qr`/story/(\d+)-.*$`, '/story/$1')
  }
  async getFicMetadata (fetch, fic) {
    fic.link = this.link
    fic.publisher = this.publisherName
    fic.chapterHeadings = true
    const [, id] = fic.link.match(qr`/(\d+)`)
    const apiUrl = `https://www.wattpad.com/api/v3/stories/${id}?include_deleted=false&fields=id%2Ctitle%2CvoteCount%2CreadCount%2CcommentCount%2Cdescription%2Curl%2CfirstPublishedPart%2Ccover%2Clanguage%2CisAdExempt%2Cuser(name%2Cusername%2Cavatar%2Cdescription%2Clocation%2Chighlight_colour%2CbackgroundUrl%2CnumLists%2CnumStoriesPublished%2CnumFollowing%2CnumFollowers%2Ctwitter)%2Ccompleted%2CnumParts%2ClastPublishedPart%2Cparts(id%2Ctitle%2Clength%2Curl%2Cdeleted%2Cdraft)%2Ctags%2Ccategories%2Crating%2Crankings%2CtagRankings%2Clanguage%2Ccopyright%2CsourceLink%2CfirstPartId%2Cdeleted%2Cdraft`
    let tags = []
    try {
      const [meta, result] = await fetch(apiUrl)
      const data = JSON.parse(result)
      const base = data.url
      fic.title = data.title.trim()
      fic.cover = data.cover
      fic.author = data.user.name
      fic.authorUrl = `https://www.wattpad.com/user/${data.user.username}`
      if (data.firstPublishedPart) fic.created = moment.utc(data.firstPublishedPart.createDate)
      if (data.lastPublishedPart) fic.modified = moment.utc(data.lastPublishedPart.createDate)
      fic.hits = data.readCount
      fic.kudos = data.voteCount
      fic.comments = data.commentCount
      fic.description = data.description.replace(/\n/g, '<br>\n')
      data.parts.forEach(part => {
        fic.addChapter({name: part.title.trim(), link: part.url})
      })
      tags = data.tags.map(_ => `freeform:${_}`)
      if (data.completed) {
        if (fic.chapters.length === 1) {
          tags.push('status:one-shot')
        } else {
          tags.push('status:complete')
        }
      }
      fic.rawTags = tags.slice()
    } catch (ex) {
      process.emit('error', ex.message)
      const [meta, html] = await fetch(this.link.replace(qr`(/story/[^/]+)/?$`, '$1/parts'))
      const cheerio = require('cheerio')
      const $ = cheerio.load(html)
      const base = $('base').attr('href') || this.link
      const $content = $('#app-container')
      fic.title = $content.find('h1').first().text().trim()
      fic.cover = this.normalizeLink($content.find('div.cover img').attr('src'), base)
      const $ainfo = $content.find('div.author-info')
      const $author = $ainfo.find('a.avatar').first()
      fic.author = $author.find('img').attr('alt')
      fic.authorUrl = this.normalizeLink($author.attr('href'), base)
      const createdRaw = $ainfo.find('small').attr('title')
      if (createdRaw) fic.created = moment.utc(createdRaw.replace(/First published: /, ''), 'MMM DD, YYYY')
      const infoRaw = $ainfo.text().trim()
      if (infoRaw) {
        const matched = infoRaw.match(/Updated (\w+ \d+, \d+)/)
        if (matched) fic.modified = moment.utc(matched[1], 'MMM DD, YYYY')
      }
      const $meta = $content.find('header div.container div.meta')
      const $reads = $meta.find('span').first()
      const $votes = $meta.next()
      fic.hits = Number(($reads.attr('data-original-title')||'').replace(/ Reads/, ''))
      fic.kudos = Number(($votes.attr('data-original-title')||'').replace(/ Votes/, ''))
      fic.description = fixHTML($content.find('h2.description').html()).replace(/\n/g, '<br>\n')
      const $toc = $content.find('ul.table-of-contents')
      $toc.find('a').each((ii, a) => {
        const $a = $(a)
        const link = this.normalizeLink($a.attr('href'), base)
        const name = $a.text().trim()
        fic.addChapter({name, link})
      })
      const $tags = $content.find('ul.tag-items')
      $tags.find('div').each((ii, div) => {
        const $div = $(div)
        tags.push('freeform:' + $div.text().trim())
      })
      const statusRaw = $ainfo.find('span').text().replace(/ - /, '')
      if (statusRaw === 'Ongoing') {
        // in progress
      } else if (statusRaw === 'Completed') {
        if (fic.chapters.length === 1) {
          tags.push('status:one-shot')
        } else {
          tags.push('status:complete')
        }
      }
    }
    let titleAndDesc = fic.title
    // words that imply that something is being negated make the desc unsafe
    // to troll for keywords
    if (!/\b(no|exclud\S+|none)\b/i.test(fic.notes)) {
      titleAndDesc += '\n' + fic.notes
    }
    const words = wordsFromDesc(titleAndDesc).map(_ => `freeform:${_}`)
    fic.rawTags = tags.concat(wordmap(words).changed())
    fic.tags = tagmap(fic.rawTags)
  }
  async getChapter (fetch, chapterInfo) {
    const [meta, html] = await fetch(chapterInfo.fetchWith())
    const ChapterContent = use('chapter-content')
    const chapter = new ChapterContent(chapterInfo, {html, site: this})
    chapter.base = chapter.$('base').attr('href') || meta.finalUrl
    if (meta.finalUrl !== chapter.link) {
      chapter.fetchFrom = chapter.link
      chapter.link = meta.finalUrl
    }
    const $content = chapter.$('div.panel-reading')
    chapter.content = fixHTML($content.html())
    return chapter
  }
  async getUserInfo (fetch, externalName, link) {
    const cheerio = require('cheerio')
    const authCookies = require(`${__dirname}/../.authors_cookies.json`)
    const [res, auhtml] = await fetch(link)
    const $ = cheerio.load(auhtml)
    const profile = fixHTML($('section.profile-about div.description').html()).replace(/\n/g, '<br>\n')
    const name = $('h1.profile-name').text().trim() || externalName.trim()
    const image = $('div.avatar img').attr('src')
    return {name, link, profile, image}
  }

}

function fixHTML (html) {
  return (html||'').replace(qr.g`</?pre>`, '')
}

module.exports = WattPad
