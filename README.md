# xenforo-to-epub

Package up XenForo threadmarked threads up into epub ebooks ready for
reading in your ereader of choice.

## INSTALLATION

You'll need [Node.js](https://nodejs.org) to use this tool.  Once you have
it installation is pretty simple:

```console
$ npm install -g xenforo-to-epub
```


## USAGE

```
xenforo-to-epub <url> [<cookie>]
```

## EXAMPLE

```console
$ xenforo-to-epub https://forums.example.com/threads/example.12345/
Loading https://forums.example.com/threads/example.12345/page-4#post-24836618 with id #post-24836618
Loading https://forums.example.com/threads/example.12345/#post-24780695 with id #post-24780695
example.epub
$
```

## DETAIL

The tool will take any link to any page of a thread.

You can optionally pass the value of your `xf_session` cookie if you want to
download threads that are restricted to members of the site.  To get this
cookie you'll have to look in your browser.

The last line printed is the filename of the epub file it created for you.
This is produced from the thread title.

# WIP WIP WIP

This is a work in progress.  The cookie thing is super crude and the output
it produces could be prettier, but it seems to mostly work pretty well.

The code is literally what I threw together in an hour or so and as such ... 
could use some cleanup. Also some tests. =D

## LIMITED TESTING

While in principle this should work with most any XenForum site, it's only
been tested with the following:

* https://forums.sufficientvelocity.com
* https://forums.spacebattles.com
* https://forum.questionablequesting.com

Currently it will warn if you use it with another site.
