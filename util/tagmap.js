'use strict'
const tomlParse = require('@iarna/toml/parse-string')
const fs = require('fs')
const path = require('path')
const uniq = use('uniq')
const qr = require('@perl/qr')
const flatMap = use('flat-map')

let loaded = false
let tagmap = {}
let replacers = {}
let nextdir = process.cwd()
let checkdir
while (!checkdir || checkdir !== nextdir) {
  checkdir = nextdir
  try {
    const tagmapsrc = fs.readFileSync(`${checkdir}/.tagmap.toml`)
    tagmap = tomlParse(tagmapsrc)
    for (let site in tagmap) {
      replacers[site] = []
      for (let pattern in tagmap[site]) {
        if (/^[/].*[/]$/.test(pattern)) {
          replacers[site].push({search: new RegExp(pattern.slice(1,-1), 'g'), replace: tagmap[site][pattern]})
          delete tagmap[site][pattern]
        } else {
          if (pattern !== pattern.toLowerCase()) {
            tagmap[site][pattern.toLowerCase()] = tagmap[site][pattern]
            delete tagmap[site][pattern]
          }
        }
      }
    }
    loaded = true
    break
  } catch (ex) {
    if (ex.line) throw ex
  }
  nextdir = path.resolve(checkdir, '..')
}
if (!loaded) {
  console.error('Warning: Unable to find tagmap file in path')
}

function filterTag (tags, fw) {
  if (!tags) return
  if (!Array.isArray(tags)) tags = [tags]
  return tags.filter(fw)
}

