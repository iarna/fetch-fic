'use strict'
const url = require('url')
const Site = use('site')
const moment = require('moment')
const tagmap = use('tagmap')('fictionpress')
const qr = require('@perl/qr')
const wordsFromDesc = use('words-from-desc')

class FictionPress extends Site {
  static matches (siteUrlStr) {
    const siteUrl = url.parse(siteUrlStr)
    const hostname = siteUrl.hostname
    if (!qr`(^|www[.])fictionpress.com`.test(hostname)) return false
    const path = siteUrl.pathname || siteUrl.path || ''
    if (!qr`^/u/\d+|^/s/\d+`.test(path)) return false
    return true
  }

  constructor (siteUrlStr) {
    super(siteUrlStr)
    this.publisher = 'www.fictionpress.com'
    this.publisherName = 'FictionPress.com'
    this.type = 'ffnet'
    this.shortName = 'ffnet'
    const siteUrl = url.parse(siteUrlStr)
    const path = siteUrl.pathname || siteUrl.path || ''
    const ficMatch = path.match(qr`^/s/(\d+)(?:/\d+(?:/(.*))?)?`)
    this.ficId = ficMatch && ficMatch[1]
    this.name = ficMatch && ficMatch[2]
  }

  normalizeFicLink (href, base) {
    return super.normalizeFicLink(href, base)
      .replace(/([/]s[/]\d+)[/]1([/].*|$)/, '$1')
  }
  normalizeChapterLink (href, base) {
    return super.normalizeChapterLink(href, base)
      .replace(/([/]s[/]\d+[/]\d+)[/].*$/, '$1')
  }

  chapterUrl (num) {
    return `https://www.fictionpress.com/s/${this.ficId}/${num}` + (this.name ? `/${this.name}` : '')
  }

  chapterListUrl () {
    return this.chapterUrl(1)
  }

  async getFicMetadata (fetch, fic) {
    fic.link = this.link
    fic.publisher = this.publisherName
    const Chapter = use('fic').Chapter
    const chapter = await Chapter.getContent(fetch, this.chapterListUrl())
    if (/Story Not Found/.test(chapter.$('.gui_warning').text())) {
      var err = new Error(`Story Not Found: ${fic.link}`)
      err.code = 404
      err.url = fic.link
      throw err
    }
    const $meta = chapter.$('#profile_top')
    const $dates = $meta.find('span[data-xutime]')
    fic.title = $meta.find('b.xcontrast_txt').text()
    fic.link = this.normalizeFicLink(chapter.link)
    const author = await this.getUserInfo(fetch, chapter.author, chapter.authorUrl)
    fic.author = author.name || chapter.author
    fic.authorUrl = author.link || chapter.authorUrl
    fic.created = moment.unix(chapter.$($dates[1]).attr('data-xutime'))
    fic.modified = moment.unix(chapter.$($dates[0]).attr('data-xutime'))
    fic.publisher = this.publisherName
    fic.description = $meta.find('div.xcontrast_txt').text()
    const img_src = chapter.$('#img_large img').attr('data-original')
    const img = img_src ? url.resolve(chapter.base, img_src).replace(qr`/150/`, '/180/') : undefined
    if (img && img !== author.image) fic.cover = img

    const infoline = $meta.find('span.xgray').text()
    const info = ffp(infoline)
    if (info) {
      fic.language = info.language
      fic.tags = info.genre.map(g => 'genre:' + g)
        .concat(['rating:' + info.rating])
        .concat(info.characters.filter(c => c).map(c => 'character:' + c.replace(qr.g`/`, '／')))
        .concat(info.pairing.map(p => 'ship:' + p.map(_=>_.replace(qr.g`/`, '／')).join('/')))
      for (let p of info.pairing) {
        for (let c of p) if (c) fic.tags.push('character:' + c.replace(qr.g`/`, '／'))
      }
      fic.words = info.words
      fic.comments = fic.reviews = info.reviews
      fic.kudos = fic.favs = info.favs
      fic.bookmarks = fic.follows = info.follows
      // updated
      // published
      // id
    } else {
      process.emit('error', 'NOMATCH:', infoline)
    }

    const $index = chapter.$(chapter.$('#chap_select')[0])
    const $chapters = $index.find('option')
    if (info && info.chapters !== $chapters.length) {
      throw new Error(`Failed to find all the chapters, expected ${info.chapters}, got ${$chapters.length}`)
    }
    if (info && info.status === 'Complete') {
      if ($chapters.length <= 1) {
        fic.tags.push('status:one-shot')
      } else {
        fic.tags.push('status:complete')
      }
    }
    if ($chapters.length) {
      $chapters.each((ii, vv) => {
        const chapterName = chapter.$(vv).text().match(/^\d+[.](?: (.*))?$/)
        const chapterNum = chapter.$(vv).attr('value') || ii
        fic.addChapter({name: chapterName[1] || (String(chapterNum) + '.'), link: this.chapterUrl(chapterNum)})
      })
    } else {
      fic.addChapter({name: 'Chapter 1', link: this.chapterUrl(1)})
    }
    const first = fic.chapters[0]
    const last = fic.chapters[fic.chapters.length - 1]
    if (!first.created) first.created = fic.created || (info && (info.published || info.updated)) || fic.modified
    if (!last.modified) last.modified = fic.modified || (info && (info.updated || info.published)) || fic.created

    let titleAndDesc = fic.title
    // words that imply that something is being negated make the desc unsafe
    // to troll for keywords
    if (!/\b(no|exclud\S+|none)\b/i.test(fic.description)) {
      titleAndDesc += '\n' + fic.description
    }
    const words = wordsFromDesc(titleAndDesc).map(_ => `freeform:${_}`)
    fic.rawTags = fic.tags
    fic.tags = tagmap(fic.rawTags)
  }

