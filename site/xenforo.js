'use strict'
/* eslint-disable no-useless-escape */
const url = require('url')
const Site = use('site')

const knownSites = {
  'forums.sufficientvelocity.com': 'Sufficient Velocity',
  'forums.spacebattles.com': 'Spacebattles',
  'forum.questionablequesting.com': 'Questionable Questing',
  'questionablequesting.com': 'Questionable Questing'
}

class Xenforo extends Site {
  static matches (siteUrlStr) {
    const siteUrl = url.parse(siteUrlStr)
    if (!/^[/](threads|posts)[/]|^[/]index[.]php[?]topic|^[/]goto[/]post[?]id/.test(siteUrl.path)) return false
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
    const path = siteUrl.pathname || siteUrl.path || ''
    const nameMatch = path.match(/^[/]threads[/]([^.]+)/)
    this.name = nameMatch && nameMatch[1]
  }

  getFicMetadata (fetch, fic) {
    fic.link = this.link
    fic.publisher = this.publisherName
    return fetch(this.threadmarkUrl()).spread((meta, html) => {
      const cheerio = require('cheerio')
      const $ = cheerio.load(html)
      const base = $('base').attr('href') || this.threadmarkUrl()
      const tat = this.detagTitle(this.scrapeTitle($))
      fic.title = tat.title
      if (!fic.tags.length) {
        fic.tags = tat.tags
      }
      let chapters = $('li.threadmarkItem')
      if (chapters.length === 0) chapters = $('li.primaryContent') // qq
      let leastRecent
      let mostRecent
      chapters.each((ii, chapter) => {
        const $chapter = $(chapter)
        const $link = $chapter.find('a')
        const name = $link.text().trim()
        const link = this.normalizeLink($link.attr('href'), base)
        const created = this.dateTime($chapter.find('.DateTime'))
        if (!leastRecent || created < leastRecent) leastRecent = created
        if (!mostRecent || created > mostRecent) mostRecent = created
        fic.chapters.addChapter({name, link, created})
      })
      fic.created = leastRecent
      fic.modified = mostRecent
      return fic.chapters[0].getContent(fetch.withOpts({cacheBreak: false})).then(chapter => {
        fic.author = chapter.author
        fic.authorUrl = chapter.authorUrl
        fic.description = chapter.$content.text().trim().replace(/^([^\n]+)[\s\S]*?$/, '$1')
      })
    })
  }

  scrapeFicMetadata (fetch, fic) {
    if (!fic.publisher) fic.publisher = this.publisherName
    const Chapter = use('fic').Chapter
    return Chapter.getContent(fetch, this.link).then(chapter => {
      // we guard all the fic metadata updates because we might be
      // acting in addition to the result from getFicMetadata
      if (!fic.link) fic.link = this.normalizeLink(chapter.link)
      if (!fic.created) fic.created = this.dateTime(chapter.$('.DateTime'))
      if (!fic.title || !fic.tags) {
        const tat = this.detagTitle(this.scrapeTitle(chapter.$))
        const ficTitle = tat.title
        const ficTags = tat.tags
        if (!fic.title) fic.title = ficTitle
        if (!fic.tags) fic.tags = ficTags
      }
      if (!fic.author) fic.author = chapter.author
      if (!fic.authorUrl) fic.authorUrl = chapter.authorUrl

      const firstPara = chapter.$content.text().trim().replace(/^([^\n]+)[\s\S]*?$/, '$1')
      if (!fic.description) fic.description = firstPara
      const links = chapter.$content('a')
      if (links.length === 0) {
        if (!chapter.name) chapter.name = fic.title
        fic.addChapter(chapter)
      } else {
        chapter.name = 'Table of Contents'
        fic.addChapter(chapter)
        fic.includeTOC = false
      }
      links.each((_, link) => {
        const $link = chapter.$content(link)
        const href = this.normalizeLink($link.attr('href'), chapter.base)
        let name = $link.text().trim()
        if (name === '↑') return // don't add links to quoted text as chapters
        // if the name is a link, try to find one elsewhere
        if (/^https?:[/][/]/.test(name) || / \| Page \d+$/.test(name)) {
          let next = $link[0].prev
          let nextText = chapter.$content(next).text().trim()
          if (next.type === 'text' && nextText === '') {
            next = next.prev
            nextText = chapter.$content(next).text().trim()
          }
          if (next.type !== 'text') {
            next = next.prev
            nextText = chapter.$content(next).text().trim()
          }
          if (next.type === 'text') {
            name = nextText
          }
        }
        if (/^[/](?:threads|posts|s|art)[/]|^[/]index.php[?]topic/.test(url.parse(href).path)) {
          fic.addChapter({name, link: href})
        }
      })
      if (!fic.modified && fic.chapters.slice(-1).created) {
        fic.modified = fic.chapters.slice(-1).created
      }
      if (fic.modified || fic.chapters.length === 0) return
      const lastChapter = fic.chapters.slice(-1)[0]
      return lastChapter.getContent(fetch.withOpts({cacheBreak: false})).then((chapter) => {
        fic.modified = chapter.created
      })
    })
  }