const charMatcher = /^(character:.*) [(](.+)[)]$|^(character:.+)[(](.{2,})[)]$/
module.exports = function mapTags (site, tags, perFandom) {
  if (!tags) return tags => mapTags(site, tags)
  tags = tags.map(_ => _.trim())
  let fandoms = []
  if (tagmap[site]) {
    if (!perFandom && tagmap[`pre:${site}`]) tags = mapTags(`pre:${site}`, tags, true)
    let newTags = []
    for (let ii = 0; ii < tags.length; ++ii) {
      const tag = tags[ii]
      if (tagmap[site][tag.toLowerCase()]) continue
      if (!charMatcher.test(tag)) continue
      tagmap[site][tag.toLowerCase()] = tag.replace(charMatcher, '$1$3 - $2$4')
    }
    for (let ii = 0; ii < tags.length; ++ii) {
      let tag = tags[ii]
      for (let r of replacers[site]) {
        if (!r.search.test(tag)) continue
        tag = tag.replace(r.search, r.replace)
      }
      const mapTo = filterTag(remapTag(tag, site), _ => _ === tag || tags.indexOf(_) === -1)
      if (mapTo) {
        newTags.push.apply(newTags, mapTo)
      } else {
        newTags.push(tag)
      }
    }
    tags = newTags

  } else {
    fandoms = tags.filter(t => /^fandom:/.test(t))
  }
  tags.filter(_ => /^(character|(friend)?ship):.*(-\s*O[FM]?C$)/.test(_)).forEach(_ => {
    let oc = _.match(/-\s*(O[FM]?C)$/)
    tags.push(oc[1] || oc[2])
  })
  if (tags.some(_ => /^character:Original .*Character[(]s[)]/.test(_))) {
    tags.push('OC')
  }
  if (tags.some(_ => /-\s*SI$/.test(_))) {
    tags.push('SI')
  }
  const isFusion = tags.some(t => t === 'Fusion')
  if (isFusion) {
    tags = tags.map(t => t.replace(/^xover:/, 'fusion:')).filter(t => t !== 'Fusion')
  }
  tags = uniq.anyCase(tags)

  if (perFandom) {
    return tags.sort(tagCompare)
  } else {
    let fxf = uniq(flatMap(tags.filter(_=>/^(fandom|xover|fusion):/.test(_)), fandomsFromTag))
    tags = uniqFandom(uniq([fandom(tags)].concat(fxf)).filter(fd => tagmap[fd]).reduce((tags, fd) => mapTags(fd, tags, true), tags))

    let fandoms = tags.filter(t => /^fandom:/.test(t))
    // unfandom multi-fandoms
    if (fandoms.length > 1) {
      const baseFandom = `fandom:${fandom(tags)}`
      // we do this lookup to catch fandoms that split into multiple parts,
      // all the parts should stay `fandom:`
      const primary = (tagmap[site] && tagmap[site][baseFandom.toLowerCase()]) || [baseFandom]
      // Only do remapping if the detected fandom is tagged a `fandom:`
      if (tags.some(_ => primary.indexOf(_) !== -1)) {
        tags = tags.map(_ =>  primary.indexOf(_) !== -1 ? _ : _.replace(/^fandom:/, 'xover:'))
      }
    }

    const primaryFandom = tags.filter(_=>/^fandom:/)[0]
    if (primaryFandom) {
      const primaries = fandomsFromTag(primaryFandom)
      const tagsToMatch = primaries.length > 1 ? /fandom|xover|fusion/ : /xover|fusion/
      primaries.forEach(fandom => {
        const sameAsPrimary = qr`^${tagsToMatch}:${fandom}($|\s*[|])`
        tags = tags.filter(_ => _ === primaryFandom || !sameAsPrimary.test(_))
      })
      if (primaries.length > 1) {
        tags.unshift('fandom:' + fandom(primaries.map(_ => `fandom:${_}`)))
      }
    }
    let xovers = tags.filter(t => /^xover:/.test(t))
    const overfused = tags.filter(t => /^fusion:/.test(t) && fandoms.some(f => f.slice(7) === t.slice(7)))
    // when we're tagged as fusion with a the same fandom as our fandom, make the first xover a fandom
    if (xovers.length && overfused.length) {
      const old = xovers[0]
      tags = tags.filter(t => t !== old).concat(['fandom:' + old.slice(6)])
                 .filter(t => !/^fandom:/.test(t) || !overfused.some(f => f.slice(7) === t.slice(7)))
    }
    fandoms = tags.filter(t => /^fandom:/.test(t))
    xovers = tags.filter(t => /^xover:/.test(t))
    if (fandoms.length === 0 && xovers.length) { // then make an xover a fandom, most often from a suppressed ffnet xover
      const xover = xovers[0]
      tags = tags.filter(t => t !== xover)
      tags.push('fandom:' + xover.slice(6))
      fandoms = tags.filter(t => /^fandom:/.test(t))
    }
    let fusions = tags.filter(t => /^fusion:/.test(t))
    if (fandoms.length === 0 && fusions.length) { // then make an fusion a fandom, most often from a suppressed ffnet fusion
      const fusion = fusions[0]
      tags = tags.filter(t => t !== fusion)
      tags.push('fandom:' + fusion.slice(7))
      fandoms = tags.filter(t => /^fandom:/.test(t))
    }

    if (tagmap[`post:${site}`]) tags = mapTags(`post:${site}`, tags, true)

    tags = flatMap(tags, tag => remapShipTag(tag, [site, ...fxf]))
    tags = uniqFandom(flatMap(tags, tag => resortShipTag(tag, [site, ...fxf])))
    fandoms = tags.filter(t => /^fandom:/.test(t))
   if (fandoms.length) {
      const pf = fandoms[0]
      const pfMatch = pf.match(/^(fandom:[^|]+)/)
      if (pf.indexOf('|') !== -1 && pfMatch) {
        tags.unshift(pfMatch[1])
      }
    }
    return tags.sort(tagCompare)
  }
}

// Allow pipe delimited fandoms, most specific to least, eg, "Batman: The Animated Series|Batman|DC"
function fandomsFromTag (tag) {
  return tag.replace(/^(fandom|xover|fusion):/, '').split('|').map(_ => _.trim())
}

