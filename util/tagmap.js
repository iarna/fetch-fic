'use strict'
const TOML = require('@iarna/toml')
const fs = require('fs')
const path = require('path')
const uniq = use('uniq')

let tagmap = {}
let replacers = {}
let nextdir = process.cwd()
let checkdir
while (!checkdir || checkdir !== nextdir) {
  checkdir = nextdir
  try {
    const tagmapsrc = fs.readFileSync(`${checkdir}/.tagmap.toml`)
    tagmap = TOML.parse(tagmapsrc)
    for (let site in tagmap) {
      replacers[site] = []
      for (let pattern in tagmap[site]) {
        if (/^[/].*[/]$/.test(pattern)) {
          replacers[site].push({search: new RegExp(pattern.slice(1,-1), 'g'), replace: tagmap[site][pattern]})
          delete tagmap[site][pattern]
        }
      }
    }
    break
  } catch (ex) {
    if (ex instanceof SyntaxError) {
      const er = new SyntaxError(`${ex.message} at line ${ex.line}, column ${ex.column}, offset ${ex.offset}`)
      throw er
    }
  }
  nextdir = path.resolve(checkdir, '..')
}

function filterTag (tags, fw) {
  if (!tags) return
  if (!Array.isArray(tags)) tags = [tags]
  return tags.filter(fw)
}

module.exports = function mapTags (site, tags, perFandom) {
  if (!tags) return tags => mapTags(site, tags)
  tags = tags.map(_ => _.trim())
  let fandoms = []
  if (tagmap[site]) {
    let newTags = []
    for (let ii = 0; ii < tags.length; ++ii) {
      let tag = tags[ii]
      for (let r of replacers[site]) {
        if (!r.search.test(tag)) continue
        tag = tag.replace(r.search, r.replace)
      }
      tag = resortShipTag(tag, site)
      const mapTo = filterTag(remapTag(tag, site), _ => _ === tag || tags.indexOf(_) === -1)
      if (mapTo) {
        newTags.push.apply(newTags, mapTo)
      } else {
        newTags.push(tag)
      }
    }
    tags = newTags

    fandoms = tags.filter(t => /^fandom:/.test(t))
    // unfandom multi-fandoms
    if (fandoms.length > 1) {
      const baseFandom = `fandom:${fandom(tags)}`
      // we do this lookup to catch fandoms that split into multiple parts,
      // all the parts should stay `fandom:`
      const primary = tagmap[site][baseFandom] || [baseFandom]
      // Only do remapping if the detected fandom is tagged a `fandom:`
      if (tags.some(_ => primary.indexOf(_) !== -1)) {
        tags = tags.map(_ =>  primary.indexOf(_) !== -1 ? _ : _.replace(/^fandom:/, 'xover:'))
      }
    }
  } else {
    fandoms = tags.filter(t => /^fandom:/.test(t))
  }
  tags.filter(_ => /^(character|(friend)?ship):.*([(]O[FM]?C[)]|-\s*O[FM]?C$)/.test(_)).forEach(_ => {
    let oc = _.match(/[(](O[FM]?C)[)]|-\s*(O[FM]?C)$/)
    tags.push(oc[1] || oc[2])
  })
  if (tags.some(_ => /^character:Original .*Character[(]s[)]/.test(_))) {
    tags.push('OC')
  }
  if (tags.some(_ => /[(]SI[)]|-\s*SI$/.test(_))) {
    tags.push('SI')
  }
  const isFusion = tags.some(t => t === 'Fusion')
  if (isFusion) {
    tags = tags.map(t => t.replace(/^xover:/, 'fusion:')).filter(t => t !== 'Fusion')
  }
  tags = uniq.anyCase(tags)
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
  }
  let fusions = tags.filter(t => /^fusion:/.test(t))
  if (fandoms.length === 0 && fusions.length) { // then make an fusion a fandom, most often from a suppressed ffnet fusion
    const fusion = fusions[0]
    tags = tags.filter(t => t !== fusion)
    tags.push('fandom:' + fusion.slice(7))
  }

  if (perFandom) {
    return tags.sort(sortTags)
  } else {
    let fandoms = tags.filter(_=>/^(fandom|xover|fusion):/.test(_))
                      .map(_ => _.replace(/^(fandom|xover|fusion):/, ''))
    return uniq([fandom(tags)].concat(fandoms).reduce((tags, fd) => mapTags(fd, tags, true), tags))
  }
}

function remapTag (tag, site) {
  const fmatch = tag.match(/^(fandom|xover|fusion):(.*)/)
  if (!fmatch) return tagmap[site][tag]
  const [, kind, fandom] = fmatch
  let replaceWith = tagmap[site][`fandom:${fandom}`]
  if (!replaceWith) return tagmap[site][tag]
  if (!Array.isArray(replaceWith)) replaceWith = [replaceWith]
  return replaceWith.map(_ => _.replace(/^fandom:/, `${kind}:`))
}

function resortShipTag (tag, site) {
  function remapPeople (person) {
    const mapped = tagmap[site][`character:${person}`]
    return typeof mapped === 'string' ? mapped.replace(/^character:/, '') : person
  }
  if (/^ship:/.test(tag)) {
    let ship = tag.slice(5)
    const commentMatch = /( [(]\w{3,}[)])$/
    const match = ship.match(commentMatch)
    let comment = ''
    if (match) {
      comment = match[1]
      ship = ship.replace(commentMatch, '')
    }
    tag = 'ship:' + splitPeople(ship).map(remapPeople).sort(sortShip).join('/') + comment
  } else if (/^friendship:/.test(tag)) {
    let ship = tag.slice(11)
    const commentMatch = /( [(]\w{3,}[)])$/
    const match = ship.match(commentMatch)
    let comment = ''
    if (match) {
      comment = match[1]
      ship = ship.replace(commentMatch, '')
    }
    tag = 'friendship:' + splitPeople(ship).map(remapPeople).sort(sortShip).join(' & ') + comment
  }
  return tag
}

function splitPeople (ship) {
  const result = []
  let current = null
  ship.split(/([&/]| (?:and|[Xx]) )/).forEach(chunk => {
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
      || aa === 'Reader' || aa === 'You'
      || aa == 'Other(s)'  || aa === '?'
}

function sortTags (aa, bb) {
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
  if (tags.some(_ => /^(fandom|xover|fusion):Worm/.test(_))) return 'Worm'
  if (tags.some(_ => /^(fandom|xover|fusion):Ward/.test(_))) return 'Worm'
  if (tags.some(_ => /^(fandom|xover|fusion):Twilight/.test(_))) return 'Twilight'
  if (tags.some(_ => /^(fandom|xover|fusion):Harry Potter/.test(_))) return 'Harry Potter'
  if (tags.some(_ => /^(fandom|xover|fusion):Life is Strange/.test(_))) return 'Life is Strange'
  if (tags.some(_ => /^(fandom|xover|fusion):The Good Place/.test(_))) return 'The Good Place'
  let fandoms = tags.filter(_ => /^fandom:/.test(_))[0]
  if (fandoms) return fandoms.slice(7)
  let fusions = tags.filter(_ => /^fusion:/.test(_))[0]
  if (fusions) return fusions.slice(7)
  let xovers = tags.filter(_ => /^xover:/.test(_))[0]
  if (xovers) return xovers.slice(6)
  return 'Other'
}
