'use strict'
const qw = require('qw')

class Site {
  constructor (rawUrl) {
    this.raw = rawUrl
    this.link = this.normalizeLink(rawUrl)
    this.warnings = []
    this.canScrape = false
  }
  static register (site) {
    this.registered.push(site)
  }
  static fromUrl (rawUrl) {
    if (this.registered.length === 0) {
      const sitesAvailable = qw`
        xenforo fanfictionnet ao3 ao3/series wattpad royalroad
        seananmcguire worm worm2 pgte
        deviantart gravatar wp-facebook wikipedia youtube nanodesutranslations
        epub scrivener local fictionpress
        generic-image generic-html`
      for (const site of sitesAvailable) {
        Site.register(require(`./site/${site}`))
      }
    }
    for (const SpecificSite of this.registered) {
      try {
        if (SpecificSite.matches(rawUrl)) return new SpecificSite(rawUrl)
      } catch (ex) {
        // try next
      }
    }
    const err = new Error('Could not find supported site for: ' + rawUrl)
    err.code = 'ENOSITE'
    throw err
  }

  normalizeLink (href, base) {
    if (!href) return href
    // resolve base url
    if (base) {
      const url = require('url')
      href = url.resolve(base, href)
    }
    // force ssl
    href = href.replace(/^http:/, 'https:')
    href = href.replace(/[/]$/, '')
    return href
  }
  normalizeFicLink (href, base) {
    return this.normalizeLink(href, base)
  }
  normalizeChapterLink (href, base) {
    return this.normalizeLink(href, base)
  }
  normalizeAuthorLink (href, base) {
    return this.normalizeLink(href, base)
  }

  sanitizeHtmlConfig () {
    return {
      // based on: https://www.amazon.com/gp/feature.html/ref=amb_link_357754562_1?ie=UTF8&docId=1000729901&pf_rd_m=ATVPDKIKX0DER&pf_rd_s=center-10&pf_rd_r=P6ATRSS3E2FJJ5ME5QR2&pf_rd_t=1401&pf_rd_p=1343223442&pf_rd_i=1000729511
      // plus ao3's https://archiveofourown.org/help/html-help.html
      allowedTags: qw`
        a abbr acronym address article aside b big blockquote body br
        caption center cite code col colgroup dd del dfn div dl dt em
        figcaption figure footer h1 h2 h3 h4 h5 h6 head header hgroup hr
        html i img ins kbd li link mark menu ol output p pre q ruby rp rt s samp
        section small source span strike strong style sub sup table tbody td
        tfoot th thead time title tr u ul var wbr nav summary meta`,
      allowedAttributes: {
        html: qw`xmlns:epub`,
        img: qw`src width height alt`,
        a: qw`href name target`,
        '*': qw`style id epub:type`,
        meta: qw`charset`
      },
      allowedSchemes: qw`http https`,
      allowedSchemesByTag: {
        img: qw`data http https`
      },
      parser: {
        lowerCaseAttributeNames: true
      },
      transformTags: {
        a: (tagName, attribs) => { return this.cleanLinks(tagName, attribs) }
      }
    }
  }
  cleanLinks (tagName, attribs) {
    if (/^(mailto|ftp):/i.test(attribs.href)) {
      return {tagName: 'span'}
    }
    return {tagName: tagName, attribs: attribs}
  }
  countStoryWords (chapter) {
    const wordcount = require('@iarna/word-count')
    return wordcount(chapter.$content.text().trim())
  }
  async getUserInfo (fetch, name, link) {
    return {name, link}
  }
}

Site.registered = []

module.exports = Site
