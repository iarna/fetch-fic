'use strict'
/* eslint-disable no-useless-escape */
const url = require('url')
const Site = use('site')
const moment = require('moment-timezone')
const tagmap = use('tagmap')('xenforo')
const uniqTags = use('tagmap')('raw')
const qr = require('@perl/qr')
const cache = use('cache')

const knownSites = {
  'forums.sufficientvelocity.com': 'Sufficient Velocity',
  'forums.spacebattles.com': 'Spacebattles',
  'forum.questionablequesting.com': 'Questionable Questing',
  'questionablequesting.com': 'Questionable Questing',
  'www.alternatehistory.com': 'Alternate History'
}

function getShortName (url) {
  if (/spacebattles/.test(url)) return 'sb'
  if (/sufficientvelocity/.test(url)) return 'sv'
  if (/fanfiction.net/.test(url)) return 'ff'
  if (/questionable/.test(url)) return 'qq'
  if (/archiveofourown/.test(url)) return 'ao3'
  if (/alternatehistory/.test(url)) return 'ah'
}

class Xenforo extends Site {
  static matches (siteUrlStr) {
    const siteUrl = url.parse(siteUrlStr)
    if (!qr`/(members|threads|posts)/|^/index[.]php[?]topic|^/goto/post[?]id`.test(siteUrl.path)) return false
    return true
  }

  constructor (siteUrlStr) {
    super(siteUrlStr)
    const siteUrl = url.parse(siteUrlStr)
    const hostname = siteUrl.hostname
    if (!knownSites[hostname]) {
      this.warnings.push(`Has not yet been tested with ${hostname}, may not work.`)
    }
    this.publisher = hostname
    this.publisherName = knownSites[hostname] || hostname
    this.shortName = getShortName(hostname)
    this.canScrape = true
    this.type = 'xenforo'
    const path = siteUrl.pathname || siteUrl.path || ''
    const nameMatch = path.match(qr`^/threads/([^.]+)`)
    this.name = nameMatch && nameMatch[1]
  }

  async getFicMetadata (fetch, fic) {
    async function fetchWithCheerio (url) {
      const cheerio = require('cheerio')
      const result = await fetch(url)
      const [meta, html] = result
      return cheerio.load(html)
    }

    fic.link = this.normalizeFicLink(this.link)
    fic.publisher = this.publisherName

    const $ = await fetchWithCheerio(this.threadmarkUrl())

    const base = $('base').attr('href') || this.threadmarkUrl()
    const tat = this.detagTitle(this.scrapeTitle($))
    fic.title = tat.title
    fic.tags = fic.tags.concat(tat.tags)
    const $sections = $('div.threadmarks ol.tabs li')
    let leastRecent
    let mostRecent
    const tz = this.getTz($)
    const loadThreadmarks = (type, $) => {
      let chapters = $('li.threadmarkListItem')
      if (chapters.length === 0) chapters = $('li.threadmarkItem') // older
      if (chapters.length === 0) chapters = $('li.primaryContent') // qq
      chapters.each((ii, chapter) => {
        const $chapter = $(chapter)
        $chapter.find('li').remove() // remove child chapters so that $link.text() works right
        if ($chapter.find('a.username').length) return
        const $link = $chapter.find('a')
        const name = $link.text().trim()
        const link = this.normalizeChapterLink($link.attr('href'), base)
        const created = this.dateTime($chapter.find('.DateTime'), tz)
        if (!leastRecent || created < leastRecent) leastRecent = created
        if (!mostRecent || created > mostRecent) mostRecent = created
        fic.chapters.addChapter({name, type, link, created})
      })
    }
    if ($sections.length > 1) {
      const sections = []
      $sections.each((ii, section) => {
        const $section = $(section)
        let type = $section.text().trim()
        if (type === 'Threadmarks') type = 'chapter'
        const link = url.resolve(base, $section.find('a').attr('href'))
        sections.push({type, link})
      })
      for (let section of sections) {
        loadThreadmarks(section.type, await fetchWithCheerio(section.link))
      }
    } else {
      loadThreadmarks('chapter', $)
    }
    fic.created = leastRecent
    fic.modified = mostRecent
    if (!fic.chapters.length) return
    let findFirst = fic.chapters.filter(_ => _.type === 'chapter')
    if (findFirst.length === 0) findFirst = fic.chapters
    const chapter = await findFirst[0].getContent(fetch.withOpts({cacheBreak: false}))
    fic.rawTags = fic.tags.concat(chapter.chapterTags)
    fic.tags = tagmap(fic.tags.concat(chapter.chapterTags))
    fic.author = chapter.author
    fic.authorUrl = this.normalizeAuthorLink(chapter.authorUrl)
    fic.notes = chapter.$content.text().trim().replace(/^([^\n]+)[\s\S]*?$/, '$1')
  }

