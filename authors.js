'use strict'
const qw = require('qw')
const Site = require('./site.js')

class Authors extends Array {
  constructor (authors) {
    super()
    this.byLink = new Map()
    this.byName = new Map()
    if (authors) authors.forEach(author => {
      this.add(new Author(author))
    })
  }
  has (au) {
    if (au == null) return false
    if (this.byLink.has(au)) return true
    if (this.byName.has(au.toLowerCase())) return true
    try {
      const authorSite = Site.fromUrl(au)
      const nlink = authorSite.normalizeAuthorLink(au)
      if (this.byLink.has(nlink)) return true
      return false
    } catch (_) {
      return false
    }
  }
  get (au) {
    if (this.byLink.has(au)) return this[this.byLink.get(au)]
    if (this.byName.has(au.toLowerCase())) {
      const [ firstId ] = this.byName.get(au.toLowerCase())
      return this[firstId]
    }
    try {
      const authorSite = Site.fromUrl(au)
      const nlink = authorSite.normalizeAuthorLink(au)
      if (this.byLink.has(nlink)) return this[this.byLink.get(nlink)]
      return false
    } catch (_) {
      return false
    }
  }
  getAll (au) {
    if (this.byName.has(au.toLowerCase())) return [...this.byName.get(au.toLowerCase())].map(_ => this[_])
    if (this.byLink.has(au)) return [this[this.byLink.get(au)]]
    try {
      const authorSite = Site.fromUrl(au)
      const nlink = authorSite.normalizeAuthorLink(au)
      if (this.byLink.has(nlink)) return [this[this.byLink.get(nlink)]]
      return false
    } catch (_) {
      return false
    }
  }
  add (author) {
    if (!author.name) throw new Error()
    const id = this.length
    this.push(author)
    for (let au of author.account) {
      this.byLink.set(au.link, id)
      if (!this.byName.has(au.name.toLowerCase())) this.byName.set(au.name.toLowerCase(), new Set())
      this.byName.get(au.name.toLowerCase()).add(id)
    }
  }
  remove (index) {
    const author = this[index]
    delete this[index]
    author.account.forEach(ac => {
      this.byLink.delete(ac.link)
      this.byName.get(ac.name.toLowerCase()).delete(index)
    })
  }
  merge (src, dest) {
    let au
    if (typeof src !== 'object') {
      au = this[src]
      this.remove(src)
    } else {
      au = src
    }
    for (let ac of au.account) {
      this[dest].account.push(ac)
      this.byLink.set(ac.link, dest)
      if (!this.byName.has(ac.name.toLowerCase())) this.byName.set(ac.name.toLowerCase(), new Set())
      this.byName.get(ac.name.toLowerCase()).add(dest)
    }
    for (let key of qw`gender dob location twitter tumblr instagram homepage deviantart soundcloud lj reddit fandoms `) {
      if (!au[key]) continue
      const values = Array.isArray(au[key]) ? au[key] : [au[key]]
      for (let value of values) {
        if (!this[dest][key]) {
          this[dest][key] = value
        } else if (Array.isArray(this[dest][key])) {
          if (this[dest][key].indexOf(value) === -1) this[dest][key].push(value)
        } else if (value !== this[dest][key]) {
          this[dest][key] = [this[dest][key], value]
        }
      }
    }
  }

  toJSON () {
    return this.filter(au => au != null).sort((aa, bb)=> aa.name.localeCompare(bb.name))
  }

  static link (name, href) {
    return href || 'unknown:' + name
  }
}

class Author {
  constructor (opts) {
    if (!opts) opts = {}
    this.name = opts.name || undefined
    this.link = opts.link || undefined
    this.gender = opts.gender || undefined
    this.dob = opts.dob || undefined
    this.location = opts.location || undefined
    this.twitter = opts.twitter || undefined
    this.tumblr = opts.tumblr || undefined
    this.instagram = opts.instagram || undefined
    this.homepage = opts.homepage || undefined
    this.deviantart = opts.deviantart || undefined
    this.soundcloud = opts.soundcloud || undefined
    this.lj = opts.lj || undefined
    this.reddit = opts.reddit || undefined
    this.fandoms = opts.fandoms || []
    this.account = new AccountList(this, opts.account)
  }
  toJSON () {
    return {
      name: this.name,
      link: this.link,
      gender: this.gender,
      dob: this.dob,
      location: this.location,
      homepage: this.homepage,
      twitter: this.twitter,
      tumblr: this.tumblr,
      instagram: this.instagram,
      deviantart: this.deviantart,
      soundcloud: this.soundcloud,
      lj: this.lj,
      reddit: this.reddit,
      fandoms: this.fandoms,
      account: this.account
    }
  }
}

const _author = Symbol('author')
class AccountList extends Array {
  constructor (author, accts) {
    super()
    Object.defineProperty(this, _author, {writable: false, value: author})
    if (accts) {
      accts.forEach(acct => this.push(new Account(acct)))
    }
  }
  push (thing) {
    for (let key of qw`name link gender dob location`) {
      if (!this[_author][key] && thing[key]) {
        this[_author][key] = thing[key]
      }
    }
    if (thing.gender && this[_author].gender === 'Unspecified') {
      this[_author].gender = thing.gender
    }
    const existing = this.filter(au => au.link === thing.link)
    if (existing.length) {
      for (let au of existing) {
        for (let key of qw`name link gender dob location image profile`) {
          if (!au[key] && thing[key]) au[key] = thing[key]
        }
      }
      return
    } else {
      if (!thing[_author]) Object.defineProperty(thing, _author, {writable: false, value: this[_author]})
      // we had an Undefined gender, but this new author entry has a profile
      // which MIGHT let us fill it in, so we flip the gender back to empty.
      if (this[_author].gender === 'Unspecified' && thing.profile != null) this[_author].gender = undefined
      return super.push(thing)
    }
  }
}

class Account {
  constructor (opts) {
    if (!opts) opts = {}
    this.name = opts.name || undefined
    this.link = opts.link || undefined
    this.gender = opts.gender || undefined
    this.dob = opts.dob || undefined
    this.location = opts.location || undefined
    this.image = opts.image || undefined
    this.profile = opts.profile || undefined
  }
  toJSON () {
    return {
      name: this.name,
      link: this.link,
      gender: this.gender,
      dob: this.dob,
      location: this.location,
      image: this.image,
      profile: this.profile
    }
  }
}

module.exports = Authors
module.exports.Author = Author
module.exports.Account = Account
