'use strict'
const url = require('url')
const Site = require('./site.js')
const cheerio = require('cheerio')
const color = require('color-ops')

const knownSites = {
  'forums.sufficientvelocity.com': 'Sufficient Velocity',
  'forums.spacebattles.com': 'Spacebattles',
  'forum.questionablequesting.com': 'Questionable Questing',
  'questionablequesting.com': 'Questionable Questing'
}

class Xenforo extends Site {
  static matches (siteUrlStr) {
    const siteUrl = url.parse(siteUrlStr)
    const hostname = siteUrl.hostname
    if (!/^[/](threads|posts)[/]|^[/]index[.]php[?]topic/.test(siteUrl.path)) return false
    return true
  }

  constructor (siteUrlStr) {
    super(siteUrlStr)
    const siteUrl = url.parse(siteUrlStr)
    const hostname = siteUrl.hostname
    if (!knownSites[hostname]) {
      this.warnings.push(`Has not yet been tested with ${threadUrl.hostname}, may not work.`)
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
      const $ = cheerio.load(html)
      const base = $('base').attr('href') || this.threadmarkUrl()
      const tat = this.detagTitle(this.scrapeTitle($))
      fic.title = tat.title
      if (!fic.tags.length) {
        fic.tags = tat.tags
      }
      let chapters = $('li.threadmarkItem')
      if (chapters.length === 0) chapters = $('li.primaryContent') //qq
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
        fic.chapters.addChapter(name, link, created)
      })
      fic.created = leastRecent
      fic.modified = mostRecent
      return this.getChapter(link => fetch(link, false), this.link).then((chapter) => {
        fic.author = chapter.author
        fic.authorUrl = chapter.authorUrl
        var $content = cheerio.load(chapter.content)
        fic.description = $content.text().trim().replace(/^([^\n]+)[\s\S]*?$/, '$1')
      })
    })
  }

  scrapeFicMetadata (fetch, fic) {
    if (!fic.link) fic.link = this.link
    if (!fic.publisher) fic.publisher = this.publisherName
    return this.getChapter(fetch, this.link).then(chapter => {
      const $ = cheerio.load(chapter.raw)
      // we guard all the fic metadata updates because we might be
      // acting in addition to the result from getFicMetadata
      if (!fic.link) fic.link = this.normalizeLink(chapter.finalUrl)
      if (!fic.created) fic.created = this.dateTime($('.DateTime'))
      if (!fic.title) {
        const tat = this.detagTitle(this.scrapeTitle($))
        fic.title = tat.title
        if (!fic.tags.length) {
          fic.tags = tat.tags
        }
      }
      if (!fic.author) fic.author = chapter.author
      if (!fic.authorUrl) fic.authorUrl = chapter.authorUrl

      const $content = cheerio.load(chapter.content)
      var firstPara = $content.text().trim().replace(/^([^\n]+)[\s\S]*?$/, '$1')
      if (!fic.description) fic.description = firstPara
      const links = $content('a')
      const indexLink = this.normalizeLink(chapter.finalUrl)
      if (links.length === 0) {
        fic.addChapter(chapter.title || fic.title, indexLink, chapter.created)
      } else {
        fic.addChapter('Table of Contents', indexLink, chapter.created)
      }
      links.each((_, link) => {
        const $link = $content(link)
        const href = this.normalizeLink($link.attr('href'), chapter.base)
        let name = $link.text().trim()
        if (name === '↑') return // don't add links to quoted text as chapters
        // if the name is a link, try to find one elsewhere
        if (/^https?:[/][/]/.test(name) || / \| Page \d+$/.test(name)) {
          let next = $link[0].prev
          let nextText = $content(next).text().trim()
          if (next.type === 'text' && nextText === '') {
            next = next.prev
            nextText = $content(next).text().trim()
          }
          if (next.type !== 'text') {
            next = next.prev
            nextText = $content(next).text().trim()
          }
          if (next.type == 'text') {
            name = nextText
          }
        }
        if (/^[/](?:threads|posts|s|art)[/]|^[/]index.php[?]topic/.test(url.parse(href).path)) {
          fic.addChapter(name, href)
        }
      })
      if (!fic.modified && fic.chapters.slice(-1).created) {
        fic.modified = fic.chapters.slice(-1).created
      }
      if (fic.modified || fic.chapters.length === 0) return
      const lastChapter = fic.chapters.slice(-1)[0]
      return this.getChapter(link => fetch(link, false), lastChapter.link).then((chapter) => {
        fic.modified = chapter.created
      })
    })
  }

  getChapter (fetch, chapter, noCache) {
    return fetch(chapter, noCache).catch(err => {
      if (err.meta && err.meta.status === 404) {
        throw new Error('No chapter found at ' + chapter)
      } else {
        throw err
      }
    }).spread((meta, html) => {
      const chapterHash = url.parse(chapter).hash
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
      const $ = cheerio.load(html)
      let $message
      if (id !== '') {
        $message = $('li.message#' + id.slice(1))
      } else {
        $message = $($('li.message')[0])
      }
      const $content = $message.find('article')
      if ($content.length === 0) {
        const $error = $('div.errorPanel')
        if ($error.length === 0) {
          if (noCache || !meta.fromCache) {
            throw new Error('No chapter found at ' + chapter)
          } else {
            return this.getChapter(fetch, chapter, true)
          }
        } else {
          throw new Error('Error fetching ' + chapter + ': ' + $error.text().trim())
        }
      }
      $content.find('.quoteExpand').remove()
      const $spoiler = $content.find('.bbCodeSpoilerContainer')
      $spoiler.attr('style', 'border: solid black 1px')
      $spoiler.find('.bbCodeSpoilerButton').remove()
      const base = $('base').attr('href') || finalUrl
      const $author = $($message.find('a.username')[0])
      const authorUrl = url.resolve(base, $author.attr('href'))
      const authorName = $author.text()
      const messageDate = this.dateTime($message.find('a.datePermalink .DateTime'))
      let baseLightness = 0
      if (/spacebattles/.test(chapter)) {
        baseLightness = color.lightness(color.rgb(204,204,204))
      }
      else if (/questionablequesting/.test(chapter)) {
        baseLightness = color.lightness(color.rgb(86,86,86))
      }
      else if (/sufficientvelocity/.test(chapter)) {
        baseLightness = color.lightness(color.rgb(230,230,230))
      }
      $content.find('[style *= color]').each((ii, vv) => {
        const style = $(vv).attr('style')
        let ns = ''
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
          ns = 'opacity: ' +  opacity + ';'
        } else if (style === 'color: transparent') {
          opacity = 0.25
          ns = 'text-decoration: line-through; font-style: oblique; opacity: 0.25;'
        }
        if (opacity > 1) {
          ns += 'font-weight: bolder;'
        }
        if (style === 'color: #ffcc99') {
          ns += 'font-style: italic;'
        } else if (style === 'color: #99ffff') {
          ns += 'font-style: italic;'
        } else if (style === 'color: #9999ff') {
          ns += 'font-family: fantasy; font-style: italic;'
        } else if (style === 'color: #4d4dff') {
          ns += 'border-style: hidden dashed;'
        } else if (style === 'color: #b3b300') {
          ns += 'border-style: hidden double;'
        } else if (style === 'color: #b30000') {
          ns += 'border-style: hidden solid;'
        }
        $(vv).attr('style', ns)
      })
      $content.find('div.messageTextEndMarker').remove()
      return {
        chapterLink: chapter,
        finalUrl: finalUrl,
        base: base,
        author: authorName,
        authorUrl: authorUrl,
        created: messageDate,
        raw: html,
        content: $content.html().trim()
          // content is blockquoted, for some reason
          .replace(/^\s*<blockquote[^>]*>([\s\S]+)<[/]blockquote>\s*$/, '$1')
          // bullshit sv holloween thingy
          .replace(/^<p style="padding: 5px 0px; font-weight: bold; font-style: oblique; text-align: center; font-size: 12pt">.*?<[/]p>/g, '')
          // trim the lines
          .replace(/^\s+|\s+$/mg, '')
      }
    })
  }

  sanitizeHtmlConfig () {
    var config = super.sanitizeHtmlConfig()
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
      return new Date(elem.attr('title').replace(/ at/,''))
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
    href = href.replace(/[/]threads[/][^/]+[/](?:page-\d+)?#post-(\d+)$/,'/posts/$1')
               .replace(/([/]posts[/][^/]+)[/]$/, '$1')
               .replace(/[/]goto[/]post[?]id=(\d+).*?$/, '/posts/$1')
    return href
  }

  dateTime (elem) {
    if (elem.attr('data-datestring')) {
      return new Date(elem.attr('data-datestring') + ' ' + elem.attr('data-timestring'))
    } else if (elem.attr('title')) {
      return new Date(elem.attr('title').replace(/ at/,''))
    }
  }
}


module.exports = Xenforo