  async scrapeFicMetadata (fetch, fic) {
    if (!fic.publisher) fic.publisher = this.publisherName
    const Chapter = use('fic').Chapter
    const chapter = await Chapter.getContent(fetch, this.link)
    // we guard all the fic metadata updates because we might be
    // acting in addition to the result from getFicMetadata
    if (!fic.link) fic.link = this.normalizeFicLink(chapter.link)
    const tz = this.getTz(chapter.$)
    if (!fic.created) fic.created = this.dateTime(chapter.$('.DateTime'), tz)
    if (!fic.title || !fic.tags || !fic.tags.length) {
      const tat = this.detagTitle(this.scrapeTitle(chapter.$))
      const ficTitle = tat.title
      const ficTags = tat.tags
      if (!fic.title) fic.title = ficTitle
      if (!fic.tags.length) fic.tags = ficTags
    }
    fic.tags = fic.tags.concat(chapter.chapterTags)
    fic.rawTags = fic.tags.slice()
    fic.tags = tagmap(fic.tags)

    if (!fic.author) fic.author = chapter.author
    if (!fic.authorUrl) fic.authorUrl = this.normalizeAuthorLink(chapter.authorUrl)

    const firstPara = chapter.$content.text().trim().replace(/^([^\n]+)[\s\S]*?$/, '$1')
    if (!fic.notes) fic.notes = firstPara

    const chapters = []
    const fetchWithCache = fetch.withOpts({cacheBreak: false})
    if (fic.scrapeMeta === 'no-chapters') {
      // nothing
    } else if (fic.scrapeMeta === 'posts') {
      const cheerio = require('cheerio')
      if (!chapter.name) chapter.name = 'Chapter 1'
      let thispage = chapter.$
      let thisUrl = chapter.fetchFrom || chapter.link
      let num = 0
      while (true) {
        const msgs = thispage(`.message[data-author="${fic.author}"]`)
        const base = thispage('base').attr('href') || thisUrl

        msgs.each((_, msg) => {
          const $msg = thispage(msg)
          const perm = $msg.find('a.datePermalink').attr('href').trim()
          let link
          if (/posts\/(\d+)\/?$/.test(perm)) {
            link = url.resolve(thisUrl, perm.replace(/posts\/(\d+)\/?$/, '#post-$1'))
          } else {
            link = url.resolve(base, perm)
          }
          const name = $msg.find('article').text().trim().replace(/^([^\n]+)[\s\S]*$/, '$1')
          chapters.push({name: `Chapter ${++num}: ${name}`, link})
        })
        const $next = thispage('link[rel="next"]')
        if ($next.length === 0) break
        const next = url.resolve(base, $next.attr('href').trim())
        const [meta, html] = await fetchWithCache(next)
        thispage = cheerio.load(html)
        thisUrl = meta.finalUrl || next
      }
    } else {
      const links = chapter.$content('a')
      links.each((_, link) => {
        const $link = chapter.$content(link)
        const href = this.normalizeChapterLink($link.attr('href'), chapter.base)
        let name = $link.text().trim()
        if (name === '↑') return // don't add links to quoted text as chapters
        // if the name is a link, try to find one elsewhere
        if (qr`^https?://`.test(name) || / \| Page \d+$/.test(name)) {
          let next = $link[0].prev
          let nextText = chapter.$content(next).text().trim()
          if (next && next.type === 'text' && nextText === '') {
            next = next.prev
            nextText = chapter.$content(next).text().trim()
          }
          if (next && next.type !== 'text') {
            next = next.prev
            nextText = chapter.$content(next).text().trim()
          }
          if (next && next.type === 'text') {
            name = nextText
          }
        }
        if (qr`^/(?:threads|posts|s|art)/|^/index.php[?]topic`.test(url.parse(href).path)) {
          chapters.push({name, link: href})
        }
      })
      if (!chapter.name) chapter.name = fic.title
      fic.addChapter(chapter)
    }
    const forEach = use('for-each')
    await forEach(chapters, async ch => {
      try {
        const inf = await this.getChapter(fetchWithCache, new Chapter(ch))
        fic.modified = inf.modified || inf.created
        ch.tags = []
        fic.addChapter(ch)
      } catch (_) {}
    })

    if (fic.scrapeMeta !== 'posts' && fic.chapters.length > 1) {
      fic.chapters[0].name = 'Table of Contents'
      fic.includeTOC = false
    }
  }

