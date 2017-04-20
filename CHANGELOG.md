# CHANGES TO `fetch-fic`

## v3.5.1

* Normalize FanFiction.net chapter links more thoroughly for better cache utilization.
* Impoved parsing of tags and other metadata from FanFiction.net.
* Fix a bug with Archive of Our Own, where fics without summaries would cause a crash
* Fix a bug in importing fic status from tags.
* Fix a bug in how externals that failed to download were reported.

## v3.5.0

* Improve output of the word count in the index, making it smaller and the
  "[Words: ###]" part a single unwrappable unit.
* Scriviner support: Don't crash on empty chapters, just skip over them.
* Much better progress indicator, especially when generating output for
  multiple fics.
* Export our epubs with calibre custom field metadata for: `updated`,
  `words`, `authorurl`, `status` and `fandom`.  If you have these `words`
  needs to be an int.  `status` needs to be an enumeration of `stalled`,
  `abandoned, `complete`, `one-shot` and `in-process`.  And the rest need to
  be a `text` type.  If you don't have these columns then calibre will
  ignore them when importing.
* Better error messages for login failures. Hint at the right options.
* Sanity check in `ff get`: If we get to the point of saving a fic to disk,
  don't write it if we didn't find any words. Thanks to [@cwgreene](https://github.com/cwgreene).
* Numbered TOCs are now the default (now that we use roman numerals on the
  non-chapter parts, number is much better).
* Fix crash in Xenforo sources when a threadmark index was present but it
  contains no chapters.  (This happens if threadmarks were added and then
  removed.)

## v3.4.1

* Improve error messages for missing fics.
* Report requests for fics that don't exist on fanfiction.net the same way
  we do for other sites.  Previously it would write a `.fic.toml` file.
* Make sure we clear the progress bar before exiting with an error.
* Fix a crash when inflating fics that only have subfics (and no chapters)

## v3.4.0

* Improve modified and created times in both `fic get` and `fic update`
* Start timing out network requests if they run too long.
* Allow external links that don't include a protocol in their URLs. That is,
  treat a link to `www.google.com` as `https://www.google.com`
* One of the enumerated tumblr media machines now consistently returns
  errors.  Transparently change links to it to another one so that image
  fetches can succeed.
* Improve xenforo color handling to be more consistent and less weird.
  Lightness is now applied consistently and different colors are represented
  consistently by different border styling.
* Improve table of contents number, with non-chapter pages getting roman
  numeral.
* Scriviner RTF sources are allowed to embed bbcode.  Particularly handy for
  things like [quote][/quote].
* Added `--add-none` option to `ff update` so you can update word counts and
  dates without adding chapters.
* Improve latency. Commandline should feel more zippy.
* Improve extras and image handling for non-epub targets and associated
  cross-linking.
* Pushed the RTF parser out into its own project as
  [@iarna/rtf-to-html](https://npmjs.com/package/@iarna/rtf-to-html).
* Pushed the inflight promise module into its own project as
  [promise-inflight](https://npmjs.com/package/promise-inflight).

* Stop choking on invalid dates, just ignore them.
* Stop coking on bad cookies, just ignore them.
* Fix a bug in the AO3 begin/end note collection and fic summaries that
  would result in only the first paragraph being used.
* Fix a bug in the Fanfiction.net importer that would cause stories with
  only one one chapter to fail.
* Fixed bug in the xenforo input where if a page of a thread had previously
  been cached then our attempt to break the cache and get a more recent copy
  would fail.  This is bad if a new chapter showed up on the same page as an
  older one.
* Fixed bug in fetching age-restricted AO3 fics.


## v3.3.1

Quick fix release for thing where `ff get` is aliased to `ff generate` if
you give it a toml file as an arg.

## v3.3.0

Ok, so I'm finally writing a changelog for this thing.  Not gonna do it
retroactively though.

* Scriviner and RTF-folders support superscript and subscript now.  Fixed a
  long standing bug that inserted extraneous spaces in to generated HTML.
* Switched to [my own](https://www.npmjs.com/package/@iarna/word-count) word count library.
* Reduced parsing time on large fics by rewriting chapter handling to
  parse/serialize HTML as little as posssible.
* Vastly improve `ff update` to better select chapters for inclusion and to update word counts and 
  modification times where needed.
* Fix bug that was resulting in inline images in externals to not link properly.