function remapTag (tag, site) {
  const fmatch = tag.match(/^(fandom|xover|fusion):(.*)/)
  if (!fmatch) return tagmap[site][tag.toLowerCase()]
  const [, kind, fandom] = fmatch
  let replaceWith = tagmap[site][`fandom:${fandom.toLowerCase()}`]
  if (!replaceWith) return tagmap[site][tag.toLowerCase()]
  if (!Array.isArray(replaceWith)) replaceWith = [replaceWith]
  return replaceWith.map(_ => _.replace(/^fandom:/, `${kind}:`))
}

function remapShipTag (tag, sites) {
  function remapPeople (person) {
    return sites.reduce((people, site) => {
      if (!tagmap[site]) return people
      return flatMap(people, person => {
        let char = `character:${person.toLowerCase()}`
        let charSuffix = ''
        if (!tagmap[site][char]) {
          const matchComment = person.match(/ [(]([^()]+)[)]$/)
          if (!matchComment) return person
          char = char.replace(/ [(][^()]+[)]$/, '')
          if (!tagmap[site][char]) return person
          charSuffix = matchComment[1]
        }
        const mapped = [].concat(tagmap[site][char])
        return mapped.map(_ => _.replace(/^character:(.*)/, `$1${charSuffix}`))
      })
    }, [person])
  }
  // we split and remap _twice_, once before extracting the parenthetical
  // bit, once after this lets us normalize names that have parenthetical
  // bits separately from _ships_ that have parenthetical bits
  if (/^ship:/.test(tag)) {
    let ship = tag.slice(5)
    tag = 'ship:' + flatMap(splitPeople(tag.slice(5)), remapPeople).join('/')
  } else if (/^friendship:/.test(tag)) {
    tag = 'friendship:' + flatMap(splitPeople(tag.slice(11)), remapPeople).join(' & ')
  }
  return tag
}

function resortShipTag (tag, sites) {
  function remapPeople (person) {
    const char = `character:${person.toLowerCase()}`
    return uniq(flatMap(sites, site => {
      if (!tagmap[site] || !tagmap[site][char]) return person
      const mapped = [].concat(tagmap[site][char])
      return mapped.map(_ => _.replace(/^character:/, ''))
    }))
  }
  let prefix
  let length
  let joinWith
  if (/^ship:/.test(tag)) {
    prefix = 'ship:'
    length = 5
    joinWith = '/'
  } else if (/^friendship:/.test(tag)) {
    prefix = 'friendship:'
    length = 11
    joinWith = ' & '
  } else {
    return tag
  }

  let ship = tag.slice(length)
  const personCommentMatch = /( [(][^()]+[)]|[(][^()]{3,}[)])/g
  const commentMatch = /( [(][^()]+[)]|[(][^()]{3,}[)])$/
  const match = ship.match(commentMatch)
  const personMatch = ship.match(personCommentMatch)
  let comment = ''
  if (match && personMatch && personMatch.length < 2) {
    comment = ' ' + match[1].trim()
    ship = ship.replace(commentMatch, '')
    tag = prefix + flatMap(splitPeople(ship), remapPeople).sort(sortShip).join(joinWith) + comment
  } else {
    tag = prefix + splitPeople(ship).sort(sortShip).join(joinWith)
  }
  return tag
}

function splitPeople (ship) {
  const result = []
  let current = null
  let splitWith
  if (/&/.test(ship)) splitWith = /&/
  else if (/[/]/.test(ship)) splitWith = /[/]/
  else if (/ and /.test(ship)) splitWith = / and /
  else if (/ [Xx] /.test(ship)) splitWith = / [Xx] /
  ship.split(splitWith).forEach(chunk => {
    if (chunk == null) return
    if (!current && (chunk === '&' || chunk === '/' || chunk === ' and ' || chunk === ' x ' || chunk === ' X ')) {
      return
    }
    current = current ? current + chunk : chunk
    const open = current.match(/[(]/g)
    const openC = open ? open.length : 0
    const closed = current.match(/[)]/g)
    const closedC = closed ? closed.length : 0
    if (openC === closedC) {
      result.push(current)
      current = null
    }
  })
  if (current) result.push(current)
  return result.map(s => s.replace(/^\s+|\s+$/g, ''))
}


