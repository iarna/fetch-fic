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
Usage: fetch-meta <url> [options]

Options:
  --xf_user            value of your xf_user cookie
  --scrape             scrape the index instead of using threadmarks   [boolean]
  --and-scrape         pull chapters from BOTH the index AND the threadmarks
                                                                       [boolean]
<url> - The URL of the threads you want to epubize. These fetches are not cached so you're
guaranteed an up-to-date index.  This writes a metadata file out with the
extension `.fic.toml` for you to edit and pass to…

Usage: fetch-fic <fic(s)> [options] Options:
  --xf_user            value of your xf_user cookie

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
* Use `--scrape` if the thread doesn't have threadmarks but has an index post.
* Use `--and-scrape` if the thread has extra stuff in the index post that's
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
link = "https://forums.example.com/threads/example.12345/#post-7890"
created = 2016-09-25T01:11:36Z

[[chapters]]
name = "2"
link = "https://forums.example.com/threads/example.12345/page-2#post-9783"
created = 2016-10-02T03:17:23Z
```

# WIP WIP WIP

This is less work-in-progressy now, but it could have a smarter cache.  Also
a web UI would be keen.  On the other hand the shape of that UI is now
actually kind of clear, what with chapter list editing and what not.

## LIMITED TESTING

While in principle this should work with most any XenForo site, it's only
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
