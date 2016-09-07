# xenforo-to-epub

Package up XenForo threadmarked threads up into epub ebooks ready for
reading in your ereader of choice.

## INSTALLATION

You'll need [Node.js](https://nodejs.org) to use this tool.  Once you have
dit installation is pretty simple:

```console
$ npm install -g xenforo-to-epub
```


## USAGE

```
Usage: xenforo-to-epub <url> [options]

Options:
  --xf_session         value of your xf_session variable
  --scrape             scrape the index instead of using threadmarks   [boolean]
  --and-scrape         pull chapters from BOTH the index AND the threadmarks
                                                                       [boolean]
  --chapter-list-only  fetch only the chapterlist and print as JSON    [boolean]
  --from-chapter-list  build an epub from a JSON chapterlist on disk    [string]

<url> - The URL of the thread you want to epubize
```

## EXAMPLE

```console
$ xenforo-to-epub https://forums.example.com/threads/example.12345/
⸨░░░░░░░░░░░░░░    ⸩ ⠋ example: Fetching chapters
```

## TYPICAL USE

I usually pull down a chapter list:

```console
$ xenforo-to-epub --chapter-list-only https://forums.example.com/threads/example.12345/ > example.json
```

If there's stuff in the first post that's not threadmarked (usually Omake) I'll grab that too:

```console
$ xenforo-to-epub --chapter-list-only --and-scrape https://forums.example.com/threads/example.12345/ > example.json
```

And then edit that till it looks right.  If I do `--and-scrape` then editing
it is usually mandatory as often there will be duplicates between what's
scraped from the first post and the threadmarks.

Once I'm happy with the result I pull down the epub:

```console
$ xenforo-to-epub --from-chapter-list example.json https://forums.example.com/threads/example.12345/
```

If the epub ends up not being right I can rerun that as much as I like and
it'll be super fast as all of the raw pages fetched are cached so we won't
be hitting the site again.

## DETAIL

The tool will take any link to any page of a thread.  But if you intend to
scrape it should be a link to the index page.

The last line printed is the filename of the epub file it created for you.
This is produced from the thread title.


All of the arguments are optional

### --xf_session <cookie>

You can optionally pass the value of your `xf_session` cookie if you want to
download threads that are restricted to members of the site.  To get this
cookie you'll have to look in your browser. It's a pain ¯\\\_(ツ)\_/¯

### --scrape

If included then instead of fetching threadmarks we'll slurlp links from the
URL you specified and count those as chapters.

### --and-scrape

Fetch threadmarks AND slurp links from the URL you specified. Often results in
duplicates but it's also often the only way to get _everything_.

### --chapter-list-only

Instead of producing an epub, print out the chapter list as JSON. If you put this
in a file it can be used by `--from-chapter-list` below. If you specify this option
the cache is always skipped and a fresh copy of the URL(s) involved downloaded.

### --from-chapter-list <file.json>

Will skip the threadmark/scrape step and read the chapter list from the file you specified.

# WIP WIP WIP

This is less work-in-progressy now, but it could have a smarter cache.  Also
a web UI would be keen.

## LIMITED TESTING

While in principle this should work with most any XenForum site, it's only
been tested with the following:

* https://forums.sufficientvelocity.com
* https://forums.spacebattles.com
* https://forum.questionablequesting.com

Currently it will warn if you use it with another site.

## PRIOR ART

[FanFicFare](https://fanficfare.appspot.com/) ([as Calibre plugin](http://www.mobileread.com/forums/showthread.php?t=259221))
knows how to talk to the sites
this has been tested with.  It's a great general tool.  It's missing a
couple of specific features however:

* It can't scrape indexes w/o threadmarks.
* It has no facility for editing the chapter list before ebook creation.
* Is not as aggressive about cleaning up the HTML that goes in the epubs.
