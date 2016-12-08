'use strict'
module.exports = getFic
const Bluebird = require('bluebird')
const Site = require('./site.js')
const cheerio = require('cheerio')
const chapterFilename = require('./chapter-filename.js')
const Readable = require('readable-stream').Readable
const inherits = require('util').inherits
const FicStream = require('./fic-stream.js')
const path = require('path')
const url = require('url')
const html = require('html-template-tag')

function concurrently (_todo, concurrency, forEach) {
  const todo = Object.assign([], _todo)
  let run = 0
  let active = 0
  let aborted = false
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
  const $ = cheerio.load(chapter.content)
  $('a').each((ii, a) => {
    const $a = $(a)
    const startAs = $a.attr('href')
    if (!startAs) {
      $a.remove()
      return
    }
    if (startAs[0] === '#') return
    const src = url.resolve(chapter.base, startAs)
    const newHref = handleLink(fic.normalizeLink(src, chapter.base), $a)
    $a.attr('href', newHref || src)
  })
  chapter.content = $.html()
}

function rewriteIframes (fic, chapter) {
  const $ = cheerio.load(chapter.content)
  $('iframe').each((ii, iframe) => {
    const $iframe = $(iframe)
    const src = url.resolve(chapter.base, $iframe.attr('src'))
    $iframe.replaceWith(`<a href="${src}">Video Link</a>`)
  })
  chapter.content = $.html()
}

function rewriteImages (fic, chapter, handleImage) {
  const $ = cheerio.load(chapter.content)
  $('img').each((ii, img) => {
    const $img = $(img)
    const startAs = ($img.attr('src') || '').replace(/(https?:[/])([^/])/, '$1/$2')
    if (!startAs) return
    const src = url.resolve(chapter.base, startAs)
    if (!url.parse(src).hostname) return
    const newsrc = handleImage(fic.normalizeLink(src, chapter.base), $img)
    $img.attr('src', newsrc || src)
  })
  chapter.content = $.html()
}

function findChapter (href, fic) {
  const matching = fic.chapters.filter(index => fic.normalizeLink(index.link) === fic.normalizeLink(href))
  return matching && matching[0]
}

function inlineImages (images) {
  return (src, $img) => {
    if (/clear[.]png$/.test(src)) return // xenforo
    if (/Special:CentralAutoLogin/.test(src)) return // wikipedia
    src = src.replace(/^https:[/][/]api[.]imgble[.]com[/](.*)[/]\d+[/]\d+$/, '$1')
    if (!images[src]) {
      const ext = src.match(/([.](?:jpe?g|gif|png))/i) || src.match(/([.]svg)/i)
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
    const linkedChapter = findChapter(href, fic)
    if (linkedChapter) {
      return chapterFilename(linkedChapter)
    } else if (externals[href]) {
      return externals[href].filename
    } else {
      return orElse(href) || href
    }
  }
}

function getFic (fetch, fic) {
  const stream = new FicStream({highWaterMark: 8})
  const externals = {}
  const images = {}
  const chapters = fic.chapters
  const maxConcurrency = 40 // limit saves memory, not network, network is protected elsewhere

  fetch.gauge.show(`Fetching chapters (${chapters.length})…`)
  concurrently(chapters, maxConcurrency, (chapterInfo) => {
    return fic.getChapter(fetch, chapterInfo.fetchFrom || chapterInfo.link).then((chapter) => {
      chapter.order = chapterInfo.order
      const plainName = chapterInfo.name
      chapter.name = chapterInfo.name = plainName + (chapterInfo.author ? ` (${chapter.author})` : '')
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
            const site = Site.fromUrl(href)
          } catch (ex) {
            return
          }
          externals[href] = {
            name: $a.text(),
            filename: `external-${Object.keys(externals).length + 1}.xhtml`,
            requestedBy: chapterInfo
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
      const externalInfo = externals[href]
      return fic.getChapter(fetch, href).then((external) => {
        external.order = 9000 + exterNum
        const name = external.name || external.ficTitle
        let header = ''
        const linkSource = externalInfo.requestedBy.link || externalInfo.requestedBy.fetchFrom
        header += `<div>Linked to from: <a href="${linkSource}">${externalInfo.requestedBy.name}</a></div>`
        const byline = !external.author ? ''
          : (!external.authorUrl ? external.author : html`<a href="${external.authorUrl}">${external.author}</a>`)
        if (name) {
          const headerName = html`${name}`
          header += `<header><h2><a external="false" href="${href}">${headerName}</a>${byline ? ' by ' + byline : ''}</h2></header>`
        } else if (byline) {
          const wrappableLink = href.replace(/(.....)/g, '$1<wbr>')
          header += `<header><h2><div style="font-size: 11px"><a external="false" href="${href}">${wrappableLink}</a></div>`
          header += `by ${byline}</h2></header>`
        }
        external.content = `${header}<hr>${external.content}`
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
    if (fic.cover) {
      if (/:/.test(fic.cover)) {
        fetch.tracker.addWork(1)
        fetch.gauge.show('Fetching cover…')
        return fetch(fic.cover).spread((meta, imageData) => {
          return stream.queueChapter({
            cover: true,
            content: imageData
          })
        }).catch(err => console.error(`Error while fetching cover ${fic.cover}: ${require('util').inspect(err)}`))
      } else {
        return stream.queueChapter({
          cover: true,
          content: fs.createReadStream(fic.cover)
        })
      }
    }
  }).then(() => {
    return stream.queueChapter(null)
  }).catch(err => {
    console.error(`Error in get fic ${err.stack}`)
  })
  return stream
}
