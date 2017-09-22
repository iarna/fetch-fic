# CHANGES TO `fetch-fic`

## v3.8.0

* Vastly improve concurrency limits. Saves you from newly strict Space Battles restrictions.
* ff update: You can now update fics that only contain other fics (series on ao3, for example)
* ff: CLI now uses more RAM by default
* Vastly better back-off support, log current status of requests in flight.
* Xenforo: Fix a crahser when no chapter was found
* Xenforo: Truncate to minutes when using unix timestamps.  This is
  important because recent articles get timestamps and older one's get
  date-time text with minute resolution.  Not having this results
  in churn.
* FFNet: Using rating as tag, instead of rated. Aligns with AO3.
* Recently two large xenforo sites, spacebattles.com and
  sufficientvelocity.com, started supporting categorized threadmarks which
  in turn implies categorized chapters.  This is now support with the `type`
  attribute on chapters.  Currently this bit of metadata is not used (all
  chapters are munged together) but in future I'd like to:
  * Add new chapters next to other chapters of their type.  This lets omake
    come after main chapters but still have new main chapters show up where
    we'd want them.
  * Prefix the type for non-chapter types during output.
  * Not count non-chapter words in word count.
  * Include non-chapter sections as roman-numeral chapters in the index/appendix.
* Pick up relationship markers from AO3 with `ship:` and `friendship:` prefixs in tags (like FFNet).
* Our useragent now advertises fetch-fic (or takes blame for our requests)
* Better subfic handling (default description, created, modified, author and authorurl from chapters).
* Subfics are sorted by creation date.
* `ff update --refresh` forces an update of the `.fic.toml` file even if we don't think there were changes.
* Support for congested sites asking us to backoff, both with site provided
  timeouts and just delaying on our own.
* Support for site-specific request limits (specifically for SpaceBattles
  which seems to be more strict).
* AO3: Support for fetching an entire series.  This produces a fic with
  subfics for each entry in the series.
* Fixes to the date calculations by using moment with timezones everywhere
  and hard coding timezones for the forum sites we know about.  (There's
  still date churn due to the timestamp data we get early on having higher
  resolution than the timestamp data we get later.)
* AO3: Cross linking now works when cross-links include anchors.
* Xenforo: Fix bug that mangled multiple spoiler tags in a single chapter.
* Xenforo: Add Quest tag if the forum looks like a quest & roleplay forum.
* Many fixes to cross-linking of resources.
* FFNet: When updating a fic, set the timestamp on the last chapter to the fic's timestamp.
* Xenforo: Tags when parsed out of the title now get a prefix to easily
  distinguish them from actual Xenforo tags.
* Cache: Corrupted entries are retried better now.
* Fics: New notes field goes along side description.  The value guessed by
  the Xenforo source now goes in Notes.  Description is now intended to
  always actually be a description/summary of the fic, where notes is
  anything else.
* Xenforo: Fetch all chapter data when initially getting metadata as much is chapter-specific.
* FFNet: Parse the fandom (or fandom and crossover) from ffnet fics.
* Update: When updating don't fallback to scraping if fetching is unavailable.
* FFNet: Correctly flag one-shots.
* Xenforo: Fix how color-styles are injected.

## v3.7.0

A big release so let's break this up. So first, important bug fixes:

* Xenforo dates were screwing up timezones.  We now consistently import
  dates and times correctly.  Previously we were using a value that was in
  the local timezone of the forum but treating it as if it was in the local
  timezone of the user.
* A BIG fix to FanFiction.net metadata parsing.  Specifically, this means
  the tags you get from FanFiction.net sources will now be consitent and
  complete.

Major features & behavior changes:

* Added new flag `ff update --fast` which skips a bunch of work if it's pretty sure there won't be any new chapters.
* When generating bbcode we no longer set the font family.
* `ff update`: Always set fic update times based on chapters and subfics.

Speed improvements:

* Speed up `ff generate` when it's used on multiple fics at once.

Minor features & behavior changes:

* Fics now support a new attribute: `altlinks`. This is optionally an array of
  other URLs that this fic is available from.
* Subfics now have their title default to the name of their first chapter.
* `ff cache-clear` now has an alias in `ff clear-cache` because I kept on
  typing the wrong one.
* `ff update` now returns an error if there was no update, success if there were new chapters.
  I use this like `ff update x.fic.toml && ff generate x.fic.toml` to get a
  new epub only if the fic has updated.  This inverts the previous behavior.
  The previous behaviour was problematic because errors were treated the
  same as updates and generally you wanted to trigger further actions on
  updates.  So errors would end up triggering the follow-on stages.

Minor bug fixes:

* Improve support for nested threadmarks.
* When importing RTF (from Scriviner or rtfdir sources) explicitly set an
  HTML5 doctype and UTF8 mimetype.

Error message improvements:

* Much improved error messages, particularly on various network-type errors.
* Report AO3's "down for maintenance errors" which are 200s.

## v3.6.0

* Fix a number of long standing layout issues involving indexes and chapters
  with different authors than that of the mainf ic.
* Fixed a crash in the `-o html` output mode.
* Improvements to error messages.
* Default subfic "tags" from the parent fic's tags.
* Default subfic "link" attribute from their first chapter instead of the
  parent fic.  This means subfics get a different epub identifier.
* Fixup more tumblr image links.
* Add new fic and chapter metadata "spoilers" that when false will suppress
  spoiler blocks from imported xenforo fics.
* Add `ff update --and-fetch` to force fetching of fics that were previously
  scraped.

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
