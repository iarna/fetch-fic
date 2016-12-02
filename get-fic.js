'use strict'
module.exports = getFic
var Bluebird = require('bluebird')
var Site = require('./site.js')
var cheerio = require('cheerio')
var chapterFilename = require('./chapter-filename.js')
var Readable = require('readable-stream').Readable
var inherits = require('util').inherits
var FicStream = require('./fic-stream.js')
var path = require('path')
var url = require('url')
var html = require('html-template-tag')

function concurrently (_todo, concurrency, forEach) {
  var todo = Object.assign([], _todo)
  var run = 0
  var active = 0
  var aborted = false
  return new Bluebird((resolve, reject) => {
    function runNext () {
      if (aborted) return
      if (active === 0 && todo.length === 0) return resolve()
      while (active < concurrency && todo.length) {
        ++active
        forEach(todo.shift(), run++).then(() => {
          --active
          runNext()
          return null
        }).catch(err => {
          aborted = true
          reject(err)
        })
      }
    }
    runNext()
  })
}

function rewriteLinks (fic, chapter, handleLink) {
  var $ = cheerio.load(chapter.content)
  $('a').each((ii, a) => {
    var $a = $(a)
    var startAs = $a.attr('href')
    if (!startAs) {
      $a.remove()
      return
    }
    if (startAs[0] === '#') return
    var src = url.resolve(chapter.base, startAs)
    var newHref = handleLink(fic.normalizeLink(src, chapter.base), $a)
    $a.attr('href', newHref || src)
  })
  chapter.content = $.html()
}

function rewriteIframes (fic, chapter) {
  var $ = cheerio.load(chapter.content)
  $('iframe').each((ii, iframe) => {
    var $iframe = $(iframe)
    var src = url.resolve(chapter.base, $iframe.attr('src'))
    $iframe.replaceWith(`<a href="${src}">Video Link</a>`)
  })
  chapter.content = $.html()
}

function rewriteImages (fic, chapter, handleImage) {
  var $ = cheerio.load(chapter.content)
  $('img').each((ii, img) => {
    var $img = $(img)
    var startAs = ($img.attr('src') || '').replace(/(https?:[/])([^/])/, '$1/$2')
    if (!startAs) return
    var src = url.resolve(chapter.base, startAs)
    if (!url.parse(src).hostname) return
    var newsrc = handleImage(fic.normalizeLink(src, chapter.base), $img)
    $img.attr('src', newsrc || src)
  })
  chapter.content = $.html()
}

function findChapter (href, fic) {
  var matching = fic.chapters.filter(index => fic.normalizeLink(index.link) === fic.normalizeLink(href))
  return matching && matching[0]
}

function inlineImages (images) {
  return (src, $img) => {
    if (/clear[.]png$/.test(src)) return
    src = src.replace(/^https:[/][/]api[.]imgble[.]com[/](.*)[/]\d+[/]\d+$/, '$1')
    if (!images[src]) {
      var ext = src.match(/([.](?:jpe?g|gif|png|svg))/i)
      ext = ext && ext[1]
      if (ext === '.svg' && /wikia.nocookie.net/.test(src)) ext = '.png'
      if (ext === '.jpeg') ext = '.jpg'
      images[src] = {
        filename: `image-${Object.keys(images).length + 1}${ext || '.guess.jpg'}`
      }
    }
    return images[src].filename
  }
}

function linklocalChapters (fic, externals) {
  return (href, $a, orElse) => {
    if (!orElse) orElse = () => { }
    if ($a.text() === '↑') {
      $a.remove()
      return
    }
    if ($a.attr('external') === 'false') return
    var linkedChapter = findChapter(href, fic)
    if (linkedChapter) {
      return chapterFilename(linkedChapter)
    } else if (externals[href]) {
      return externals[href].filename
    } else {
      return orElse(href) || href
    }
  }
}

function getFic (fetch, fic, maxConcurrency) {
  if (!maxConcurrency) maxConcurrency = 4
  var stream = new FicStream({highWaterMark: maxConcurrency * 2})
  var externals = {}
  var images = {}
  var chapters = fic.chapters

  fetch.gauge.show(`Fetching chapters (${chapters.length})…`)
  concurrently(chapters, maxConcurrency, (chapterInfo) => {
    return fic.getChapter(fetch, chapterInfo.fetchFrom || chapterInfo.link).then((chapter) => {
      chapter.order = chapterInfo.order
      chapter.name = chapterInfo.name + (chapterInfo.author ? ` (${chapter.author})` : '')
      if (fic.chapterHeadings || chapterInfo.headings) {
        const headerName = html`${chapterInfo.name}`
        const byline = !chapterInfo.author ? ''
          : (' by ' + (!chapterInfo.authorUrl ? chapterInfo.author
            : html`<a href="${chapterInfo.authorUrl}">${chapterInfo.author}</a>`))
        chapter.content = `<header><h2>${headerName}${byline}</h2></header>` + chapter.content
      }
      rewriteImages(fic, chapter, inlineImages(images))
      rewriteLinks(fic, chapter, (href, $a) => {
        return linklocalChapters(fic, externals)(href, $a, (href) => {
          if (!chapterInfo.externals || !fic.externals) return
          try {
            var site = Site.fromUrl(href)
          } catch (ex) {
            return
          }
          externals[href] = {
            name: $a.text(),
            filename: `external-${Object.keys(externals).length + 1}.xhtml`
          }
          return externals[href].filename
        })
      })
      rewriteIframes(fic, chapter)
      return stream.queueChapter(chapter)
    }).catch((err) => {
      console.error('Error while fetching chapter', chapterInfo, err.stack)
    })
  }).then(() => {
    fetch.tracker.addWork(Object.keys(externals).length)
    fetch.gauge.show(`Fetching externals (${Object.keys(externals).length})…`)
    const externalCount = Object.keys(externals).length
    const pages = externalCount === 1 ? 'page' : 'pages'
    return concurrently(Object.keys(externals), maxConcurrency, (href, exterNum) => {
      return fic.getChapter(fetch, href).then((external) => {
        external.order = 9000 + exterNum
        external.name = !exterNum && `External References (${externalCount} ${pages})`
        external.filename = externals[href].filename
        rewriteImages(fic.site, external, inlineImages(images))
        rewriteLinks(fic.site, external, linklocalChapters(fic, externals))
        rewriteIframes(fic, external)
        return stream.queueChapter(external)
      }).catch((err) => {
        console.error(`Warning, skipping external ${href}: ${err.stack}`)
        return stream.queueChapter({
          order: 9000 + exterNum,
          name: `External Reference #${exterNum + 1}: ${externals[href].name}`,
          filename: externals[href].filename,
          content: html`<p>External link to <a href="${href}">${href}</a></p><pre>${err.stack}</pre>`
        })
      })
    })
  }).then(() => {
    fetch.tracker.addWork(Object.keys(images).length)
    fetch.gauge.show(`Fetching images (${Object.keys(images).length})…`)
    return concurrently(Object.keys(images), maxConcurrency, (src, imageNum) => {
      return fetch(src).spread((meta, imageData) => {
        return stream.queueChapter({
          image: true,
          filename: images[src].filename,
          content: imageData
        })
      }).catch(err => console.error(`Error while fetching image ${src}: ${require('util').inspect(err)}`))
    })
  }).then(() => {
    return stream.queueChapter(null)
  }).catch(err => {
    console.error(`Error in get fic ${err.stack}`)
  })
  return stream
}
