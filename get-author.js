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
  await forEach(fics, 1, async file => {
    progress.show('Loading data ' + file)
    let fic
    try {
       fic = Fic.fromJSON(TOML.parse(await fs.readFile(file)))
    } catch (err) {
      err.file = file
      throw err
    }
    progress.show('Loading author ' + file)
    const author = await getFicUserInfo(fic)
    if (!author) return
    progress.show('Recording ' + file)
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
    work.completeWork(1)
    progress.show('Finished ' + file)
  })
  clearInterval(int)
  await fs.writeFile(authorFile + '.new', JSON.stringify(authors, null, 2))
  await fs.rename(authorFile + '.new', authorFile)
}

function hasAuthor (name, link) {
  return !((link && (link === 'unknown:' || link === 'unknown:Anonymous')) || (name && (name === 'Anonymous' || name === 'HPFandom_archivist' || name === 'The Midnight Archive')))
}

async function getFicUserInfo (fic) {
  const sites = {}
  const author = new Author()
  await forEach(fic.authors, async au => {
    if (hasAuthor(au.name, au.link)) {
      try {
        const authorSite = Site.fromUrl(au.link)
        sites[authorSite.publisherName] = au.link
        try {
          const user = await authorSite.getUserInfo(fetchFor(au.link), au.name, au.link)
          author.account.push(new Account(user))
        } catch (_) {
          console.error(_)
          author.account.push(new Account({name: au.name, link: au.link}))
        }
      } catch (_) {
        console.error(_)
        return
      }
    }
  })
  author.fandoms = fic.tags.filter(t => /^fandom:/.test(t)).map(t => t.slice(7))

  let links = (fic.authorUrl ? [fic.link] : [])
  if (fic.authors.length === 1) links = links.concat(fic.altlinks || [])
  if (fic.updateFrom) links.push(fic.updateFrom)
  await forEach(links, async link => {
    const authorSite = Site.fromUrl(link)
    let user
    if (sites[authorSite.publisherName]) return
    try {
      const fic = await Fic.scrapeFromUrl(fetchFor(link), link, 'no-chapters')
      sites[authorSite.publisherName] = fic.authorUrl
      user = await authorSite.getUserInfo(fetchFor(link), fic.author, fic.authorUrl)
    } catch (_) {
      try {
        const fic = await Fic.fromUrl(fetchFor(link), link, 'no-chapters')
        sites[authorSite.publisherName] = fic.authorUrl
        user = await authorSite.getUserInfo(fetchFor(link), fic.author, fic.authorUrl)
      } catch (_) {
        console.error(_)
        user = new Account({name: fic.author, link: fic.authorUrl})
      }
    }
    if (hasAuthor(user.name, user.link)) {
      author.account.push(user)
    }
  })
  return author
}
