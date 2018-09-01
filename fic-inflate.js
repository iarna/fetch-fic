'use strict'
module.exports = ficInflate

const Bluebird = require('bluebird')
const qw = require('qw')

const progress = use('progress')

// Take a fic and fetch all its chapters and ensure its per-chapter metadata
// is fully complete.

function ficInflate (fic, fetch, tracker) {
  if (!tracker) tracker = progress.tracker
  return Bluebird.resolve(fic).then(fic => {
    const fics = [fic].concat(fic.fics)
    const completion = new Map()
    for (let fic of fics) {
      completion.set(fic, tracker.newItem(fic.title, fic.chapters.length))
    }
    return Bluebird.map(fics, fic => {
      const tracker = completion.get(fic)
      process.emit('debug', 'Inflating', fic.title, 'chapters:', fic.chapters.length)
      let words = 0
      return Bluebird.map(fic.chapters, chapterInfo => {
        const chapterContent = chapterInfo.getContent(fetch)
        return progress.completeWorkWhenResolved(chapterContent, tracker).then(chapter => {
          process.emit('debug', `Got content for #${chapterInfo.order}: ${chapterInfo.name}`)
          progress.show(fic.title, `${chapterInfo.name}`)
          chapterInfo.words = chapter.words
          chapterInfo.tags = chapter.tags
          words += chapter.words
          if (chapterInfo.link == null) chapterInfo.link = chapter.chapterLink
          for (let prop of qw`name author authorUrl created modified headings`) {
            if (chapterInfo[prop] == null) chapterInfo[prop] = chapter[prop]
          }
          if (chapterInfo.author === fic.author || chapterInfo.authorUrl === fic.authorUrl) {
            fic.author = chapterInfo.author
            fic.authorUrl = chapterInfo.authorUrl
            chapterInfo.author = null
            chapterInfo.authorUrl = null
          }
        }).catch(err => {
          chapterInfo.error = err
          process.emit('error', err.message)
        })
      }).finally(() => {
        if (!fic.words) fic.words = words
        if (fic.chapters.length) {
          const firstChapter = fic.chapters[0]
          const lastChapter = fic.chapters[fic.chapters.length - 1]
          if (firstChapter.created == null && firstChapter.modified == null && fic.created != null) {
            firstChapter.created = fic.created
          }
          if (lastChapter.created == null && lastChapter.modified == null && fic.modified != null) {
            lastChapter.modified = fic.modified
          }
        }
        tracker.finish()
      })
    })
  }).then(() => fic)
}
