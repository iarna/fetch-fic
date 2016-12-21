# fetch-fic

This is a tool that can both turn fanfic from various sources into epub,
ready for your ereader, but it can ALSO take your freshly written fanfic and
prepare it for sharing easy peasy.

## IMPORT FICS FROM:

* Any [Xenforo](https://xenforo.com/) based forum, like: [spacebattles.com](https://forums.spacebattles.com/), [sufficientvelicity.com](https://forums.sufficientvelocity.com/), [questionablequesting.com](https://questionablequesting.com)
* [Archive of Our Own](https://archiveofourown.org/)
* [Fanfiction.Net](https://www.fanfiction.net/)
* Local folders full of rtf files– I use it with synced folders from
  Scriviner, though it should, to some degree, work on the actual Scriviner
  data files too.

## IMPORT OTHER STUFF FROM:

* [Deviant Art](https://www.deviantart.com/) (for linked fanart)
* [Wikipedia](https://www.wikipedia.org)
* [Youtube](https://youtube.com) (included as a thumbnail image linked to the video)
* [Gravatar](https://en.gravatar.com) & Wordpress Facebook Avatar Mirror (for forum avatars)
* Generic image handling– any url ending in jpg/jpeg/png/gif/svg will be
  accepted and included in an `<img>` tag.  Added primarily to allow
  links to images to be included in the Externals section.

## EXPORT FICS TO:

* epub – Ready for ereadering.
* bbcode – Ready for posting to various forum sites.
* ao3 – Ready for uploading to Archive of Our Own
* ffnet - Ready for uploading to FanFiction.net
* html – Ready for whatever else you come up with!

## NOTABLE FEATURES

* Support for cover images, both as ebook cover and in title pages.
* Images contained in the fic are brought into the final ebook.  (This
  includes smilies on Xenforo sites.)
* Xenforo threads that lack threadmarks can still be imported.
* Links between chapters are maintained and become links within the ebook
  itself.
* External links to other supported sites will optionally be added
  automatically as appendices and the links to them updated to stay in the
  ebook. This can give you a fully offline reading experience.
* Include chpater names as headings at the start of each chapter (if the
  original author didn't bother to do this).
* Content is aggressively cleaned for broad compatibility and for quality of
  display in ereaders.
* Messy Xenfor content is restyled for ebook use:
  * Spoiler boxes are styled as boxes w/o the "Spoiler" button.
  * Quoted text is styled without the "Expand/Collapse" buttons.
  * White-text is de-whited.
  * Invisitext is shown
  * mailto: links are delinked.
* Content is cached so that iterating to get the perfect config takes no
  time. And when a new chapter is posted only that has to be fetched.

## INSTALLATION

You'll need [Node.js](https://nodejs.org) to use this tool.  Once you have
that, installation is pretty simple:

```console
$ npm install -g fetch-fic
```

## USAGE

The tool is primarily split into two commands, one which reads all the info
about your fic and stores that in a file (that you can edit), and a second
that reads that file, fetches everything and creates the epub for you.  The
first tool can also UPDATE a fic instead of downloading it anew.

```
Usage: ff read <url> [options]

Options:
  --scrape                      scrape the index instead of using threadmarks
                                                                       [boolean]
  --and-scrape                  pull chapters from BOTH the index AND the
                                threadmarks                            [boolean]
  --xf_user                     the value to set the xf_user cookie to, for
                                authenticating with xenforo sites       [string]
                                                           [number] [default: 1]
<url> - The URL of the threads you want to epubize. These fetches are not cached so you're
guaranteed an up-to-date index.  This writes a metadata file out with the
extension `.fic.toml` for you to edit and pass to…
```

```
Usage: ff update <fic…> [options]

Options:
  --add-all                     if true, merge ALL missing chapters in instead
                                of just NEW ones      [boolean] [default: false]
  --xf_user                     the value to set the xf_user cookie to, for
                                authenticating with xenforo sites       [string]
                                                           [number] [default: 1]

<fic…> - The `.fic.toml` file(s) to download the latest chapters for.
```

```
Usage: ff generate <fic(s)> [options] Options:
  -o, --output                  Set output format
           [choices: "epub", "bbcode", "html", "ao3", "ffnet"] [default: "epub"]
                                                           [number] [default: 1]

<fic(s)> - The `.fic.toml` file(s) you want to get generate readable output
for. By default it'll make epubs, one for each file on the command line.
```

## EXAMPLE

```console
$ ff read https://forums.example.com/threads/example.12345/
example.fic.toml
$ ff generate example.fic.toml
⸨░░░░░░░░░░░░░░    ⸩ ⠋ example: Fetching chapters
```

… time passes …

```console
$ ff update example.fic.toml
Added 2 new chapters
Updated fic last udpate time from 2016-09-29T22:37:15Z to 2016-09-30T17:33:20Z
example.fic.toml
$ ff generate example.fic.toml
example.epub
$
```

## HINTS

* Xenforo: Use `--scrape` if the thread doesn't have threadmarks but has an index post.
* Xenforo: Use `--and-scrape` if the thread has extra stuff in the index post that's
  not threadmarked.  This is commonly where omake/meta-fanfic and fanart go.
* The fic files just text, open them up in an editor and they're pretty straightforward.
  For the technically minded, they're strictly speaking [TOML](https://github.com/toml-lang/toml).
* I often edit the fic files quite a bit.  The title determines the name of
  the epub file.

## EXPERIMENTAL BITS

There are some experimental bits that work for me but may or may not be
complete enough just yet to work for you.

* The `rtf` importer is distinctly incomplete, notably it's missing tables
  and stylesheets.  (But also tons of other less common things.) This
  doesn't impact my writing but YMMV.  I ended up writing my own because the
  other options available to me either didn't support how Scriviner closes
  underlines or didn't support unicode.  So it at least does those things
  right.  =p
* The `bbcode`, `ao3` and `ffnet` outputters are still veeery fresh code and
  probably need some more laps around the yard before they're really done.
  `style` attributes ARE supported, but `style` tags are not (yet).  The
  style translator is incomplete and a bit buggy. On the plus side, the HTML
  translator is probably very close to complete. The integration between the
  CSS translator and the HTML translator needs some work too.

Still, all that said, they're getting the job done for me, vastly reducing
the effort to post new fic chapters.

## CACHE

Yes, this thing has a cache.  It creates `~/.fetch-fic` (on Windows it does
something...  not entirely nonsensical, but you'll still get a dot file like
that).

In `~/.fetch-fic` you'll find compressed copies of everything `fetch-fic`
has ever downloaded.  If you remove the cache folder then `fetch-fic` will
recreate it on its next run but should otherwise work correctly (albeit more
slowly).

Nothing is ever expired from the cache, so it can get pretty big (mine
weighs ~1GB, but I also download an absurd amount of fic).

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

For `ff read`, forces the use of the cache instead of looking for a fresh
table of contents.

### --no-cache

For `ff generate`, disable the use of the cache when fetching chapter data.

### --no-network

Error if anything tries to access the network (on a cache-miss).  Note that
`--no-cache` and `--no-network` used together are guaranteed to error out.

## --requests-per-second=#

The maximum number of network requests that will be made per second.  This
defaults to `1` which seems to avoid everyone's flood protection, but if you
know you're fetching from a site that allows it, increasing this can make fic
downloading a lot faster.

### --concurrency=#

Set the maximum number of simultanteous network requests we'll do at a time.
This is limited in conjunction with `requests-per-second` and so only comes
into play when a site is unable to respond in `1/requests-per-second`
seconds, eg, if you set `requests-per-second` to `5`, then concurrency would
only happen when the site took great than 200ms to reply.  This limits how
many outstanding requests to a slow site are allowed.

### --output

Select the output format for `ff generate`.  This defaults to `epub`, but can
produce directories of files in `bbcode` and `html` formats.  Additionally
and can produce HTML specifically designed for import into Archive of Our
Own (`ao3`) and FanFiction.net (`ffnet`).

### --add-all

Modifies `ff read`'s behavior when updating an existing `.fic.toml` file.
Ordinarily it will only add chapters NEWER then the oldest chapter already
in your metadata file. If you pass in `--add-all` then it will add ANY chapter
missing from your `.fic.toml` file, no matter how old.

## WHAT FIC FILES LOOK LIKE

`ff read` produces `.fic.toml` files…

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
While `ff read` will never produce a file like this, `ff generate` will
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

Optional.  The URL of an image file to embed as the cover of this work. 
(Alternatively, this can be a filename, but it'll be relative to where you
run `ff generate`, which is not great.)

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

### includeTOC

Optional.  If true then a Table of Contents page will be generated and injected at the start of the fic.

### numberTOC

Optional.  If true then the navigation version of the table of contents will have numbers before each item.

### fetchMeta

If true and this is a xenforo based source then threadmarks will be used to
get the index when updating. This is addative with `scrapeMeta`.

### scrapeMeta

If true and this is a xenforo based source then the index page will be
scraped for chapters when updating. This is addative with `fetchMeta`.

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
* Provide some examples of a publishing workflow, 'cause it's quite nice at
  that.
* Make the rtf handler more complete.
* Better stylesheet handling in output.
* More external site support:
  * Don't want to support every fic site ever, but…
  * More image sources for externing would be useful.
  * If generic wikia support is possible that would be super useful.

## LIMITED XENFORO TESTING

While in principle this should work with most any XenForo site, it's only
been tested with the following:

* https://forums.sufficientvelocity.com
* https://forums.spacebattles.com
* https://forum.questionablequesting.com

Currently it will warn if you use it with another site.

## OTHER OPTIONS

* [FanFicFare](https://fanficfare.appspot.com/) ([as Calibre plugin](http://www.mobileread.com/forums/showthread.php?t=259221))
  is a great general tool.  It is missing a few of the less "ficcy" sites
  that `fetch-fic` supports, eg Deviant Art, Wikipedia, Youtube, etc, but it
  supports a whole slew of sites that `fetch-fic` likely never will.  The
  command line version can also *update* an existing epub.  (`fetch-fic`
  doesn't support this (yet), but outside of absurdly huge fics, it can
  recreate them as fast as it could update them.)
  [(Python)](https://github.com/JimmXinu/FanFicFare)
* [ficrip](https://ficrip.io/) is specialized for fanfiction.net currently
  and supports some things not found elsewhere, for instance using the
  associated image as a title page. [(Ruby)](https://github.com/toroidal-code/ficrip)
* [FicSave](http://ficsave.xyz/) supports fanfiction.net and a few more
  obsure sites.  [(PHP)](https://github.com/waylaidwanderer/FicSave)
* [Leech](https://github.com/kemayo/leech) supports ffnet, ao3, xenforo
  sites, deviant art and sta.sh.  It makes some different formatting
  choices, of particular note is displaying spoilers as footnotes (which
  show up as popup windows in ereaders). [(Python)](https://github.com/kemayo/leech)
