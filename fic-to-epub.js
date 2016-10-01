'use strict'
module.exports = ficToEpub
var Streampub = require('streampub')
var newChapter = Streampub.newChapter
var filenameize = require('./filenameize.js')
var sanitizeHtml = require('sanitize-html')
var ms = require('mississippi')
var url = require('url')


function ficToEpub (meta) {
  var epub = new Streampub({
    title: meta.title,
    author: meta.author,
    authorUrl: meta.authorUrl,
    description: meta.description,
    source: meta.link,
    subject: meta.tags && meta.tags.length && meta.tags.join(','),
    publisher: meta.publisher,
    published: meta.started || meta.created,
    modified: meta.modified
  })

  var title =
    '<div style="text-align: center;">' +
    '<h1>' + meta.title + '</h1>' +
    '<h3>' + meta.author + '</h3>' +
    '<p>URL: ' + '<a href="' + meta.link + '">' + meta.link + '</a></p>' +
    '</div>'
  epub.write(newChapter('Title Page', title, 0, 'top.xhtml'))
  return ms.pipeline.obj(ms.through.obj(transformChapter), epub)
}

function andMatches (pattern) {
  return function (item) { return pattern.test(item) }
}

function transformChapter (chapter, _, done) {
  var index = 1 + chapter.order
  var name = chapter.name
  var filename = filenameize('chapter-' + name) + '.xhtml'
  var content = sanitizeHtml(
    '<title>' + name.replace(/&/g,'&amp;').replace(/</g, '&lt;') + '</title>' +
    chapter.content, sanitizeHtmlConfig(this, chapter))
  this.push(newChapter(name, content, index, filename))
  done()
}

function sanitizeHtmlConfig (stream, chapter) {
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
      a: andCleanLinks(stream, chapter),
      img: andCleanImages(stream, chapter)
    }
  }
}

function andCleanLinks (stream, chapter) {
  return function (tagName, attribs) {
    if (attribs.href) {
      attribs.href = url.resolve(chapter.base, attribs.href)
    }
    //todo: check href against chapter list and if found, create an internal link
    return {tagName: tagName, attribs: attribs}
  }
}

function andCleanImages (stream, chapter) {
  return function (tagName, attribs) {
    if (attribs.class) {
      var classes = attribs.class.trim().split(/\s+/)
      if (classes.some(andMatches(/^mceSmilieSprite$/))) {
        var smilies = classes.filter(andMatches(/^mceSmilie\d+$/))
        var text
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
    if (attribs.src) {
      attribs.src = url.resolve(chapter.base, attribs.src)
      // todo: queue this for fetching and set src to point at a local
      // resource.
    }
    return {tagName: tagName, attribs: attribs}
  }
}