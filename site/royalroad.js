'use strict'
const url = require('url')
const Site = use('site')
const moment = require('moment')
const tagmap = use('tagmap')('royalroad')
const qr = require('@perl/qr')

class RoyalRoad extends Site {
  static matches (siteUrlStr) {
    const siteUrl = url.parse(siteUrlStr)
    const hostname = siteUrl.hostname
    if (hostname !== 'www.royalroad.com') {
      return false
    }
    return true
  }
  constructor (siteUrlStr) {
    super(siteUrlStr);
    this.publisher = 'royalroad.com';
    this.publisherName = 'royalroad';
    this.shortName = 'royalroad';
    this.type = 'royalroad';
  }
  async getFicMetadata (fetch, fic) {
    async function fetchWithCheerio (url) {
      const cheerio = require('cheerio');
      const result = await fetch(url);
      const [meta, html] = result;
      return cheerio.load(html);
    }

    fic.link = this.normalizeFicLink(this.link);
    fic.publisher = this.publisherName;

    const $ = await fetchWithCheerio(this.link);
    fic.title = $('.fic-title > [property="name"]').text();
    fic.author = $('.fic-title > [property="author"] a').text();
    fic.authorUrl = `https://www.royalroad.com${$('.fic-title > [property="author"] a').attr('href').trim()}`;
    fic.tags = $('.tags > [property="genre"]').map((_, t) => $(t).text()).get();
    $('tr[data-url]').each((_, chapter) => {
      const $chapter = $(chapter);
      const link = `https://www.royalroad.com${$chapter.attr('data-url')}`;
      const name = $($chapter.find('a')[0]).text().trim();
      const type = 'chapter';
      fic.chapters.addChapter({name, type, link})
    });
    fic.rawTags = fic.tags;
    fic.tags = tagmap(fic.tags);
    let cover = $('img.thumbnail').attr('src');
    // Generic covers are hosted on /Content/... instead of cdn
    if (!cover.startsWith('https://')) {
      cover = `https://www.royalroad.com${cover}`;
    }
  }
  async getChapter (fetch, chapterInfo) {
    const [meta, html] = await fetch(chapterInfo.fetchWith());
    const ChapterContent = use('chapter-content');
    const chapter = new ChapterContent(chapterInfo, {html, site: this});
    chapter.base = meta.finalUrl;
    if (meta.finalUrl !== chapter.link) {
      chapter.fetchFrom = chapter.link;
      chapter.link = meta.finalUrl;
    }
    chapter.created = chapter.$('time[unixtime]').attr('datetime');
    const $content = chapter.$('.chapter-inner.chapter-content');
    chapter.content = $content.html();
    return chapter;
  }
  async getUserInfo (fetch, externalName, link) {
  }
}

module.exports = RoyalRoad
