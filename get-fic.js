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
    var src = path.relative(startAs, chapter.base)
    var newHref = handleLink(fic.normalizeLink(src, chapter.base), $a)
    $a.attr('href', newHref || src)
  })
  chapter.content = $.html()
}

function rewriteImages (fic, chapter, handleImage) {
  var $ = cheerio.load(chapter.content)
  $('img').each((ii, img) => {
    var $img = $(img)
    var startAs = $img.attr('src')
    if (!startAs) return
    var src = path.relative(startAs, chapter.base)
    if (!path.parse(src).hostname) return
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
    if (!images[src]) {
      var ext = src.match(/([.](?:jpe?g|gif|png|svg))/)
      ext = ext && ext[1]
      if (ext === '.jpeg') ext = '.jpg'
      images[src] = {
        filename: 'image-' + (Object.keys(images).length + 1) + (ext || '.guess.jpg')
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

  concurrently(chapters, maxConcurrency, (chapterInfo) => {
    return fic.getChapter(fetch, chapterInfo.link).then((chapter) => {
      chapter.order = chapterInfo.order
      chapter.name = chapterInfo.name
      rewriteImages(fic, chapter, inlineImages(images))
      rewriteLinks(fic, chapter, (href, $a) => {
        return linklocalChapters(fic, externals)(href, $a, (href) => {
          if (!chapterInfo.externals) return
          try {
            var site = Site.fromUrl(href)
          } catch (ex) {
            return
          }
          externals[href] = {
            name: $a.text(),
            filename: 'external-' + (Object.keys(externals).length + 1) + '.xhtml'
          }
          return externals[href].filename
        })
      })
      return stream.queueChapter(chapter)
    }).catch((err) => {
      console.error('Error while fetching chapter', chapterInfo, err.stack)
    })
  }).finally(() => {
    return concurrently(Object.keys(externals), maxConcurrency, (href, exterNum) => {
      return fic.getChapter(fetch, href).then((external) => {
        external.order = 9000 + exterNum
        external.name = 'External Reference #' + exterNum + ': ' + externals[href].name
        external.filename = externals[href].filename
        rewriteImages(fic.site, external, inlineImages(images))
        rewriteLinks(fic.site, external, linklocalChapters(fic, externals))
        return stream.queueChapter(external)
      }).catch((err) => {
        console.error('Warning, skipping external ' + href + ': ' + err)
        return stream.queueChapter({
          order: 9000 + exterNum,
          name: 'External Reference #' + exterNum + ': ' + externals[href].name,
          filename: externals[href].filename,
          content: '<p>External link to <a href="' + href + '">' + href + '</a></p><pre>' + err.stack + '</pre>'
        })
      })
    })
  }).finally(() => {
    return concurrently(Object.keys(images), maxConcurrency, (src, imageNum) => {
      return fetch(src).spread((meta, imageData) => {
        return stream.queueChapter({
          image: true,
          filename: images[src].filename,
          content: imageData
        })
      })
    })
  }).finally(() => {
    return stream.queueChapter(null)
  }).catch(err => {
    console.error('Error in get fic ' + err)
  })
  return stream
}
