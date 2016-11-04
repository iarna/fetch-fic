'use strict'
module.exports = getFic
var Bluebird = require('bluebird')
var getChapter = require('./get-chapter.js')
var cheerio = require('cheerio')
var normalizeLink = require('./normalize-link.js')
var ThreadURL = require('./thread-url.js')
var chapterFilename = require('./chapter-filename.js')
var Readable = require('readable-stream').Readable
var inherits = require('util').inherits
var FicStream = require('./fic-stream.js')

function concurrently (_todo, concurrency, forEach) {
  var todo = Object.assign([], _todo)
  var run = 0
  var active = 0
  var aborted = false
  return new Bluebird(function (resolve, reject) {
    function runNext () {
      if (aborted) return
      if (active === 0 && todo.length === 0) return resolve()
      while (active < concurrency && todo.length) {
        ++active
        forEach(todo.shift(), run++).then(function () {
          --active
          runNext()
          return null
        }).catch(function (err) {
          aborted = true
          reject(err)
        })
      }
    }
    runNext()
  })
}

function rewriteLinks (chapter, handleLink) {
  var $ = cheerio.load(chapter.content)
  $('a').each(function (ii, a) {
    var $a = $(a)
    var startAs = $a.attr('href')
    var href = normalizeLink(startAs, null, chapter.base)
    var newHref = handleLink(href, $a)
    $a.attr('href', newHref || href)
  })
  chapter.content = $.html()
}

function rewriteImages (chapter, handleImage) {
  var $ = cheerio.load(chapter.content)
  $('img').each(function (ii, img) {
    var $img = $(img)
    var startAs = $img.attr('src')
    if (!startAs) return
    var src = normalizeLink(startAs, null, chapter.base)
    var newsrc = handleImage(src, $img)
    $img.attr('src', newsrc || src)
  })
  chapter.content = $.html()
}

function findChapter (href, chapters) {
  var matching = chapters.filter(function (index) { return index.link === href })
  return matching && matching[0]
}

function inlineImages (images) {
  return function (src, $img) {
    if (/clear[.]png$/.test(src)) return
    if (!images[src]) {
      var ext = src.match(/([.](?:jpe?g|gif|png))/)
      ext = ext && ext[1]
      if (ext === '.jpeg') ext = '.jpg'
      images[src] = {
        filename: 'image-' + (Object.keys(images).length + 1) + (ext || '.guess.jpg')
      }
    }
    return images[src].filename
  }
}

function linklocalChapters (chapters, externals) {
  return function (href, $a, orElse) {
    if (!orElse) orElse = function () { }
    if ($a.text() === '↑') {
      $a.remove()
      return
    }
    var linkedChapter = findChapter(href, chapters)
    if (linkedChapter) {
      return chapterFilename(linkedChapter)
    } else if (externals[href]) {
      return externals[href]
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
  if (chapters.length === 0) throw new Error("HRM")


  concurrently(chapters, maxConcurrency, function (chapterInfo) {
    return getChapter(fetch, chapterInfo.link).then(function (chapter) {
      chapter.order = chapterInfo.order
      chapter.name = chapterInfo.name
      rewriteImages(chapter, inlineImages(images))
      rewriteLinks(chapter, function (href, $a) {
        return linklocalChapters(chapters, externals)(href, $a, function (href) {
          var thread = new ThreadURL(href)
          if (thread.known.unknown || /[/]members[/]/.test(href)) return
          if (thread.path === '/') return
          externals[href] = {
            name: $a.text(),
            filename: 'external-' + (Object.keys(externals).length + 1) + '.xhtml'
          }
          return externals[href].filename
        })
      })
      return stream.queueChapter(chapter)
    }).catch(function (err) {
      console.error('Error while fetching chapter', chapterInfo, err.stack)
    })
  }).finally(function () {
    return concurrently(Object.keys(externals), maxConcurrency, function (href, exterNum) {
      return getChapter(fetch, href).then(function (external) {
        external.order = 9000 + exterNum
        external.name = 'External Reference #' + exterNum + ': ' + externals[href].name
        external.filename = externals[href].filename
        rewriteImages(external, inlineImages(images))
        rewriteLinks(external, linklocalChapters(chapters, externals))
        return stream.queueChapter(external)
      }).catch(function (err) {
        console.error('Warning, skipping external ' + href + ': ' + err)
        return stream.queueChapter({
          order: 9000 + exterNum,
          name: 'External Reference #' + exterNum + ': ' + externals[href].name,
          filename: externals[href].filename,
          content: '<p>External link to <a href="' + href + '">' + href + '</a></p><pre>' + err.stack + '</pre>'
        })
      })
    })
  }).finally(function () {
    return concurrently(Object.keys(images), maxConcurrency, function (src, imageNum) {
      return fetch(src, null, true).then(function (imageData) {
        return stream.queueChapter({
          image: true,
          filename: images[src].filename,
          content: imageData[1]
        })
      })
    })
  }).finally(function () {
    return stream.queueChapter(null)
  }).catch(function (err) {
    console.error('Error in get fic ' + err)
  })
  return stream
}