  async getChapter (fetch, chapterInfo, retried) {
    if (!chapterInfo.hash) chapterInfo.hash = url.parse(chapterInfo.fetchWith()).hash
    let meta, html
    try {
      ;[meta, html] = await fetch(chapterInfo.fetchWith(), {redirect: 'manual'})
      if (meta.status >= 300 && meta.status < 400) {
        let [ location ] = meta.headers.location
        if (location.indexOf('two-step?redirect') !== -1) {
          if (retried) {
            throw new Error('Got two-factor author redirect for ' + chapterInfo.fetchWith())
          } else {
            process.emit('debug', `No content found, retrying ${chapterInfo.name}: ${chapterInfo.fetchWith()}`)
            await cache.clearUrl(chapterInfo.fetchWith())
            return this.getChapter(fetch, chapterInfo, true)
          }
        } else {
          chapterInfo.hash = url.parse(location).hash
          chapterInfo.fetchFrom = location
          return this.getChapter(fetch, chapterInfo)
        }
      }
    } catch (err) {
      if (err.code === 404) {
        throw new Error('No chapter found (404) at ' + chapterInfo.fetchWith())
      }
      throw err
    }
    const ChapterContent = use('chapter-content')
    const chapter = new ChapterContent(chapterInfo, {site: this, html})
    const chapterHash = chapterInfo.hash
    const parsed = url.parse(meta.finalUrl)
    let id
    if (/^#post/.test(chapterHash)) {
      id = chapterHash || parsed.hash || ''
    } else {
      id = parsed.hash || chapterHash || ''
    }
    let finalUrl = meta.finalUrl
    if (id) {
      parsed.hash = id
      finalUrl = url.format(parsed)
    }
    if (finalUrl !== chapter.link) {
      chapter.fetchFrom = finalUrl
    }
    const tz = this.getTz(chapter.$)
    let $message
    if (id.length > 1) {
      $message = chapter.$('li.message#' + id.slice(1).replace(/([)']|%27)$/, ''))
    } else {
      $message = chapter.$(chapter.$('li.message')[0])
    }
    const $content = $message.find('article')
    if ($content.length === 0) {
      const $error = chapter.$('div.errorPanel')
      if ($error.length === 0) {
        if (!meta.fromCache || retried) {
          throw new Error('No chapter found at (empty list) ' + chapter.link)
        } else {
          process.emit('debug', `No content found, retrying ${chapterInfo.name}: ${chapterInfo.fetchWith()}`)
          await cache.clearUrl(chapterInfo.fetchWith())
          return this.getChapter(fetch, chapterInfo, true)
        }
      } else {
        throw new Error('Error fetching ' + chapter + ': ' + $error.text().trim())
      }
    }

    // at least on qq
    const $contentWarning = $content.find('dl.adv_accordion')
    if ($contentWarning.length) {
      $contentWarning.each((ii, cw) => {
        const $cw = chapter.$(cw)
        const label = coll2arr($cw.find('dt')).map(v => chapter.$(v))
        const value = coll2arr($cw.find('dd')).map(v => chapter.$(v))
        let result = ''
        for (let ii = 0; ii < label.length; ++ii) {
          result += `<div><h3>${label[ii].html()}</h3>${value[ii].html()}</div>`
        }
        $cw.replaceWith(result)
      })
    }

    $content.find('.quoteContainer < aside').each((ii, quote) => {
      const $quote = chapter.$(quote)
      const $attribution = $quote.find('.attribution')
      if ($attribution.length !== 0) {
        if (!$attribution.text().match(/(.*) said:/)) process.emit('debug', 'QUOTE', $quote.html())
        const user = $attribution.text().match(/(.*) said:/)[1].trim()
        const postHref = $attribution.find('a').attr('href')
        if (postHref) {
          const post = postHref.match(/(\d+)/)[1]
          $quote.find('.quote').attr('style', `xenforo-quote: ${post} '${user}';`)
        } else {
          $quote.find('.quote').attr('style', `xenforo-quote: '${user}';`)
        }
      } else {
        $quote.find('.quote').attr('style', `xenforo-quote: true`)
      }
      $content.find('.quoteExpand').remove()
    })

    const $spoilers = $content.find('.bbCodeSpoilerContainer')
    if (chapterInfo.spoilers) {
      $spoilers.each((ii, spoiler) => {
        const $spoiler = chapter.$(spoiler)
        const spoilerLabel = $spoiler.find('.bbCodeSpoilerButton').text().trim()
        $spoiler.attr('style', `xenforo-spoiler: '${spoilerLabel}'; border: solid black 1px;`)
        if (spoilerLabel === 'Spoiler') {
          $spoiler.find('.bbCodeSpoilerButton').remove()
        } else {
          $spoiler.find('.bbCodeSpoilerButton').replaceWith(`<b>${spoilerLabel}</b><br/>`)
        }
      })
    } else {
      $spoilers.remove()
    }
    chapter.base = chapter.$('base').attr('href') || finalUrl
    const $author = chapter.$($message.find('a.username')[0])
    chapter.authorUrl = this.normalizeAuthorLink($author.attr('href') && url.resolve(chapter.base, $author.attr('href')))
    chapter.author = $author.text().trim()
    chapter.created = this.dateTime($message.find('a.datePermalink .DateTime'), tz)
    let baseLightness = 100
    const color = require('color-ops')
    if (/spacebattles/.test(chapter.link)) {
      baseLightness = color.lightness(color.rgb(204, 204, 204))
    } else if (/questionablequesting/.test(chapter.link)) {
      baseLightness = color.lightness(color.rgb(86, 86, 86))
    } else if (/sufficientvelocity/.test(chapter.link)) {
      baseLightness = color.lightness(color.rgb(230, 230, 230))
    }
    $content.find('[style *= color]').each((ii, vv) => {
      const style = chapter.$(vv).attr('style')
      const colorMatch = style.match(/color: #(\S\S)(\S\S)(\S\S)/)
      let ns = ''
      let opacity = 1
      if (colorMatch) {
        const r = Number('0x' + colorMatch[1])
        const g = Number('0x' + colorMatch[2])
        const b = Number('0x' + colorMatch[3])
        ns += `xenforo-color: rgb(${r},${g},${b});`
        const lightness = color.lightness(color.rgb(r, g, b))
        opacity = lightness / baseLightness
        if (baseLightness < 0.5) opacity = 1 - opacity
        if (opacity < 0.25) opacity = 0.25
        if (opacity > 1) {
          ns += 'opacity: 1; font-weight: bolder;'
        } else {
          ns += `opacity: ${opacity};`
        }
        const red = Math.round(r/25)
        const green = Math.round(g/25)
        const blue = Math.round(b/25)
        if (red > green && red > blue) { // red
          ns += 'border-style: hidden dashed;'
        } else if (green > red && green > blue) { // green
          ns += 'border-style: hidden double;'
        } else if (blue > red && blue > green) { // blue
          ns += 'border-style: hidden solid;'
        } else if (red === green && red > blue) { // yellow?
          ns += 'border-style: dashed double;'
        } else if (red === blue && red > green) { // magenta
          ns += 'border-style: dashed solid;'
        } else if (green === blue && green > red) { // cyan
          ns += 'border-style: double solid;'
        }

      } else if (style === 'color: transparent') {
        opacity = 0.25
        ns += 'text-decoration: line-through; font-style: oblique; opacity: 0.25;'
      }
      chapter.$(vv).attr('style', ns)
    })
    chapter.chapterTags = this.getTags(chapter.$)
    if (/Discussion in .*Quest(s|ing)/i.test(chapter.$('#pageDescription').text())) {
      chapter.chapterTags.push('Quest')
    } else if (/Discussion in .*Worm/i.test(chapter.$('#pageDescription').text())) {
      chapter.chapterTags.push('fandom:Worm')
    }
    $content.find('div.messageTextEndMarker').remove()
    chapter.content =  $content.html().trim()
        // content is blockquoted, for some reason
        .replace(qr`^\s*<blockquote[^>]*>([\s\S]+)</blockquote>\s*$`, '$1')
        // bullshit sv holloween thingy
        .replace(qr.g`^<p style="padding: 5px 0px; font-weight: bold; font-style: oblique; text-align: center; font-size: 12pt">.*?</p>`, '')
    return chapter
  }

  getTags ($) {
    const tags = []
    $('.tagList a.tag').each((ii, tag) => {
      tags.push($(tag).text().trim())
    })
    return tags.map(t => `freeform:${t}`)
  }

  sanitizeHtmlConfig () {
    const config = super.sanitizeHtmlConfig()
    config.transformTags.img = (tagName, attribs) => { return this.cleanImages(tagName, attribs) }
    return config
  }

  cleanImages (tagName, attribs) {
    if (attribs.class) {
      const classes = attribs.class.trim().split(/\s+/)
      if (classes.some(this.andMatches(/^mceSmilieSprite$/))) {
        const smilies = classes.filter(this.andMatches(/^mceSmilie\d+$/))
        let text
        switch (smilies && smilies[0]) {
          case 'mceSmilie1': text = '🙂'; break
          case 'mceSmilie2': text = '😉'; break
          case 'mceSmilie3': text = '🙁'; break
          case 'mceSmilie4': text = '😡'; break
          case 'mceSmilie5': text = '🙃'; break
          case 'mceSmilie6': text = '😎'; break
          case 'mceSmilie7': text = '😛'; break
          case 'mceSmilie8': text = '😆'; break
          case 'mceSmilie9': text = '😮'; break
          case 'mceSmilie10': text = '😳'; break
          case 'mceSmilie11': text = '🙄'; break
          case 'mceSmilie12': text = '😝'; break
          case 'mceSmilie58': text = '😭'; break
          case 'mceSmilie59': text = '😏'; break
          case 'mceSmilie60': text = '😇'; break
          case 'mceSmilie62': text = '😂'; break
          case 'mceSmilie63': text = '😆😂'; break
          default: text = attribs.alt
        }
        return {tagName: 'span', text: text}
      }
    }
    if (!attribs.src || /^http/.test(attribs.src)) {
      return {tagName: 'span', text: ''}
    }
    return {tagName: tagName, attribs: attribs}
  }

  andMatches (pattern) {
    return (item) => { return pattern.test(item) }
  }

  threadmarkUrl () {
    const threadUrl = url.parse(this.raw)
    const path = threadUrl.pathname || threadUrl.path
    const threadMatch = qr`(/threads/(?:[^/]+\.)?\d+)(?:/.*)?$`
    if (threadMatch.test(path)) {
      threadUrl.hash = ''
      threadUrl.pathname = threadUrl.pathname.replace(threadMatch, '$1/threadmarks')
    } else {
      this.warnings.push("This does not appear to be a thread Url, can't find threadmarks: ", threadUrl)
    }
    return url.format(threadUrl)
  }

  scrapeTitle ($) {
    try {
      const titleChunk = $('div.titleBar h1')
      const tags = coll2arr(titleChunk.find('span')).map(t => $(t).text().trim().replace(/\[|\]/g, '')).map(_ => `section:${_}`)
      titleChunk.find('span').remove()
      return [titleChunk.text().replace(/Threadmarks for: /i, '').trim(), tags]
    } catch (_) {
      return
    }
  }

  detagTitle (titleAndTags) {
    let [title, tags] = titleAndTags || [undefined, []]
    const tagMatchers = [ qr`[{](?:.{2,})[}]`, qr`(?!^)[\[](?:.{2,})[\]]`, qr`[(](?:[^)]{2,})[)](?: |$)` ]
    const rawTags = []
    for (let tagExp of tagMatchers) {
      if (tagExp.test(title)) {
        let tagBit
        while (tagBit = tagExp.exec(title)) {
          title = title.replace(qr`${tagBit[0]}`, '').trim()
          tagBit[0].split(/[;{}\[\](),|/]| x /)
           .map(_ => _.trim())
           .filter(_ => _)
           .forEach(_ => rawTags.push(_))
        }
	break
      }
    }
    while (rawTags.length) {
      let tag = rawTags.shift()
      if (tag.toLowerCase() === 'fate' && rawTags.length) {
        tag += '/' + rawTags.shift()
      }
      tags.push(`freeform:title:${tag}`)
    }
    return {title, tags}
  }

  normalizeLink (href, base) {
    if (!href) return href
    // force ssl
    if (!/index.php/.test(href)) href = href.replace(/^http:/, 'https:')
    // resolve base url
    if (base) href = url.resolve(base, href)
    // normalize post urls
    href = href.replace(qr`/threads/[^/]+/(?:page-\d+)?#post-(\d+)$`, '/posts/$1')
               .replace(qr`(/posts/[^/]+)/$`, '$1')
               .replace(qr`/goto/post[?]id=(\d+).*?$`, '/posts/$1')
               .replace(/forum.questionable/, 'questionable')
               .replace(/[/]sufficient/, '/forums.sufficient')
    return href
  }
  normalizeAuthorLink (href, base) {
    return this.normalizeLink(href, base)
      .replace(qr`/members/[^.]+[.](\d+)/?$`, '/members/$1')
      .replace(qr`/forum[.](questionablequesting[.]com)/`, '/$1/')
  }

  dateTime (elem, tz) {
    if (elem.attr('data-time')) {
      return moment.unix(elem.attr('data-time')).millisecond(0).second(0)
    } else if (elem.attr('data-datestring')) {
      return moment.tz(elem.attr('data-datestring') + ' ' + elem.attr('data-timestring'), 'MMM DD, YYYY h:mm A Z', tz)
    } else if (elem.attr('title')) {
      return moment.tz(elem.attr('title'), 'MMM DD, YYYY [at] h:mm A Z', tz)
    }
  }

  countStoryWords (chapter) {
    const wordcount = require('@iarna/word-count')
    let $content
    if (/[.]bbCodeQuote/.test(chapter.content)) {
      const cheerio = require('cheerio')
      const $content = cheerio.load(chapter.content)
      $content('.bbCodeQuote').remove()
      return wordcount($content.text().trim())
    } else {
      return wordcount(chapter.$content.text().trim())
    }
  }

  getTz ($) {
    switch (this.publisherName) {
      case 'Sufficient Velocity':
      case 'Spacebattles':
      case 'Alternate History':
        return 'America/New_York'
      case 'Questionable Questing':
        return 'Europe/London'
      default:
        return 'America/Los_Angeles'
    }
  }

  async getUserInfo (fetch, externalName, link, try2) {
    const cheerio = require('cheerio')
    const authCookies = require(`${__dirname}/../.authors_cookies.json`)
    let res
    let auhtml
    try {
      const result = await fetch(link)
      res = result[0]
      auhtml = result[1]
      if (res.headers.location) {
        let [ location ] = res.headers.location
        if (location.indexOf('two-step?redirect') !== -1) {
          if (try2) {
            throw new Error('Got two-factor author redirect for ' + link)
          } else {
            const cache = use('cache')
            await cache.clearUrl(link)
            return this.getUserInfo(fetch, externalName, link, true)
          }
        } else {
          if (location !== link) return this.getUserInfo(fetch, externalName, location)
        }
     }
    } catch (err) {
      if (err.code === 404) {
        throw new Error('No user found at ' + link)
      }
      throw err
    }
    const $ = cheerio.load(auhtml)
    const name = $('meta[property="profile:username"]').attr('content') || $('h1[itemprop="name"]').first().text() || externalName
    const gender = $('meta[property="profile:gender"]').attr('content') || $('dd[itemprop="gender"]').first().text() || undefined
    const dob = $('dd span[itemprop="dob"]').first().text() || undefined
    const location = $('dd a[itemprop="address"]').first().text() || undefined
    const image_src = $('img[itemprop="photo"]').first().attr('src')
    const image = (image_src && !qr`avatars/avatar`.test(image_src)) ? url.resolve(link, image_src) : undefined
    const $info = $('#info')
    const $about = $info.first()
    const $sig = $info.last()
    const aboutHtml = $about.find('div').first().find('.baseHtml').html() || ''
    const sigHtml = $about.find('.signature').html() || ''
    let profile = (aboutHtml + sigHtml).trim() || undefined
    return {name, link:this.normalizeAuthorLink(link), gender, dob, location, image, profile}
  }
}

function coll2arr (c) {
  const a = []
  c.each((ii, v) => a.push(v))
  return a
}

module.exports = Xenforo
