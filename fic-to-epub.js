'use strict'
module.exports = ficToEpub
var Streampub = require('streampub')
var chapterFilename = require('./chapter-filename.js')
var sanitizeHtml = require('sanitize-html')
var ms = require('mississippi')
var url = require('url')
var fs = require('fs')

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

  if (meta.cover) {
    epub.write(Streampub.newCoverImage(fs.createReadStream(meta.cover)))
  } else {
    var title =
      '<div style="text-align: center;">' +
      '<h1>' + meta.title + '</h1>' +
      '<h3>' + meta.author + '</h3>' +
      '<p>URL: ' + '<a href="' + meta.link + '">' + meta.link + '</a></p>' +
      '</div>'
    epub.write(Streampub.newChapter('Title Page', title, 0, 'top.xhtml'))
  }
  return ms.pipeline.obj(ms.through.obj(transformChapter), epub)
}

function andMatches (pattern) {
  return function (item) { return pattern.test(item) }
}

function transformChapter (chapter, _, done) {
  if (chapter.image) {
    this.push(Streampub.newFile(chapter.filename, chapter.content))
    return done()
  }
  var index = chapter.order != null && (1 + chapter.order)
  var name = chapter.name || chapter.order && "Chapter " + index
  var filename = chapterFilename(chapter)
  var content = sanitizeHtml(
    (name ? '<title>' + name.replace(/&/g,'&amp;').replace(/</g, '&lt;') + '</title>' : '') +
    '<article>' + chapter.content + '</article>', sanitizeHtmlConfig())
  this.push(Streampub.newChapter(name, content, index, filename))
  done()
}

function sanitizeHtmlConfig () {
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
      a: cleanLinks,
      img: andCleanImages()
    }
  }
}

function cleanLinks (tagName, attribs) {
  if (/^(mailto|ftp):/i.test(attribs.href)) {
    return {tagName: 'span'}
  }
  return {tagName: tagName, attribs: attribs}
}

function andCleanImages () {
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
    if (!attribs.src || /^http/.test(attribs.src)) {
      return {tagName: 'span', text: ''}
    }
    return {tagName: tagName, attribs: attribs}
  }
}