  getChapter (fetch, chapterInfo, retried) {
    return fetch(chapterInfo.fetchWith()).catch(err => {
      if (err.meta && err.meta.status === 404) {
        throw new Error('No chapter found at ' + chapter)
      } else {
        throw err
      }
    }).spread((meta, html) => {
      process.emit('debug', `Fetched ${chapterInfo.name}: ${chapterInfo.fetchWith()}`)
      const ChapterContent = use('chapter-content')
      const chapter = new ChapterContent(chapterInfo, {site: this, html})
      const chapterHash = url.parse(chapter.link).hash
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
        chapter.fetchFrom = chapter.link
        chapter.link = finalUrl
      }
      let $message
      if (id.length > 1) {
        $message = chapter.$('li.message#' + id.slice(1).replace(/[)]$/, ''))
      } else {
        $message = chapter.$(chapter.$('li.message')[0])
      }
      const $content = $message.find('article')
      if ($content.length === 0) {
        const $error = chapter.$('div.errorPanel')
        if ($error.length === 0) {
          if (!meta.fromCache || retried) {
            throw new Error('No chapter found at ' + chapter.link)
          } else {
            process.emit('debug', `No content found, retrying ${chapterInfo.name}: ${chapterInfo.fetchWith()}`)
            return this.getChapter(fetch.withOpts({cacheBreak: true}), chapter, true)
          }
        } else {
          throw new Error('Error fetching ' + chapter + ': ' + $error.text().trim())
        }
      }

      // at least on qq
      const $contentWarning = $content.find('dl.adv_accordion')
      if ($contentWarning.length) {
        const label = $contentWarning.find('dt').html()
        const value = $contentWarning.find('dd').html()
        $contentWarning.replaceWith(`<div><h3>${label}</h3>${value}</div>`)
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

      const $spoiler = $content.find('.bbCodeSpoilerContainer')
      const spoilerLabel = $spoiler.find('.bbCodeSpoilerButton').text().trim()
      $spoiler.attr('style', `border: solid black 1px; xenforo-spoiler: '${spoilerLabel}';`)
      if (spoilerLabel === 'Spoiler') {
        $spoiler.find('.bbCodeSpoilerButton').remove()
      } else {
        $spoiler.find('.bbCodeSpoilerButton').replaceWith(`<b>${spoilerLabel}</b><br/>`)
      }
      chapter.base = chapter.$('base').attr('href') || finalUrl
      const $author = chapter.$($message.find('a.username')[0])
      chapter.authorUrl = url.resolve(chapter.base, $author.attr('href'))
      chapter.author = $author.text().trim()
      chapter.created = this.dateTime($message.find('a.datePermalink .DateTime'))
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
        let ns = `xenforo-color: ${style};`
        const colorMatch = style.match(/color: #(\S\S)(\S\S)(\S\S)/)
        let opacity = 1
        if (colorMatch) {
          const r = Number('0x' + colorMatch[1])
          const g = Number('0x' + colorMatch[2])
          const b = Number('0x' + colorMatch[3])
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
      $content.find('div.messageTextEndMarker').remove()
      chapter.content =  $content.html().trim()
          // content is blockquoted, for some reason
          .replace(/^\s*<blockquote[^>]*>([\s\S]+)<[/]blockquote>\s*$/, '$1')
          // bullshit sv holloween thingy
          .replace(/^<p style="padding: 5px 0px; font-weight: bold; font-style: oblique; text-align: center; font-size: 12pt">.*?<[/]p>/g, '')
      return chapter
    })
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
    const threadMatch = /^([/]threads[/][^/]+\.\d+)(?:[/].*)?$/
    if (threadMatch.test(path)) {
      threadUrl.hash = ''
      threadUrl.pathname = threadUrl.pathname.replace(threadMatch, '$1/threadmarks')
    } else {
      this.warnings.push("This does not appear to be a thread Url, can't find threadmarks: ", threadUrl)
    }
    return url.format(threadUrl)
  }

  scrapeDateTime (elem) {
    if (elem.attr('data-datestring')) {
      return new Date(elem.attr('data-datestring') + ' ' + elem.attr('data-timestring'))
    } else if (elem.attr('title')) {
      return new Date(elem.attr('title').replace(/ at/, ''))
    }
  }

  scrapeTitle ($) {
    // sv, sb
    try {
      return $('meta[property="og:title"]').attr('content').replace(/Threadmarks for: /i, '')
    } catch (_) {
      // qq
      try {
        return $('div.titleBar h1').text().replace(/^\[\w+\] /, '').replace(/Threadmarks for: /i, '')
      } catch (_) {
        return
      }
    }
  }

  detagTitle (title) {
    const tagExp = /[\[(](.*?)[\])]/
    const tagMatch = title.match(tagExp)
    let tags = []
    if (tagMatch) {
      title = title.replace(tagExp, '').trim()
      tags = tagMatch[1].split(/[/,]/).map(tag => tag.trim())
    }
    return {title, tags}
  }

  normalizeLink (href, base) {
    // force ssl
    if (!/index.php/.test(href)) href = href.replace(/^http:/, 'https:')
    // resolve base url
    if (base) href = url.resolve(base, href)
    // normalize post urls
    href = href.replace(/[/]threads[/][^/]+[/](?:page-\d+)?#post-(\d+)$/, '/posts/$1')
               .replace(/([/]posts[/][^/]+)[/]$/, '$1')
               .replace(/[/]goto[/]post[?]id=(\d+).*?$/, '/posts/$1')
    return href
  }

  dateTime (elem) {
    if (elem.attr('data-datestring')) {
      return new Date(elem.attr('data-datestring') + ' ' + elem.attr('data-timestring'))
    } else if (elem.attr('title')) {
      return new Date(elem.attr('title').replace(/ at/, ''))
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
}

module.exports = Xenforo
