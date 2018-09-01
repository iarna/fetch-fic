#!/usr/bin/env node
'use strict'
require('@iarna/lib')('util', '.')

const authorFile = `${__dirname}/.authors.json`
const TOML = require('@iarna/toml')
const Fic = use('fic')
const fetchFor = use('get-author-fetch')
const cheerio = require('cheerio')
const fs = use('fs-promises')
const forEach = use('for-each')
const Authors = use('authors')
const Author = use('authors').Author
const Account = use('authors').Account
const qw = require('qw')
const progress = use('progress')
const url = require('url')
const Site = use('site')

const requireInject = require('require-inject')

if (!module.parent) main(process.argv.slice(2)).catch(err => process.exit(console.error(err.stack, JSON.stringify(err, null, 2))))
module.exports = main

async function main (fics) {
  if (!Array.isArray(fics)) fics = [fics]
  const authors = new Authors(JSON.parse(await fs.readFile(authorFile)))
  const work = progress.newWork('fic', fics.length)
  const int = setInterval(async () => {
    await fs.writeFile(authorFile + '.new', JSON.stringify(authors, null, 2))
    await fs.rename(authorFile + '.new', authorFile)
  }, 10000)
  let current
  process.on('unhandledRejection', error => {
    console.log('unhandledRejection in', current, error);
  })
  await forEach(fics, 1, async file => {
    current = file
    progress.show('Loading data ' + file)
    let fic
    try {
       fic = Fic.fromJSON(TOML.parse(await fs.readFile(file)))
    } catch (err) {
      console.error(file, err)
      return
    }
    progress.show('Loading author ' + file)
    const ficAuthors = await getFicUserInfo(fic)
    if (!ficAuthors.length) return
    progress.show('Recording ' + file)
    for (let author of ficAuthors) {
      if (!author.account.length) continue
      let matching = {}
      for (let au of author.account) {
        if (authors.byLink.has(au.link)) matching[authors.byLink.get(au.link)] = true
      }
      let matches = Object.keys(matching)
      if (matches.length === 0) {
        if (author.link) {
          authors.add(author)
        } else {
          process.emit('warn', 'No author link found for', file)
        }
      } else if (matches.length === 1) {
  //      process.emit('warn', 'Merging', author, 'into', authors[matches[0]])
        authors.merge(author, matches[0])
      } else {
        process.emit('warn', 'Multiple author matches for', file, matches.map(n => authors[n].name))
        const top = matches.shift()
        for (let au of matches) {
          authors.merge(au, top)
        }
        authors.merge(author, top)
      }
    }
    work.completeWork(1)
    progress.show('Finished ' + file)
  })
  clearInterval(int)
//  progress.output('Final save\n')
  await fs.writeFile(authorFile + '.new', JSON.stringify(authors, null, 2))
  await fs.rename(authorFile + '.new', authorFile)
}

function hasAuthor (name, link) {
  return link && !(
     (link === 'unknown:' || link === 'unknown:Anonymous')
  || (name && (name === 'Multi Author' || name === 'Anonymous' || name === 'HPFandom_archivist' || name === 'orphan_account' || name === 'DragoLord19D' || name === 'PassnPlay'))
  )
}

async function getFicUserInfo (fic) {
  const authors = []
  const sites = {}
  for (let au of fic.authors) {
    const author = new Author()
    if (!hasAuthor(au.name, au.link)) continue
    authors.push(author)
    try {
      const authorSite = Site.fromUrl(au.link)
      sites[authorSite.publisherName] = au.link
      progress.show('Loading author ' + au.link)
      try {
        const user = await authorSite.getUserInfo(fetchFor(au.link), au.name, au.link)
        if (hasAuthor(user.name, user.link)) {
          author.account.push(new Account(user))
        }
      } catch (_) {
        if (hasAuthor(au.name, au.link)) {
          author.account.push(new Account({name: au.name, link: au.link}))
        }
      }
    } catch (_) {
      continue
    }
    author.fandoms = fic.tags.filter(t => /^fandom:/.test(t)).map(t => t.slice(7))
  }

  if (authors.length > 1) return authors
  let author = authors[0] || new Author()

  let links = (fic.authorUrl ? [fic.link] : [])
  if (fic.authors.length === 1) links = links.concat(fic.altlinks || [])
  if (fic.updateFrom) links.push(fic.updateFrom)
  await forEach(links, async link => {
    const authorSite = Site.fromUrl(link)
    let user
    if (sites[authorSite.publisherName]) return
    try {
      let fic
      if (authorSite.canScrape) {
        fic = await Fic.scrapeFromUrl(fetchFor(link), link, 'no-chapters')
      } else {
        fic = await Fic.fromUrl(fetchFor(link), link, 'no-chapters')
      }
      if (fic.authorUrl) {
        sites[authorSite.publisherName] = fic.authorUrl
        user = await authorSite.getUserInfo(fetchFor(link), fic.author, fic.authorUrl)
      } else {
        user = new Account({name: fic.author, link: fic.authorUrl})
      }
    } catch (_) {
      user = new Account({name: fic.author, link: fic.authorUrl})
    }
    if (hasAuthor(user.name, user.link)) {
      author.account.push(user)
    }
  })
  return authors
}
