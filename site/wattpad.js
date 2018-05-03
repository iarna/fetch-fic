'use strict'
const url = require('url')
const Site = use('site')
const moment = require('moment')
const tagmap = use('tagmap')('wattpad')
const qr = require('@perl/qr')

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
  async getFicMetadata (fetch, fic) {
    fic.link = this.link
    fic.publisher = this.publisherName
    fic.chapterHeadings = true
    const [, id] = fic.link.match(qr`/(\d+)`)
    const apiUrl = `https://www.wattpad.com/api/v3/stories/${id}?include_deleted=false&fields=id%2Ctitle%2CvoteCount%2CreadCount%2CcommentCount%2Cdescription%2Curl%2CfirstPublishedPart%2Ccover%2Clanguage%2CisAdExempt%2Cuser(name%2Cusername%2Cavatar%2Cdescription%2Clocation%2Chighlight_colour%2CbackgroundUrl%2CnumLists%2CnumStoriesPublished%2CnumFollowing%2CnumFollowers%2Ctwitter)%2Ccompleted%2CnumParts%2ClastPublishedPart%2Cparts(id%2Ctitle%2Clength%2Curl%2Cdeleted%2Cdraft)%2Ctags%2Ccategories%2Crating%2Crankings%2CtagRankings%2Clanguage%2Ccopyright%2CsourceLink%2CfirstPartId%2Cdeleted%2Cdraft`
    const [meta, result] = await fetch(apiUrl)
    const data = JSON.parse(result)
    const base = data.url
    fic.title = data.title
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
      fic.addChapter({name: part.title, link: part.url})
    })
    const tags = data.tags.map(_ => `freeform:${_}`)
    if (data.completed) {
      if (fic.chapters.length === 1) {
        tags.push('status:one-shot')
      } else {
        tags.push('status:complete')
      }
    }
    fic.tags = tagmap(tags)
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
    const name = $('h1.profile-name').text().trim() || externalName
    const image = $('div.avatar img').attr('src')
    return {name, link, profile, image}
  }

}

function fixHTML (html) {
  return (html||'').replace(qr.g`</?pre>`, '')
}

module.exports = WattPad
