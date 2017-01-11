# CHANGES TO `fetch-fic`

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
