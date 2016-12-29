'use strict'
const path = require('path')

const Bluebird = require('bluebird')
const uuid = require('uuid')

const fs = use('fs-promises')
const Site = use('site')
const promisify = use('promisify')

const rtfToHTML = use('rtf-to-html')

const parseString = promisify(require('xml2js').parseString)


class Scrivener extends Site {
  static matches (siteUrlStr) {
    return /[.]scriv\/?/.test(siteUrlStr)
  }

  constructor (siteUrlStr) {
    super(siteUrlStr)
    this.publisher = 'scrivener'
    this.publisherName = 'Scrivener'
  }

  normalizeLink (href, base) {
    return href
  }

  getFicMetadata (fetch, fic) {
    fic.id = 'urn:uuid:' + uuid.v4()
    fic.publisher = this.publisherName
    fic.updateFrom = fic.link
    fic.link = null
    const basename = path.basename(fic.updateFrom)
    fic.title = basename
    const scrivname = path.join(fic.updateFrom, basename + 'x')
    return this.fromScrivener(fic, scrivname)
  }

  fromScrivener (fic, scrivx) {
    return parseString(fs.readFile(scrivx)).then(data => {
      const props = this.scrivMap(data.ScrivenerProject, 'ProjectProperties')
      fic.title = props.ProjectTitle
      fic.author = props.FullName
      const items = this.scrivBinder(data.ScrivenerProject, 'Binder')
      return this.recurseItems(fic, items)
    })
  }

  recurseItems (fic, items) {
    return Bluebird.each(items, item => {
      if (item.Type === 'TrashFolder' || item.Type === 'ResearchFolder') return
      if (item.Children) return this.recurseItems(fic, item.Children)
      fic.addChapter({
        name: item.Title,
        fetchFrom: path.join(fic.updateFrom, 'Files', 'Docs', item.ID + '.rtf'),
        created: new Date(item.Created),
        modified: new Date(item.Modified),
      })
    })
  }

  scrivValue (obj, prop) {
    return obj[prop][0]
  }

  scrivMap (obj, prop) {
    const item = this.scrivValue(obj, prop)
    const result = {}
    for (let prop in item) {
      result[prop] = this.scrivValue(item, prop)
    }
    return result
  }

  scrivBinder (obj, prop) {
    const item = this.scrivValue(obj, prop)
    return item.BinderItem.map(item => this.scrivBinderItem(item))
  }

  scrivBinderItem (item) {
    const result = {}
    for (let prop in item['$']) {
      result[prop] = item['$'][prop]
    }
    result.Title = this.scrivValue(item, 'Title')
    result.MetaData = this.scrivMap(item, 'MetaData')
    if (item.Children) {
      result.Children = this.scrivBinder(item, 'Children')
    }
    return result
  }

  scrapeFicMetadata (fetch, fic) {
    // There's never any reason to scrape scrivener content.
    return Bluebird.resolve()
  }

  getChapter (fetch, chapter) {
    return rtfToHTML(fs.readFile(chapter, 'ascii')).then(result => {
      return {
        'finalUrl': chapter,
        'content': result
      }
    }).catch(() => { return {finalUrl: chapter, content: ''} })
  }
}
module.exports = Scrivener