  async getChapter (fetch, chapterInfo) {
    const [meta, html] = await fetch(chapterInfo.fetchWith())
    const ChapterContent = use('chapter-content')
    const chapter = new ChapterContent(chapterInfo, {html, site: this})
    chapter.$content = chapter.$('#storytextp')
    chapter.base = chapter.$('base').attr('href') || meta.finalUrl
    const links = chapter.$('a.xcontrast_txt')
    links.each(function (ii, vv) {
      const href = chapter.$(vv).attr('href')
      if (qr`^/u/\d+/`.test(href)) {
        chapter.author = chapter.$(vv).text()
        chapter.authorUrl = url.resolve(chapter.base, href)
      }
    })
    return chapter
  }
  async getUserInfo (fetch, name, link) {
    link = this.normalizeAuthorLink(link)
    const [res, auhtml] = await fetch(link)
    const cheerio = require('cheerio')
    const $ = cheerio.load(auhtml)
    const $bio = $('#bio')
    $bio.find('div').remove()
    const image_src = $bio.find('img').first().attr('data-original')
    const image = image_src ? url.resolve(link, image_src).replace(qr`/150/`, '/180/') : undefined
    $bio.find('img').remove()
    const profile = $bio.html() || undefined
    return {name, link, image, profile}
  }
}

module.exports = FictionPress

function ffp (status) {
  let matched = status.match(qr`^Rated:\s+Fiction\s+(\S+)\s+-\s+([^-]+)(?:\s+-\s+((?:General|Romance|Humor|Drama|Poetry|Adventure|Mystery|Horror|Parody|Angst|Supernatural|Suspense|Sci-Fi|Fantasy|Spiritual|Tragedy|Western|Crime|Family|Hurt/Comfort|Friendship|/)+))?(?:\s+-\s+(.+?))?\s+-\s+Chapters:\s+(\d+)\s+-\s+Words:\s+([\d,]+)(?:\s+-\s+Reviews:\s+([\d,]+))?(?:\s+-\s+Favs: ([\d,]+))?(?:\s+-\s+Follows:\s+([\d,]+))?(?:\s+-\s+Updated:\s+([^-]+))?\s+-\s+Published:\s+([^-]+)(?:\s+-\s+Status:\s+([^-]+))?\s+-\s+id:\s+(\d+)\s*$`)
  if (!matched) matched = status.match(qr`^Rated:\s+Fiction\s+(\S+)\s+-\s+([^-]+)(?:\s+-\s+((?:General|Romance|Humor|Drama|Poetry|Adventure|Mystery|Horror|Parody|Angst|Supernatural|Suspense|Sci-Fi|Fantasy|Spiritual|Tragedy|Western|Crime|Family|Hurt/Comfort|Friendship|/)+))?(?:\s+-\s+(.+?))?(?:\s+-\s+Chapters:\s+(\d+))?\s+-\s+Words:\s+([\d,]+)(?:\s+-\s+Reviews:\s+([\d,]+))?(?:\s+-\s+Favs: ([\d,]+))?(?:\s+-\s+Follows:\s+([\d,]+))?(?:\s+-\s+Updated:\s+([^-]+))?\s+-\s+Published:\s+([^-]+)(?:\s+-\s+Status:\s+([^-]+))?\s+-\s+id:\s+(\d+)\s*$`)
  if (!matched) throw new Error('Unparseable: ' + status)
  let cp = matched[4] || ''
  let characters = []
  let pairing = []
  if (/\[.+\]/.test(cp)) {
    pairing = cp.match(/\[(.+?)\]/g).map(p => p.slice(1,-1).split(/, /))
    cp = cp.replace(/\[(.*?)\]/g, '')
  }
  if (cp.length) {
    characters = cp.split(/, /).filter(c => c !== '').map(c => c.trim())
  }
  return {
    rating: matched[1],
    language: matched[2],
    genre: matched[3] ? matched[3].replace(qr`Hurt/Comfort`, 'HC').split(qr`/`).map(g => g === 'HC' ? 'Hurt/Comfort' : g) : [],
    characters: characters || [],
    pairing: pairing || [],
    chapters: num(matched[5] || 0),
    words: num(matched[6]),
    reviews: num(matched[7]),
    favs: num(matched[8]),
    follows: num(matched[9]),
    updated: date(matched[10]),
    published: date(matched[11]),
    status: matched[12],
    id: matched[13]
  }
}

function num (n) {
  return Number(String(n).replace(/,/g, ''))
}
function date (d) {
  if (d==null) return d
  let m
  if (qr`^(\w+ \d+(, \d+)?|\d+/\d+)$`.test(d)) {
    return moment.utc(d, ['MMM DD, YYYY', 'MMM DD', 'M/D'])
  } else if (m = d.match(/(\d+)h/)) {
    return moment().utc().subtract(2 + Number(m[1]), 'hour')
  } else {
    return null
  }
}
