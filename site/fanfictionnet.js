'use strict'
const url = require('url')

const Bluebird = require('bluebird')
const Site = use('site')
const moment = require('moment')

class FanFictionNet extends Site {
  static matches (siteUrlStr) {
    const siteUrl = url.parse(siteUrlStr)
    const hostname = siteUrl.hostname
    if (!/(^|www[.])fanfiction.net$/.test(hostname)) return false
    const path = siteUrl.pathname || siteUrl.path || ''
    if (!/^[/]s[/]\d+(?:[/]\d+)?/.test(path)) return false
    return true
  }

  constructor (siteUrlStr) {
    super(siteUrlStr)
    this.publisher = 'www.fanfiction.net'
    this.publisherName = 'FanFiction.net'
    const siteUrl = url.parse(siteUrlStr)
    const path = siteUrl.pathname || siteUrl.path || ''
    const ficMatch = path.match(/^[/]s[/](\d+)(?:[/]\d+(?:[/](.*))?)?/)
    this.ficId = ficMatch[1]
    this.name = ficMatch[2]
  }

  normalizeLink (href, base) {
    const link = url.parse(super.normalizeLink(href, base))
    link.pathname = link.pathname.replace(/^([/]s[/]\d+[/]\d+)[/].*$/, '$1')
    return url.format(link)
  }

  chapterUrl (num) {
    return 'https://www.fanfiction.net/s/' + this.ficId + '/' + num + (this.name ? '/' + this.name : '')
  }

  chapterListUrl () {
    return this.chapterUrl(1)
  }

  getFicMetadata (fetch, fic) {
    fic.link = this.link
    fic.publisher = this.publisherName
    const Chapter = use('fic').Chapter
    return Chapter.getContent(fetch, this.chapterListUrl()).then(chapter => {
      if (/Story Not Found/.test(chapter.$('.gui_warning').text())) {
        var err = new Error(`Story Not Found: ${fic.link}`)
        err.code = 404
        err.url = fic.link
        return Bluebird.reject(err)
      }
      const $meta = chapter.$('#profile_top')
      const $dates = $meta.find('span[data-xutime]')
      const fandom = chapter.$('#pre_story_links a:last-child').text().trim()
      fic.title = $meta.find('b.xcontrast_txt').text()
      fic.link = this.normalizeLink(chapter.link)
      fic.author = chapter.author
      fic.authorUrl = chapter.authorUrl
      fic.created = moment.unix(chapter.$($dates[1]).attr('data-xutime'))
      fic.modified = moment.unix(chapter.$($dates[0]).attr('data-xutime'))
      fic.publisher = this.publisherName
      fic.description = $meta.find('div.xcontrast_txt').text()
      const img = chapter.$('#img_large img').attr('data-original')
      if (img) {
        fic.cover = url.resolve(chapter.base, img)
      }

      const infoline = $meta.find('span.xgray').text()
      const info = ffp(infoline)
      if (info) {
        fic.language = info.language
        fic.tags = info.genre.map(g => 'genre:' + g)
          .concat(['rated:' + info.rating])
          .concat(info.characters.map(c => 'character:' + c))
          .concat(info.pairing.map(p => 'ship:' + p.join('/')))
        for (let p of info.pairing) {
          for (let c of p) fic.tags.push('character:' + c)
        }
        fic.tags.sort()
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
      if (fandom) {
        if (/ Crossover$/.test(fandom)) {
          const [name, xover] = fandom.replace(/ Crossover$/, '').split(/ [+] /)
          fic.tags.unshift(`fandom:${name}`, `xover:${xover}`)
        } else {
          fic.tags.unshift(`fandom:${fandom}`)
        }
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
    })
  }

  getChapter (fetch, chapterInfo) {
    return fetch(chapterInfo.fetchWith()).spread((meta, html) => {
      const ChapterContent = use('chapter-content')
      const chapter = new ChapterContent(chapterInfo, {html, site: this})
      chapter.$content = chapter.$('#storytextp')
      chapter.base = chapter.$('base').attr('href') || meta.finalUrl
      const links = chapter.$('a.xcontrast_txt')
      links.each(function (ii, vv) {
        const href = chapter.$(vv).attr('href')
        if (/^[/]u[/]\d+[/]/.test(href)) {
          chapter.author = chapter.$(vv).text()
          chapter.authorUrl = url.resolve(chapter.base, href)
        }
      })
      return chapter
    })
  }
}

module.exports = FanFictionNet

function ffp (status) {
  let matched = status.match(/^Rated:\s+Fiction\s+(\S+)\s+-\s+([^-]+)(?:\s+-\s+((?:General|Romance|Humor|Drama|Poetry|Adventure|Mystery|Horror|Parody|Angst|Supernatural|Suspense|Sci-Fi|Fantasy|Spiritual|Tragedy|Western|Crime|Family|Hurt[/]Comfort|Friendship|[/])+))?(?:\s+-\s+(.+?))?\s+-\s+Chapters:\s+(\d+)\s+-\s+Words:\s+([\d,]+)(?:\s+-\s+Reviews:\s+([\d,]+))?(?:\s+-\s+Favs: ([\d,]+))?(?:\s+-\s+Follows:\s+([\d,]+))?(?:\s+-\s+Updated:\s+([^-]+))?\s+-\s+Published:\s+([^-]+)(?:\s+-\s+Status:\s+([^-]+))?\s+-\s+id:\s+(\d+)\s*$/)
  if (!matched) matched = status.match(/^Rated:\s+Fiction\s+(\S+)\s+-\s+([^-]+)(?:\s+-\s+((?:General|Romance|Humor|Drama|Poetry|Adventure|Mystery|Horror|Parody|Angst|Supernatural|Suspense|Sci-Fi|Fantasy|Spiritual|Tragedy|Western|Crime|Family|Hurt[/]Comfort|Friendship|[/])+))?(?:\s+-\s+(.+?))?(?:\s+-\s+Chapters:\s+(\d+))?\s+-\s+Words:\s+([\d,]+)(?:\s+-\s+Reviews:\s+([\d,]+))?(?:\s+-\s+Favs: ([\d,]+))?(?:\s+-\s+Follows:\s+([\d,]+))?(?:\s+-\s+Updated:\s+([^-]+))?\s+-\s+Published:\s+([^-]+)(?:\s+-\s+Status:\s+([^-]+))?\s+-\s+id:\s+(\d+)\s*$/)
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
    genre: matched[3] ? matched[3].replace(/Hurt[/]Comfort/, 'HC').split(/[/]/).map(g => g === 'HC' ? 'Hurt/Comfort' : g) : [],
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
  if (/^(\w+ \d+(, \d+)?|\d+[/]\d+)$/.test(d)) {
    return moment.utc(d, ['MMM DD, YYYY', 'MMM DD', 'M/D'])
  } else if (m = d.match(/(\d+)h/)) {
    return moment().utc().subtract(2 + Number(m[1]), 'hour')
  } else {
    return null
  }
}
