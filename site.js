'use strict'
const url = require('url')
const wordcount = require('wordcount')

const qw = require('qw')

class Site {
  constructor (rawUrl) {
    this.raw = rawUrl
    this.link = this.normalizeLink(rawUrl)
    this.warnings = []
  }
  static register (site) {
    this.registered.push(site)
  }
  static fromUrl (rawUrl) {
    for (const SpecificSite of this.registered) {
      if (SpecificSite.matches(rawUrl)) return new SpecificSite(rawUrl)
    }
    throw new Error('Could not find site handler for ' + rawUrl)
  }

  normalizeLink (href, base) {
    // force ssl
    href = href.replace(/^http:/, 'https:')
    // resolve base url
    if (base) href = url.resolve(base, href)
    return href
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
        tfoot th thead time title tr u ul var wbr nav summary`,
      allowedAttributes: {
        html: qw`xmlns:epub`,
        img: qw`src width height alt`,
        a: qw`href name target`,
        '*': qw`style id epub:type`
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
    return wordcount(chapter.$content.text().trim())
  }
}

Site.registered = []

module.exports = Site

const sitesAvailable = qw`xenforo fanfictionnet deviantart ao3 gravatar
  wp-facebook wikipedia youtube worm generic-image scrivener local`
for (const site of sitesAvailable) {
  Site.register(require(`./site/${site}`))
}
