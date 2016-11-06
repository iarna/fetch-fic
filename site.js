'use strict'
var url = require('url')

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
    for (const site of this.registered) {
      if (site.matches(rawUrl)) return new site(rawUrl)
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
      // from: https://www.amazon.com/gp/feature.html/ref=amb_link_357754562_1?ie=UTF8&docId=1000729901&pf_rd_m=ATVPDKIKX0DER&pf_rd_s=center-10&pf_rd_r=P6ATRSS3E2FJJ5ME5QR2&pf_rd_t=1401&pf_rd_p=1343223442&pf_rd_i=1000729511
      allowedTags: [
        'a', 'address', 'article', 'aside', 'b', 'blockquote', 'body', 'br',
        'caption', 'center', 'cite', 'code', 'col', 'dd', 'del', 'dfn', 'div',
        'dl', 'dt', 'em', 'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3',
        'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'i', 'img',
        'ins', 'kbd', 'li', 'link', 'mark', 'menu', 'ol', 'output', 'p', 'pre',
        'q','rp', 'rt', 'samp', 'section', 'small', 'source', 'span', 'strong',
        'style', 'strike', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th',
        'thead', 'time', 'title', 'tr', 'u','ul', 'var', 'wbr', 'nav', 'summary'
      ],
      allowedAttributes: {
        img: [ 'src', 'width', 'height', 'alt' ],
        a: [ 'href', 'name', 'target' ],
        '*': [ 'style' ]
      },
      allowedSchemes: [ 'http', 'https' ],
      allowedSchemesByTag: {
        img: [ 'data', 'http', 'https' ]
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
}

Site.registered = []

module.exports = Site

for (const site of ['./site-xenforo.js', './site-fanfictionnet.js', './site-deviantart.js', './site-ao3.js']) {
  Site.register(require(site))
}
