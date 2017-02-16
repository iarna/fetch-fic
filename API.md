Docs for the internal API
=========================

There are no tests, because I'm a bad person who should feel bad.  First
step: Write some tests to this doc.

# NOTE

One weird thing, I'm using a bit of an experimental module loader to make
using intra-package modules easier, particularly when moving modules around.

It works like so:

```
require('@iarna/lib')('util', 'other', path')
```

The above would use `__dirname/util`, `__dirname/other` and `__dirname/path`
as your search path for intra-package modules.

You can then require one with:

```
const myModule = use('my-module')
```

Which will ONLY search the paths you specified.  It won't look in
node_modules folders.  Because it's based on the Node.js module loader it
WILL load global modules if you ask it to. But don't.


# util/cache.js

```js
const cache = use('cache')
```

Implements a generic read-through cache, and then builds a URL cache on top
of that.  All arguments can be ordinary values or promises and all return
values are Bluebird promises.

All files for the cache are kept in `~/.fetch-fic` where `~` is resolved to
`os.homedir()`.

For the sake of simplicity, documentation will discuss what the returned
promises resolve to.

## cache.readFile (filename, onMiss) → Promise(Buffer)

Returns a Buffer containing the contents of `filename` relative to the cache
root.

Any error reading from `filename` will result in `onMiss` being called and
it's return value being written to the cache and returned.  Errors from
`onMiss` are passed through as a rejection.

`onMiss` takes no arguments and is expected to return a Buffer or a thing
that `Buffer.from` can turn into a Buffer.  The return value can be either a
promise or an ordinary value.

## cache.clearFile (filename) → Promise

Removes the file from the cache.  If `filename` does not exist, this still
resolves succesfully.  Any other error will result in a rejection

## cache.readUrl (url, onMiss) → Promise([Object, Buffer])

Returns a two element array, the first element is an object with infomration
about the resource, the second is a buffer containing the resource.

The `onMiss` callback looks like **onMiss (url) → Promise(Object)**.

It is expeccted to return an object with the following properties:

* `url` - (optional) The final URL, after any redirects are processed.
* `status` - The final HTTP status code.
* `statusText` - The final HTTP status text.
* `headers` - An object with a `.raw()` method that returns an object with
  the response headers.
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

## cache.clearUrl (url) → Promise

Removes the `.json` and `.gz` components of a URL from the cache using `cache.clearFile`.

## cache.invalidateUrl (url) → Promise

Marks the url as dirty, so that future fetches will skip the cache, in THIS
SESSION ONLY.

# util/call-limit.js

```js
const callLimit = use('call-limit')
```

This module provides our concurrency and requests per second limiting.

## callLimit (fn, maxConcurrency, minTimeBetweenCalls) → Function

Returns a version of `fn` that has the stated limits.  Attempts to call `fn`
that would result in breaking either the concurrency limits or the
time-between-calls limits result in queing and executing as soon as is
allowed.

`fn` is expected to return a Promise.

The function returned by `callLimit` takes an additional first `grouping`
argument.  This should be a String.  The limits will be applied per unique
grouping. For our purposes this `grouping` is always a domain.

# util/curry-options.js

```js
const curryOptions = use('curry-options')
```

This takes a function that takes options as its final argument and
transforms it into something where you can add defaults to that final
options object and make sure it maintains its interface when wrapping with
other functions.

## curryOptions (fn, postWrap, defaults) → Function

`fn` is the function we're going to be wrapping.

`postWrap` is function that's called any time we add another wrapping layer.
It's given the wrapper and the original function as arguments.  It would
typically be used to maintain any custom properties.

`defaults` provides default values for the object that's the final argument to `fn`.

The returned function can be called as usual and it's final argument will have defaults
filled in from the `defaults` object. It also has two methods:

**.withOpts (moreDefaults) → Function**

This adds some additional defaults and returns a wrapped function that behaves as
if `curryOptions` had been called with those values to start with.

**.wrapWith (wrappingFunction) → Function**

Say you want to wrap the curriable function and still have it be curriable?
That's what this is for.  `fn.wrapWith(wrapper)` is the same as `wrapper(fn)` except that
the returned function will still be curryable.

# ff.js

This is the command line, it holds all of the argument processing, error
handling and what not.  It loads `ff-` prefixed modules for various
commands, all of which are expected to export a function that accepts a
`yargs` `argv` and returns a Promise.

# fic-inflate.js

```js
const ficInflate = use('fic-inflate')
```

## ficInflate (fic, fetch, tracker) → Promise(fic)

Downloads all of the chapters in `fic` and fills in metadata from the
chapter HTML where otherwise missing.  Most commonly filled in via this
function are:

