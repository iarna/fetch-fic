'use strict'
module.exports = ficInflate

const Bluebird = require('bluebird')
const qw = require('qw')
const progress = require('./progress')
const countStoryWords = require('./count-story-words.js')

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
      fic.words = 0
      return Bluebird.map(fic.chapters, chapter => {
        const chapterContent = fic.getChapter(fetch, chapter.fetchWith())
        return progress.completeWorkWhenResolved(chapterContent, tracker).then(content => {
          progress.show(fic.title, `${chapter.name}`)
          chapter.words = countStoryWords(content)
          fic.words += chapter.words
          if (chapter.link == null) chapter.link = content.chapterLink
          for (let prop in qw`name author authorUrl created modified headings`) {
            if (chapter[prop] == null) chapter[prop] = content[prop]
          }
          if (chapter.author === fic.author || chapter.authorUrl === fic.authorUrl) {
            chapter.author = null
            chapter.authorUrl = null
          }
        })
      }).finally(() => tracker.finish())
    })
  }).thenReturn(fic)
}
