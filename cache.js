'use strict'
var os = require('os')
var url = require('url')
var crypto = require('crypto')
var Bluebird = require('bluebird')
var promisify = require('./promisify')
var path = require('path')
var pathDirname = promisify.sync(path.dirname)
var pathRelative = promisify.sync(path.relative)
var mkdirp = promisify(require('mkdirp'))
var fs = require('fs')
var fsReadFile = promisify(fs.readFile)
var fsWriteFile = promisify(fs.writeFile)
var fsUnlink = promisify(fs.unlink)
var fsSymlink = promisify(fs.symlink)
var fsReadlink = promisify(fs.readlink)
var zlib = require('zlib')
var zlibGzip = promisify(zlib.gzip)
var zlibGunzip = promisify(zlib.gunzip)
var util = require('util')
var inFlight = require('./in-flight.js')

exports.readFile = readFile
exports.clearFile = clearFile
exports.readURL = readURL
exports.clearURL = clearURL

function resolveCall () {
  return Bluebird.all(arguments).then(function (args) {
    var fn = args.shift()
    return Bluebird.resolve(fn.apply(null, args))
  })
}

function cacheFilename (filename) {
  return Bluebird.resolve(filename).then(function (filename) {
    return path.join(os.homedir(), '.fetch-fic', filename)
  })
}

function readFile (filename, onMiss) {
  var cacheFile = cacheFilename(filename)
  return inFlight(['read:', filename], thenReadFile)

  function thenReadFile () {
    return fsReadFile(cacheFile).catch(elseHandleMiss)
  }
  function elseHandleMiss () {  
    return resolveCall(onMiss).then(function (content) {
      return writeFile(filename, new Buffer(content))
    })
  }
}

function writeFile (filename, content) {
  var cacheFile = cacheFilename(filename)
  return inFlight('write:' + filename, thenWriteFile).thenReturn(content)

  function thenWriteFile () {
    return mkdirp(pathDirname(cacheFile)).then(function () {
      return fsWriteFile(cacheFile, content)
    })
  }
}

function clearFile (filename) {
  var cacheFile = cacheFilename(filename)
  return ignoreENOENT(fsUnlink(cacheFile))
}

function readJSON (filename, onMiss) {
  return readFile(filename, stringifyOnMiss).then(function (result) {
    return JSON.parse(result)
  })
  function stringifyOnMiss () {
    return resolveCall(onMiss).then(function (result) {
      return JSON.stringify(result, null, 2)
    })
  }
}

function writeJSON (filename, value) {
  return Bluebird.resolve(value).then(function (value) {
    return writeFile(filename, JSON.stringify(value, null, 2))
  })
}

function readGzipFile (filename, onMiss) {
  return readFile(filename, gzipOnMiss).then(function (buf) {
    return zlibGunzip(buf)
  })

  function gzipOnMiss () {
    return resolveCall(onMiss).then(function (result) {
      return zlibGzip(result)
    })
  }
}

function getUrlHash (toFetch) {
  return Bluebird.resolve(toFetch).then(function (toFetch) {
    var parsed = url.parse(toFetch)
    parsed.hash = null
    var normalized = url.format(parsed)
    return crypto.createHash('sha1').update(normalized).digest('hex')
  })
}

function cacheURLBase (fetchURL) {
  return Bluebird.all([fetchURL, getUrlHash(fetchURL)]).spread(function (fetchURL, urlHash) {
    var fetchP = url.parse(fetchURL)
    return path.join('urls', fetchP.hostname, urlHash.slice(0, 1), urlHash.slice(1, 2), urlHash)
  })
}
function cacheURLMetaName (fetchURL) {
  return cacheURLBase(fetchURL).then(function (cacheURL) { return cacheURL + '.json' })
}
function cacheURLContentName (fetchURL) {
  return Bluebird.resolve(fetchURL).then(function (fetchURL) {
    var fetchP = url.parse(fetchURL)
    var ext = path.parse(fetchP.pathname).ext || '.data'
    return cacheURLBase(fetchURL).then(function (cacheURL) {
      return cacheURL + ext + '.gz'
    })
  })
}

function readURL (fetchURL, onMiss) {
  var metafile = cacheURLMetaName(fetchURL)
  var content = cacheURLContentName(fetchURL)
  var meta = {
    startURL: fetchURL,
    finalURL: null
  }
  return inFlight(fetchURL, thenReadContent)

  function thenReadContent () {
    return readGzipFile(content, orFetchURL).then(thenReadMetadata)
  }

  function orFetchURL () {
    return resolveCall(onMiss, fetchURL).then(function (res) {
      meta.finalURL   = res.url
      meta.status     = res.status
      meta.statusText = res.statusText
      meta.headers    = res.headers.raw()
      return res.buffer()
    })
  }

  function thenReadMetadata (result) {
    if (meta.status && meta.status !== 200) {
      var non404 = new Error('Got status: ' + meta.status + ' ' + meta.statusText)
      non404.meta = meta
      non404.result = result
      return Bluebird.reject(non404)
    }
    return readJSON(metafile, function () { return meta }).then(function (meta) {
      return linkURL(meta).thenReturn([meta, result])
    })
  }
}

function ignoreENOENT (p) {
  return p.catch(function (er) {
    if (er.code === 'ENOENT') return
    throw er
  })
}

function linkURL (meta) {
  if (meta.startURL === meta.finalURL) return Bluebird.resolve()
  var startm = cacheFilename(cacheURLMetaName(meta.startURL))
  var startc = cacheFilename(cacheURLContentName(meta.startURL))
  var finalm = cacheFilename(cacheURLMetaName(meta.finalURL))
  var finalc = cacheFilename(cacheURLContentName(meta.finalURL))
  return Bluebird.all([
    pathDirname(finalm),
    ignoreENOENT(fsReadlink(finalm)),
    ignoreENOENT(fsReadlink(finalc)),
    startm,
    startc
  ]).spread(function(fd, fm, fc, sc, sm) {
    var rfm = fm && path.resolve(fd, fm)
    var rfc = fc && path.resolve(fd, fc)
    if (sm === rfm && sc === rfc) return Bluebird.resolve()
    return Bluebird.all([
      ignoreENOENT(fsUnlink(finalm)),
      ignoreENOENT(fsUnlink(finalc)),
      mkdirp(pathDirname(finalm))
    ]).then(function () {
      return Bluebird.all([
        fsSymlink(pathRelative(pathDirname(finalm), startm), finalm),
        fsSymlink(pathRelative(pathDirname(finalc), startc), finalc)
      ])
    })
  })
}

function clearURL (fetchURL) {
  var metafile = cacheURLMetaName(fetchURL)
  var content = cacheURLContentName(fetchURL)
  return Bluebird.all([clearFile(metafile), clearFile(content)])
}