* words
* author
* authorUrl
* created
* modified

# fic-stream.js

```js
const FicStream = use('fic-stream')
const stream = new FicStream(fic)
```

Provides a Readable stream that both pretends to be a `Fic` object (proxying access to one) and providing a method for
adding data to the stream that uses a promise for backpressure control.

## stream.queueChapter (obj) → Promise

Pushes `obj` onto the stream.  The returned promise resolves immediately if
there's no backpressure, or as soon as the backpressure is relieved if there
is some.  This let's you to take objects from a non-stream source and write
them to a stream without running the risk of buffering all of them in memory
while waiting on i/o.

# fic.js

```js
const Fic = use('fic')
```

When referenced, `fetch` is a function implementing `node-fetch`'s
interface, taking a url and an options argument and returning the promise of
a results object.

## new Fic (fetch) → Fic

Creates an entirely empty fic object

## Fic.fromUrl (fetch, link) → Fic

Creates a fic object and initializes it with
`Site.fromUrl(link).getFicMetadata(…)`.

## Fic.fromUrlAndScrape (fetch, link) → Fic

As with `fromUrl` but uses `getFicMetdata` AND `scrapeFicMetadata.

## Fic.scrapeFromUrl (fetch, link) → Fic

As with `fromUrl` but ONLY uses `scrapeFicMetadata`.

## Fic.fromJSON (obj) → Fic

Construct a new fic file from a raw object.  For us, this is produced by
`TOML.parse` on a `.fic.toml` file.

## fic.updateWith () → String

Returns the best URL to use to fetch updated metadata with.  This is simply
a shortcut for `this.updateFrom || this.link`.

## fic.chapterExists (href) → Boolean

Return true if a chapter with a `.link` or `.fetchFrom` matching `href`
exists anywhere in this fic or its subfics.

## fic.normalizeLink (link) → String

A shortcut for:

```js
try {
  const site = Site.fromUrl(link)
  return site.normalizeLink(link)
} catch (_) {
  return link
}
```

## fic.addChapter (obj)

Adds a chapter to the current fic if it doesn't already exist.  `obj` can
have any of the properties of a `Chapter` object.  The `name` will be
mutated to be unique within this fic if it isn't already.

## fic.importFromJSON (obj) → fic

Initializes the current object with the values from `obj`, as `Fic.fromJSON`
would.

## fic.toJSON() → Object

Used by `JSON.stringify` and `@iarna/toml`'s `TOML.stringify` to provide a
version of the object safe for serialization. The results of this are
suitable for passing to `Fic.fromJSON` or `fic.importFromJSON`.

## String fic.title

The title of this work.

## String fic.link

The canonical link for referencing this work.  This should be used in any
output that will be user visible.

## String fic.author

The name of the author of the work.

## String fic.authorUrl

A URL of the author of the work.

## Date fic.created

When the work was first published or created.

## Date fic.modified

When the work was most recently updated.

## String fic.publisher

The name representing where the work was published. Eg, to which archive or on what fansite.

## String fic.cover

The URL of a cover image.

## String fic.description

An HTML description of the work.

## Array(String) fic.tags

The tags associated with the work.

## Array(SubFic) fic.fics

Any separate fics that should get their own individual output when
generating this fic.

## ChapterList chapters

The chapters in this fic.

## SubFic

SubFic is a subclass of Fic.  It differs in that it has a _parent_ and it
can't have any _fics_ of its own.  It shares the same properties, but if one
isn't set then it defaults to the value from the Fic that contains it. These
pass-through defaults are not preserved when it's JSONified.

## ChapterList

ChapterList is a kind of Array that has two additional methods:

### fic.chapters.chapterExists (link[, fic]) → Boolean

Returns true if any chapter in this chapter list has a whose `.link` or
`.fetchFrom` matches.  If `fic` is included then links are normalized before
being compared.

### fic.chapters.addChapter (obj)

Adds a chapter to ourselves if it doesn't already exist.  `obj` can
have any of the properties of a `Chapter` object.  The `name` will be
mutated to be unique within this fic if it isn't already.

### fic.chapters.importFromJSON (obj)

Initializes the chapter list with the objects contained in
`obj.chapters`—each chapter is pushed on with the result of
`Chapter.fromJSON`.

## Chapter

An object representing the chapter, it has the following properties:

* name
* link - Where to indicate this fic is from.
* fetchFrom - Where to actually get this fic from.  Usually only different
  than link when it points to a local resource for fics pulled from rtf.
* author
* authorUrl
* created
* modified
* tags - An array of tags associated with this chapter.
* headings - When true, includes headings at the start of this chapter.
  Overrides any fic-level chapterHeadings setting.
* words - The number of words in this chapter.
* externals - Defaults to true, only included in JSON when false.
* order – Not included when serializing to JSON

### Chapter.fromJSON (order, obj) → Chapter

Constructs a new chapter object with properties from `obj` and
`chapter.order` set to `order`.

### chapter.fetchWith() → Boolean

A shortcut for `this.fetchFrom || this.link`.

### chapter.toJSON() → Object

Makes a serializable object out of a chapter.

### chapter.getContent (fetch) → ChapterContent

Returns a ChapterContent object for the current chapter, fetching it via `fetch` if necessary.

### Chapter.getContent (fetch, url) → ChapterContent

Returns a ChapterContent object for the specified url, fetching it via `fetch` if necessary.

# util/chapter-content.js

## ChapterContent extends Chapter

New ChapterContent objects are constructed using the Chapter classes object
and class `getContent` methods.  ChapterContent objects properties differ from Chapter objects in the following ways:

* html – The HTML from which the content of this chapter was extracted.
* $ – A Cheerio object with the parsed content of `.html`
* content – The HTML for JUST the chapter content. A strict subset of `.html`.
* $content – A cheerio object with the parsed version of `.content`.
* words – As with Chapter objects, this is the number of words in the
  Chapter.  Unlike Chapter objects, this is lazyily computed from the
  `.content` property.

# util/filenameize.js

```js
const filenameize = use('filenameize')
```

## filenameize (str) → String

Makes `str` safe to use in a filename, converting any non-word characters
into hyphens, removing any doubled hyphens and removing any leading or
trailing hyphens.

# util/get-fic.js

```js
const getFic = use('get-fic')
```

## getFic (fetch, fic) → FicStream

Using `fetch`, downloads all of the chapters from `fic` and writes them to
the returned FicStream.

# util/html-template-tag.js

```js
const html = use('html-template-tag')
```

## html`this is an ${'example <b>!'}` → 'this is an example &lt;b>!'

Uses `html-escape` to escape any values embedded in a template string.

# output/ao3/html-to-ao3.js

```js
const htmlToAo3 = use('html-to-ao3')
```

## htmlToAo3(html) → String

Takes any generic HTML and converts it into the limited subset of HTML that
AO3 allows.  This doesn't merely strip unsupported tags but does its best to
preserve formatting even in the face of stylesheets.

# output/bbcode/html-to-bbcode.js

```js
const htmlToBbcode = use('html-to-bbcode')
```

## htmlToBbcode(html) → String

Takes any generic HTML and converts it into bbcode suitable for posting to
forum sites.

# output/ffnet/html-to-ffnet.js

```js
const htmlToFfnet = use('html-to-ffnet')
```

## htmlToFfnet(html) → String

Takes any generic HTML and converts it into the limited subset of HTML that
FanFiction.net allows.  This doesn't merely strip unsupported tags but does its best to
preserve formatting even in the face of stylesheets.

# util/in-flight.js

```js
const inFlight = use('in-flight')
```

## inFlight (unique, todo) → Promise

Arguments can be plain values or promises.

`unique` is either a string or an array of promises and values that will be resolved and joined together.

`todo` is a function that returns a promise.

`inFlight` will, until such time as `todo()` resolves or rejects, return the a
single promise per `unique` value.  That promise will resolve with the
result of `todo`.

As such, it will fold multiple calls with the same `unique` value into a
single call to `todo`, returning the same promise to all callers.  Once
`todo` resolves, a future call with the same `unique` will result in a new
call to `todo`.

# util/normalize-html.js

```js
const normalizeHtml = use('normalize-html')
```

## normalizeHtml (html) → String

Parses `html` according to HTML5 parsing rules and then serializes the
result back to HTML.

# output-formats.js

```js
const outputFormats = use('output-formats')
```

`outputFormats` is an array of the names of the currently bundled output
formats. These are registered with `output.js` by default.

# output.js

# util/progress.js

```js
const progress = use('progress')
```

## progress.spinWhileAnd (fn) → Function

Wraps another function to spin the progress bar spinner until the promise
returned by the other function resolves.

## progress.show ([section,] message)

Update the progress bar with a new message and optionally section.

## progress.hide ()

Hide the progress bar.

## progress.output (str)

Turn off the progress bar, write `str` to stdout, then turn the progress bar
back on.

## progress.newWork (label, work) → Tracker

Return a new `are-we-there-yet` Tracker object, added to the default tracker
group.

## progress.addWork (promise, tracker)

Add one unit of work to `tracker` and complete that work when the `promise`
resolves.

## progress.completeWorkWhenResolved (promise, tracker)

Complete one unit of work on `tracker` when `promise` resolves.

# util/promisify.js

```js
const promisify = use('promisify')
```

## promisify (fn[, bind]) → Function

Takes a callback based function and returns one that accepts promises as
arguments and returns a promise that's resolved when the callback is called.

Optionally, `bind` will call `fn` with `bind` as `this`.

## promisify.args (fn[, bind]) → Function

Takes either a synchronous function or a promise returning function and returns one
that accepts promisesa as arguments.

# util/rtf-to-html.js

```js
const rtfToHtml = use('rtf-to-html')
```

## rtfToHtml (rtf) → Promise(String)

Takes RTF or the promise of RTF and returns roughly equivalent HTML.  This
uses my own go of an RTF parser (which is reasonably complete) and HTML
emitter (which is woefully incomplete).  It's missing basic things like
stylesheets and list items, let alone tables or images.

TODO: Rewrite this to be three phase:

* RTF parser → AST (is probably good as we are now)
* AST → RTFDocument (object)
* RTFDocument → HTML

# util/fetch.js

```js
const fetch = use('fetch')
```

## fetch (href, opts) → [Object, Buffer]

Fetches `href` using the cache via `node-fetch`.  Unlike `node-fetch` it
returns an Array containing an Object and a Buffer instead of a result object.

In addition to `node-fetch` options, `opts` may contain:

* cookieJar — Provide your own cookiejar.  If not specified then a global
  persistent cookiejar will be used.
* cacheBreak — If true, invalidate the cache entry for this href before
  fetching it.
* noNetwork — If true then a cache miss will result in an error.
* referer — The equivalent of setting opts.headers.Referer.

And finally, these options can only be set on the first invocation.
Changing them later will be ingnored.

* maxConcurrency — The maximum number of simultaneous requests.
* requestsPerSecond — The maximum number of requests to make per second.

## fetch.setCookieSync (cookie, href)

Adds `cookie` to the current cookiejar for `href`.

## fetch.setGlobalCookie (cookie)

Adds a cookie that will be sent to ALL requests, regardless of domain.

## fetch.withOpts(opts) → Function

This will create a new fetch function with new default options from `opts`.
It's additive from previous calls. That is:

`fetch.withOpts({a: 1}).withOpts({b: 2})` will result in a a default set of
options of `{a: 1, b: 2}`.

## fetch.wrapWith(fn) → Function

Calls `fn(fetch)` and then wraps the result of that up so that it continues
to provide the interface described here.

# site.js

```js
const Site = use('site')
```

Site objects store all of the site-specific code.  Each site gets one class
encapsulating all of its site-specific behavior.

This file provides the base class and loads and registers the bundled
plugins with `Site.register`.

## Site.register (siteclass)

Register a site for use. This is called automatically for the following when
you first `use('site')`:

xenforo, fanfictionnet, deviantart, ao3, gravatar, wp-facebook, wikipedia,
youtube, worm, generic-image, local

## Site.fromURL (url) → Site

construct a new `Site` object of a class that best matches the URL.

## new Site(url)

Set `publisher` & `publisherName` & `name` properties. The last should be a url/file type name.

## site.normalizeLink (href, base) → String

Normalize links for this site. At least resolve to `base`, but also often involves
SSLizing things or other normalization.

## site.sanitizeHtmlConfig () → Object

Returns configuration to pass to `sanitize-html`.

## cleanLinks (tagName, attribs) → {tagName, attribs}

Used in the deafult `sanitizeHtmlConfig` as a `transformTags` entry for `a`
tags.

## provided properties

### raw

The link that was passed into our constructor.

### link

The normalized form of `raw`.

### warnings

An array of warnings we've run into.

## Methods that implementations must provide

### Site.matches (url) → Boolean

Implemented by site-specific classes, takes a URL and returns true if that site
class knows how to handle this URL.

### site.getFicMetadata (fetch, fic) → Promise

Fetch `this.link` or derived URL for direct metadata, eg threadmarks for
xenforo, chapter list for ao3 and call `fic.addChapter()` with what we find. Also
update other `fic` properties if we find values for them.

Returns a promise that's resolved when all metadata is fetched.

### site.scrapeFicMetadata (fetch, fic) → Promise

Fetch `this.link and scrape it for links to chapters in a site specific
manner, calling `fic.addChapter()` for what it finds.  Also update other
`fic` properties if we find values for them AND they're not already set.
The second caveat here is because `scrapeFicMetadata` may be called in
addition to `getFicMetadata` and the former's version is preferred.

Returns a promise that's resolved when all metadata is fetched.

### site.getChapter (fetch, chapterUrl) → Promsie(Object)

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