function sortShip (aa, bb) {
  if (aa === bb) return 0
  if (isForEnd(aa) && isForEnd(bb)) return aa.localeCompare(bb)
  if (isForEnd(aa)) return 1
  if (isForEnd(bb)) return -1
  return aa.localeCompare(bb)
}

function isForEnd (aa) {
  return aa === 'OFC' || aa === 'OMC' || aa === 'OC'
      || aa === 'Reader' || aa === 'You' || aa === 'Harem'
      || aa == 'Other(s)'  || aa === '?' || aa === '*'
      || / - OC$| [(]OC[)]$/.test(aa)
}

function tagCompare (aa, bb) {
  return catify(aa).localeCompare(catify(bb))
}

const primary = new Set([
  'fandom:Harry Potter',
  'fandom:Worm',
  'fandom:Ward',
  'fandom:Twilight',
  'fandom:The Good Place',
  'fandom:Life is Strange'
])

function catify (vv) {
  let cat = ''
  cat += primary.has(vv) ? '0' : '1'
  cat += /^fandom:/.test(vv) ? '0' : '1'
  cat += /^fusion:/.test(vv) ? '0' : '1'
  cat += /^xover:/.test(vv) ? '0' : '1'
  cat += /^status:/.test(vv) ? '1' : '0'
  return cat + vv.toLowerCase().replace(/[^:A-Za-z0-9]+/g, ' ').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '')
}

function fandom (tags) {
  if (tags.some(_ => /^(fandom|xover|fusion):(?:.*[|]\s*)?Worm(\s*[|]|$)/.test(_))) return 'Worm'
  if (tags.some(_ => /^(fandom|xover|fusion):(?:.*[|]\s*)?Ward(\s*[|]|$)/.test(_))) return 'Worm'
  if (tags.some(_ => /^(fandom|xover|fusion):(?:.*[|]\s*)?Twilight(\s*[|]|$)/.test(_))) return 'Twilight'
  if (tags.some(_ => /^(fandom|xover|fusion):(?:.*[|]\s*)?Harry Potter(\s*[|]|$)/.test(_))) return 'Harry Potter'
  if (tags.some(_ => /^(fandom|xover|fusion):(?:.*[|]\s*)?Life is Strange(\s*[|]|$)/.test(_))) return 'Life is Strange'
  if (tags.some(_ => /^(fandom|xover|fusion):(?:.*[|]\s*)?The Good Place(\s*[|]|$)/.test(_))) return 'The Good Place'
  let fandoms = tags.filter(_ => /^fandom:/.test(_))[0]
  if (fandoms) return fandoms.slice(7)
  let fusions = tags.filter(_ => /^fusion:/.test(_))[0]
  if (fusions) return fusions.slice(7)
  let xovers = tags.filter(_ => /^xover:/.test(_))[0]
  if (xovers) return xovers.slice(6)
  return 'Other'
}

function uniqFandom (arr) {
  const seen = {}
  const fandoms = {}
  arr.forEach(v => {
    const l = v.toLowerCase()
    if (/^(fandom|fusion|xover):/.test(l)) {
     const lf = l.replace(/^[^:]+:/, '')
     if (lf in fandoms) return
     const fn = Object.keys(fandoms)
     const shorter = fn.some(_ => qr`^${lf}[|]`.test(_))
     if (shorter) return
     const longer = fn.filter(_ => qr`(?:^|[|])${_}(?:[|]|$)`.test(lf))
     longer.forEach(_ => {
       delete seen[fandoms[_]]
       delete fandoms[_]
     })
     fandoms[lf] = l
   }
   if (!(l in seen)) {
     seen[l] = v
   }
 })
 return Object.keys(seen).map(_ => seen[_])
}