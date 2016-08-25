'use strict'
var Bluebird = require('bluebird')
var rawFetch = require('node-fetch');
rawFetch.Promise = Bluebird
var url = require('url')
var cheerio = require('cheerio')
var EpubGenerator = require('epub-generator')
var sanitizeHtml = require('sanitize-html')

module.exports = xenforoToEpub


var knownSites = {
  'forums.sufficientvelocity.com': true,
  'forums.spacebattles.com': true,
  'forum.questionablequesting.com': true
}

function xenforoToEpub (toFetch, cookie) {
  function fetch (toFetch) {
    var options
    if (cookie) {
      options = {headers: {'Cookie': 'xf_session=' + cookie}}
    }
    return rawFetch(toFetch, options)
  }

  return ficToEpub(fetchFic(threadmarkURL(toFetch))).then(function (epub) {
    var filename = filenameize(epub.title || 'default') + '.epub'
    epub.filename = filename
    return epub
  })

  function threadmarkURL (toFetchURL) {
    var toFetch = url.parse(toFetchURL)
    if (!knownSites[toFetch.hostname]) {
      console.error('WARNING: Has not yet been tested with ' + toFetch.hostname + ', may not work.')
    }
    toFetch.hash = ''
    var threadMatch = /^([/]threads[/][^/]+\.\d+)(?:[/].*)?$/
    if (threadMatch.test(toFetch.pathname)) {
      toFetch.pathname = toFetch.pathname.replace(threadMatch, '$1/threadmarks')
    } else {
      console.error("WARNING: This does not appear to be a thread URL, can't find threadmarks: ", toFetchURL)
    }
    return url.format(toFetch)
  }

  function fetchFic (toFetch) {
    var rawThreadmarks = fetch(toFetch)
    var threadMarks = extractThreadmarks(toFetch, rawThreadmarks)
    return fetchFicFromThreadmarks(toFetch, threadMarks)
  }

  function extractThreadmarks (toFetch, rawThreadmarks) {
    return rawThreadmarks.then(function (res) {
      return res.text()
    }).then(function (html) {
      var $ = cheerio.load(html)
      var base = $('base').attr('href') || toFetch
      var links = $('li.primaryContent.memberListItem > a')
      var threadMarks = []
      links.each(function () {
        var name = $(this).text().trim()
        var link = $(this).attr('href')
        threadMarks.push({name: name, link: url.resolve(base, link)})
      })
      if (threadMarks.length === 0) console.log(html)
      return threadMarks
    })
  }

  function fetchFicFromThreadmarks (toFetch, threadmarks) {
    return Bluebird.map(threadmarks, function (section) { return fetchSection(toFetch, section) },
      {concurrency: 4})
  }

  function fetchSection (toFetch, section) {
    var link, id
    return fetch(section.link).then(function (res) {
      link = res.url
      id = url.parse(link).hash || ''
      console.log('Loading', link, 'with id', id)
      return res.text()
    }).then(function (html) {
      var $ = cheerio.load(html)
      var content
      if (id !== '') {
        content = $(id + ' article')
      } else {
        content = $($('article')[0])
      }
      if (content.length == 0) {
        console.log('with content', html)
        process.exit()
      }
      var author = $($('a.username')[0])
      var authorUrl = author.attr('href')
      var authorName = author.text()
      var workTitle = $('meta[property="og:title"]').attr('content')
      if (!workTitle) workTitle = $('div.titleBar h1').text().replace(/^\[\w+\] /,'')
      var started = $('span.DateTime')
      if (!started.length) started = $('abbr.date-time')
      return {
        workLink: toFetch.replace(/[/]threadmarks$/,''),
        workTitle: workTitle || '',
        author: authorName,
        section: section.name,
        sectionLink: link,
        content: content.html(),
        started: started.length ? started.text() : ''
      }
    })
  }

  function filenameize (str) {
    return str.replace(/\W/g, '-').replace(/--+/g, '-').replace(/^-|-$/, '').toLowerCase()
  }

  function ficToEpub (chapters) {
    return new Bluebird(function (resolve) {
      var epub
      chapters.each(function (chapter) {
        if (!epub) {
          epub = new EpubGenerator({
            author: chapter.author,
            title: chapter.workTitle,
          })
          epub.author = chapter.author
          epub.title = chapter.workTitle
          resolve(epub)
          epub.add('title.html', 
            '<div style="text-align: center;">'+
            '<h1>' + chapter.workTitle + '</h1>' +
            '<h3>' + chapter.author + '</h3>' +
            '<p>URL: ' + '<a href="' + chapter.workLink + '">' + chapter.workLink + '</a></p>' +

   
            '</div>',
            {mimetype: 'text/html', toc: true, title: 'Title Page'})
        }
        epub.add(filenameize('section-' + chapter.section) + '.html', canonicalize(sanitizeHtml(desmiley(chapter.content))), {
          mimetype: 'text/html',
          toc: true,
          title: chapter.section
        })
      }).then(function () {
        if (epub) epub.end()
        if (!epub) console.error('nothing outputed')
      })
    })
  }

  function desmiley (html) {
    var desmiled = html
      .replace(/<img[^>]* class="[^"]*mceSmilie1[^"]*"[^>]*>/g, '😀')
      .replace(/<img[^>]* alt="(:[)])"[^>]*>/g, '$1')
    return desmiled
  }

  function canonicalize (html) {
    return '<!DOCTYPE html>\n' +
      '<html><head><meta charset="utf-8"></head><body>' +
      html +
      '</body></html>'
  }
}
