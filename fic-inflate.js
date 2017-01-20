'use strict'
module.exports = ficInflate

const Bluebird = require('bluebird')
const qw = require('qw')

const progress = use('progress')

// Take a fic and fetch all its chapters and ensure its per-chapter metadata
// is fully complete.

function ficInflate (fic, fetch, tracker) {
  if (!tracker) tracker = progress.tracker
  return fic.then(fic => {
    const fics = [fic].concat(fic.fics)
    const completion = new Map()
    for (let fic of fics) {
      completion.set(fic, tracker.newItem(fic.title, fic.chapters.length))
    }
    return Bluebird.map(fics, fic => {
      const tracker = completion.get(fic)
      let words = 0
      return Bluebird.map(fic.chapters, chapterInfo => {
        const chapterContent = chapterInfo.getContent(fetch)
        return progress.completeWorkWhenResolved(chapterContent, tracker).then(chapter => {
          progress.show(fic.title, `${chapterInfo.name}`)
          chapterInfo.words = chapter.words
          words += chapter.words
          if (chapterInfo.link == null) chapterInfo.link = chapter.chapterLink
          for (let prop of qw`name author authorUrl created modified headings`) {
            if (chapterInfo[prop] == null) chapterInfo[prop] = chapter[prop]
          }
          if (chapterInfo.author === fic.author || chapterInfo.authorUrl === fic.authorUrl) {
            chapterInfo.author = null
            chapterInfo.authorUrl = null
          }
        })
      }).finally(() => {
        if (!fic.words) fic.words = words
        tracker.finish()
      })
    })
  }).thenReturn(fic)
}
