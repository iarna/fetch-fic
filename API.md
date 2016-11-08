Docs for the internal API
=========================

# cache.js

Implements a generic read-through cache, and then builds a URL cache on top
of that. All arguments can be promises that resolve to said arguments and all
return values are Bluebird promises.

All files for the cache are kept in `~/.fetch-fic` where `~` is resolved to
`os.homedir()`.

## cache.readFile (filename, onMiss)

Returns a promise that resolves to a Buffer containing the contents of
`filename` relative to the cache root.

If `filename` doesn't exist then `onMiss` is called and it's return value
(either a plain value or a promise of the value) written to the cache and
converted to a Buffer and returned.

## cache.clearFile (filename)

Returns a promise that resolves if removing the file from the cache was
successful.  If `filename` does not exist, this still resolves succesfully.

## cache.readURL (url, onMiss)

Returns a promise to a two element array.  The first element contains
information about the resource, and the second element is a Buffer
containing the resource.

If the resource isn't in the cache then `onMiss` is called with `url` as its
argument. It's expected to return either an object or the promise of an object
that has the following properties:

* `url` - The final URL, after any redirects are processed.
* `status` - The final HTTP status code.
* `statusText` - The final HTTP status text.
* `headers.raw()` - Returns an object with the response headers.
* `buffer()` - Returns a Buffer with the contents of the resource.

An object of this type is provided by the promise returned from the
`node-fetch` object.

The information about the resource is stored in:
  `urls/<domainname>/<u1>/<u2>/<urlsha>.json`

And the resource itself is stored in:
  `urls/<domainname>/<u1>/<u2>/<urlsha>.<ext>.gz`

Where `<urlsha>` is the `sha256` of the URL.

And `<u1>` and `<u2>` are the first and second characters of `<urlsha>`.

And `<ext>` is taken from the URL. If the URL has no extension in it then `data` is used.

## cache.clearURL (url)

# site.js

Site objects store all of the site-specific code.  Each site gets one class
encapsulating all of its site-specific behavior.

This file provides the base class and loads and registers the bundled
plugins with `Site.register`.

## class methods

### Site.fromURL(url)

construct a new `Site` object of a class that best matches the URL.

### Site.matches(url)

Used by site-specific classes, takes a URL and returns true if that site
class knows how to handle this URL.

## provided instance methods

### normalizeLink(href, base)

Normalize links for this site. At least resolve to `base`, but also often involves
SSLizing things or other normalization.


### sanitizeHtmlConfig()

Returns configuration to pass to `sanitize-html`.

### cleanLinks(tagName, attribs)

Used in the deafult `sanitizeHtmlConfig` as a `transformTags` entry for `a`
tags.

## provided properties

### raw

The link that was passed into our constructor.

### link

The normalized form of `raw`.

### warnings

An array of warnings we've run into.

## necessary site-specific instance methods

### new Site(url)

Set `publisher` & `publisherName` & `name` properties. The last should be a url/file type name.

### getFicMetadata(fetch, fic)

Fetch `this.link` or derived URL for direct metadata, eg threadmarks for
xenforo, chapter list for ao3 and call `fic.addChapter()` with what we find. Also
update other `fic` properties if we find values for them.

Returns a promise that's resolved when all metadata is fetched.

### scrapeFicMetadata(fetch, fic)

Fetch `this.link and scrape it for links to chapters in a site specific
manner, calling `fic.addChapter()` for what it finds.  Also update other
`fic` properties if we find values for them AND they're not already set.
The second caveat here is because `scrapeFicMetadata` may be called in
addition to `getFicMetadata` and the former's version is preferred.

Returns a promise that's resolved when all metadata is fetched.

### getChapter(fetch, chapterUrl)

Fetch the chapter URL and return a promise of an object with the following
properties:

* `finalUrl` – The _actual_ URL of the resource.  If requesting `chapterUrl`
  resulted in redirects this should be the URL that actually returned the
  content.
* `base` – The base URL to resolve relative links from.  Either from a
  `base` tag in the HTML or `finalURL`.
* `author` – The name of the author of this chapter.
* `authorUrl` – The URL of the author of this chapter.
* `created` – When this chapter was first created.
* `content` – The HTML that should be used as the chapter body.

# fic.js

## Fic

The only export is the Fic class which provides the following:

## Fic class methods

### Fic.fromUrl(fetch, link)

### Fic.fromUrlAndScrape(fetch, link)

### Fic.scrapeFromUrl(fetch, link)

### Fic.fromJSON(raw)

## Fic methods

### new Fic(fetch)

### chapterExists(link)

### normalizeLink(link)

### getChapter(fetch, link)

### addChapter(name, link, created)

### importFromJSON(raw)

### toJSON()

## Fic properties

### title

### link

### author

### authorUrl

### created

### modified

### publisher

### cover

### description

### tags

### fics

An array of `SubFic`s

### chapters

A `ChapterList` object.

## SubFic

SubFic is a subclass of Fic.  It differs in that it has a _parent_ and it
can't have any _fics` of its own.  It shares the same properties, but if one
isn't set then it defaults to the value from the Fic that contains it. These
pass-through defaults are not preserved when it's JSONified.


## ChapterList

ChapterList is a kind of Array that has two additional methods:

### chapterExists(link, fic)

### addChapter(name, link, created)

## Chapter

An object representing the chapter, it has the following properties:

* name
* link
* author
* authorUrl
* created
* modified
* tags
* externals - Defaults to true, only included in JSON when false.
* order – Not included when serializing to JSON
