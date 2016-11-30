# fetch-fic

Package up delicious, delicious fanfic from various sources into epub ebooks ready for
reading in your ereader of choice.

## SITES SUPPORTED

* Any [Xenforo](https://xenforo.com/) based forum, like: [spacebattles.com](https://forums.spacebattles.com/), [sufficientvelicity.com](https://forums.sufficientvelocity.com/), [questionablequesting.com](https://questionablequesting.com)
* [Archive of Our Own](https://archiveofourown.org/)
* [Fanfiction.Net](https://www.fanfiction.net/)
* [Deviant Art](https://www.deviantart.com/) (for linked fanart)
* [Wikipedia](https://www.wikipedia.org)
* Local folders full of rtf files– I use it with synced folders from
  Scriviner, though it should, to some degree, work on the actual Scriviner
  data files too.
* [Youtube](https://youtube.com) (included as a thumbnail image linked to the video)
* [Gravatar](https://en.gravatar.com) & Wordpress Facebook Avatar Mirror (for forum avatars)
* Generic image handling– any url ending in jpg/jpeg/png/gif/svg will be
  accepted and included in an `<img>` tag.  Added primarily to allow
  bringing in links to images.  Embed images would already be included.

## NOTABLE FEATURES

* Cover images can be added.
* Images are brought into the final ebook.  (This includes smilies on
  Xenforo sites.)
* Threads without threadmarks can be used.  (We scrape the page for links
  and you pic the ones that are actually chapters.)
* Links between chapters are maintained and become links within the ebook itself.
* External links to other supported sites will optionally be added
  automatically as appendices and the links to them updated to stay in the
  ebook.
* Can optionally add chapter names as headers to the start of each chapter.
* Content is aggressively cleaned for broad compatibility and for quality of
  display in ereaders.
* Content is restyled for ebook use:
  * Spoiler boxes are styled as boxes w/o the "Spoiler" button.
  * Quoted text is styled without the "Expand/Collapse" buttons.
  * White-text is de-whited.
  * Invisitext is shown
  * mailto: links are delinked.
* Content is cached so that iterating to get the perfect config takes no
  time.  Plus chapter updates are fast.


## INSTALLATION

You'll need [Node.js](https://nodejs.org) to use this tool.  Once you have
dit installation is pretty simple:

```console
$ npm install -g fetch-fic
```


## USAGE

The tool is split into two commands, one which reads all the info about your
fic and stores that in a file (that you can edit), and a second that reads
that file, fetches everything and creates the epub for you. The first tool
can also UPDATE a fic instead of downloading it anew.

```
Usage: fetch-meta <url> [options]

Options:
  --scrape      scrape the index instead of using threadmarks          [boolean]
  --and-scrape  pull chapters from BOTH the index AND the threadmarks  [boolean]
  --xf_user      value of your xf_user variable                         [string]
  --cache        fetch from the network even if we have it cached
                                                       [boolean] [default: false]
  --network      allow network access; when false, cache-misses are errors
                                                       [boolean] [default: true]
<url> - The URL of the threads you want to epubize. These fetches are not cached so you're
guaranteed an up-to-date index.  This writes a metadata file out with the
extension `.fic.toml` for you to edit and pass to…
```

```
Usage: fetch-meta <fanfiction.fic.toml> [options]

Options:
  --scrape      scrape the index instead of using threadmarks          [boolean]
  --and-scrape  pull chapters from BOTH the index AND the threadmarks  [boolean]
  --xf_user      value of your xf_user variable                         [string]
  --cache        fetch from the network even if we have it cached
                                                       [boolean] [default: false]
  --network      allow network access; when false, cache-misses are errors
                                                       [boolean] [default: true]

<fanfiction.fic.toml> - This will update an existing metadata file with the latest chapters.
```

```
Usage: fetch-fic <fic(s)> [options] Options:
  --xf_user      value of your xf_user variable                         [string]
  --cache        fetch from the network even if we have it cached
                                                       [boolean] [default: true]
  --network      allow network access; when false, cache-misses are errors
                                                       [boolean] [default: true]
  --concurrency  maximum number of chapters/images/etc to fetch at a time
                                                           [number] [default: 4]
  -o, --output   Set output format [choices: "epub", "bbcode"] [default: "epub"]

<fic(s)> - The `.fic.toml` file(s) you want to get epubs for.  You'll get
one epub for each `.fic.toml`.  Epubs are fetch in sequence, not in
parallel.
```

## EXAMPLE

```console
$ fetch-meta https://forums.example.com/threads/example.12345/
example.fic.toml
$ fetch-fic example.fic.toml
⸨░░░░░░░░░░░░░░    ⸩ ⠋ example: Fetching chapters
```

… time passes …
```console
$ fetch-meta example.fic.toml
Added 2 new chapters
Updated fic last udpate time from 2016-09-29T22:37:15Z to 2016-09-30T17:33:20Z
example.fic.toml
```

## HINTS

* Running `fetch-meta` with a fic file as an argument will update it.
* Xenforo: Use `--scrape` if the thread doesn't have threadmarks but has an index post.
* Xenforo: Use `--and-scrape` if the thread has extra stuff in the index post that's
  not threadmarked.  This is commonly where meta-fanfic goes (aka in some
  communities as "omake").
* The fic files are [TOML](https://github.com/toml-lang/toml), but just open
  them up in an editor, they're pretty straightforward.
* I often edit the fic files quite a bit.  The title determines the name of
  the epub file.
* If the resulting epub isn't quite right, feel free to reuse `fetch-fic` as much
  as you need to. It'll be super fast as it'll be working from a local copy of
  the theads. (Fast and no hammering your favorite forum site.)

## DETAIL

The tool will take any link to any page of a thread.  But if you intend to
scrape it should be a link to the index page.

The last line printed is the filename of the epub file it created for you.
This is produced from the thread title.


All of the arguments are optional

### --xf_user <cookie>

You can optionally pass the value of your `xf_user` cookie if you want to
download threads that are restricted to members of the site.  To get this
cookie you'll have to look in your browser. It's a pain ¯\\\_(ツ)\_/¯

### --xf_session <cookie>

Alternatively, you can use the session cookie from your browser.  Unlike
`xf_user` this will expire after some amount of inactivity.

### --scrape

If included then instead of fetching threadmarks we'll slurlp links from the
URL you specified and count those as chapters.

### --and-scrape

Fetch threadmarks AND slurp links from the URL you specified. Often results in
duplicates but it's also often the only way to get _everything_.

### --cache

For `fetch-meta`, forces the use of the cache instead of looking for a fresh
table of contents.

### --no-cache

For `fetch-fic`, disable the use of the cache when fetching chapter data.

### --no-network

Error if anything tries to access the network (on a cache-miss).  Note that
`--no-cache` and `--no-network` used together are guaranteed to error out.

### --concurrency=#

Set the maximum number of simultanteous network requests we'll do at a time.
This defaults to 4, which while conservative, pretty much guarantees you
won't hit any site's "bot please stop beating on us" limits.

## WHAT FIC FILES LOOK LIKE

`fetch-meta` produces `.fic.toml` files…

If the original thread name was:

```
My great threadname (Example1/Example2)
```

then:

```toml
title = "My great threadname"
author = "Example Author"
authorUrl = "https://forums.example.com/members/example-author.123/"
created = 2016-09-25T01:11:36Z
modified = 2016-10-02T03:17:23Z
link = "https://forums.example.com/threads/example.12345/"
description = """
This is an example taken from the long and great tradition of examples.
What this actually is, is the first paragraph from the fic.  If we're very
lucky the it'll be a summary to sell folks on reading it.  Most of the time
it's the fic title or something else equally unhelpful.  Still.  It's better
than what used to be here.
"""
tags = ["Example1", "Example2"]

[[chapters]]
name = "1"
link = "https://forums.example.com/posts/7890"
created = 2016-09-25T01:11:36Z

[[chapters]]
name = "2"
link = "https://forums.example.com/posts/9783"
created = 2016-10-02T03:17:23Z
```

Sometimes you might have a single thread that contains muliple stories.
While `fetch-meta` will never produce a file like this, `fetch-fic` will
produce multiple separate epubs if you give it something like this:

```toml
title = "My great ideas thread"
author = "Example Threadcreator"
authorUrl = "https://forums.example.com/members/example-author.123/"
created = 2016-09-25T01:11:36Z
modified = 2016-10-02T03:17:23Z
link = "https://forums.example.com/threads/example.12345/"
description = ""


[[fics]]
title = "This first story"
author = "Example Author"

    [[fics.chapters]]
    name = "1"
    link = "https://forums.example.com/posts/7890"
    created = 2016-09-25T01:11:36Z

    [[fics.chapters]]
    name = "2"
    link = "https://forums.example.com/posts/9783"
    created = 2016-10-02T03:17:23Z

[[fics]]
title = "A second story"
author = "Another Author"

    [[fics.chapters]]
    name = "1"
    link = "https://forums.example.com/posts/32433"
    created = 2016-09-25T01:11:36Z

    [[fics.chapters]]
    name = "2"
    link = "https://forums.example.com/posts/838233"
    created = 2016-10-02T03:17:23Z

```

# FULL DOCUMENTATION FOR `.fic.toml` PROPERTIES


## Top level properties

### id

Optional.  Defaults to `link`.  An identifier string representing this piece
of fiction.  This is not generally visible in any document you create.  It's
used in conjunction with the modified date for epub's to produce unique IDs.

### title

**Required.**  The title of this piece of fiction.  In addition to being placed
on the title page and included in any metadata, this is also used to
generate the output filename.

### link

Optional. The URL from which this fiction was fetched. This is filled in as the
`source` in an epub and is included on any title pages.

### updateFrom

Optional.  Defaults to `link`.  This is the URL or directory that the
fiction was fetched from.  This is used when updating existing fic metadata.

### author

Optional.  The name of the author of this work.  This is displayed on the
title page and included in available metadata.

### authorUrl

Optional.  A URL to a profile page for the author of this work. Not used unless
`author` is also set.

### created

Optional. The date that this work was originally published.

### modified

Optional. The date that this work was most recently modified.

### publisher

Optional.  The name of the website or other publisher where this work was
found.  This is used for non-user visible metadata.

### description

Optional.  HTML.  A few paragraphs providing a "back of the book" type
description for new readers. This is included in the title page and metadata.

### cover

Optional.  The name of an image file to embed as the cover of this work.  If
this is included then a title page won't be generated. *TODO: I'd like this to
support URLs as well.*

### chapterHeadings

Optional.  Default: false.  If true then chapters will have headings added
to the top of them with the name of the chapter and, if different than that
of the work as a whole, the author.  Often desirable on fics from [Archive
of Our Own](https://archiveofourown.org/) as it does this too.

### externals

Optional.  Default: true.  If true then any links to external sources that
`fetch-fic` understands will be added as appendices.

### words

Optional. The number of words in this work. This is used on the title page.

### tags

Optional.  Any tags associated with this work.  This is included on the
title page and the metadata.

## [[chapters]]

### name

Required.  Must be unique.  The name of the chapter, as it will appear in
the index and any chapter headings.

### link

Optional.  The URL from which this chapter was fetched. This is used in the
`bbcode` output index. This is also used if `fetchFrom` is missing to fetch
the content of the chapter.

### fetchFrom

Optional. Default: `link`. The URL or path to the content of a chapter.

### created

Optional. The date that this chapter was originally published.

### modified

Optional. The date that this chapter was most recently modified.

### author

Optional. The name of the author.  Ordinarily this is only used if
different then that of the work's author.

### authorUrl

Optional.  A URL to a profile page for the author of this chapter.  Not used
unless `author` is also set.  Ordinarily this is only used if different then
that of the work's authorUrl.

### tags

Optional. Tags associated with this chapter. Currently not used for anything.

### externals

Optional.  Default: true.  If true then any links to external sources that
`fetch-fic` understands will be added as appendices.  Overrides any
work-level setting.

### headings

Optional.  Default: false.  If true then a heading will be inserted at the
top of the chapter with the name of the chapter and, if different than that
of the work, the author. Often desirable with omake.

### words

Optional. The number words in this chapter. Used in some indexes.

## [[fics]]

These sections can be used to create multiple output files from a single
`.fic.toml`.  These sections have all of the same properties as the top
level.  Additionally, any not specified will default to the values given
at the top level.  (So, for example, if you don't have an `author` property
under `[[fics]]` then it will use the value you had at the top level.)

## [[fics.chapters]]

A chapter within a subfic. These have exactly the same properties as `[[chapters]]`.

# TODO

Stuff I'd like to see (user visible):

* A web UI
* More external site support:
  * Don't want to support every fic site ever, but…
  * More image sources for externing would be useful.
  * If generic wikia support is possible that would be super useful.
* Update CLI-UI:
  * Make a single unified command with subcommands, eg:
    * `ff meta <url|file>` - today's `fetch-meta`
    * `ff fetch <file>` - today's `fetch-fic`
    * `ff clear <url>` - what `clear.js` does
    * Something for what `scrape-authors.js` does now (maybe fold into
      `fetch-meta`)
    * Maybe something for generating index sheets

## LIMITED TESTING

While in principle this should work with most any XenForo site, it's only
been tested with the following:

* https://forums.sufficientvelocity.com
* https://forums.spacebattles.com
* https://forum.questionablequesting.com

Currently it will warn if you use it with another site.

## PRIOR ART

[FanFicFare](https://fanficfare.appspot.com/) ([as Calibre plugin](http://www.mobileread.com/forums/showthread.php?t=259221))
is a great general tool.  It can talk to everything `fetch-fic` can with the
exception of Deviant Art.  It also supports a whole slew of sites that
`fetch-fic` likely never will.  It's missing a couple of specific features
however:

* It has no facility for editing the chapter list before ebook creation.
* Is not as aggressive about cleaning up the HTML that goes in the epubs.
* It doesn't know how to split a single thread into multiple books.
* It doesn't bring in images or maintain intrachapter linking.
* It is substantially slower.
* Xenforo: It can't scrape indexes w/o threadmarks.
