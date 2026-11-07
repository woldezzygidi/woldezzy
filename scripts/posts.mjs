#!/usr/bin/env node
/**
 * scripts/posts.mjs — WXR → journal pages.
 *
 * Reads a WordPress export, converts Gutenberg/classic HTML to clean semantic
 * markup, writes pages/journal/<slug>.html fragments plus pages/journal.html
 * (index), and emits scripts/posts.json for build.mjs (latest-3 on home) and
 * scripts/covers.mjs (featured images).
 *
 * Editorial policy encoded here:
 *   - posts < 300 words published before 2021 → "archive" tier, noindex
 *   - everything else → "featured" tier, indexed, listed first
 *
 * Usage: node scripts/posts.mjs path/to/export.xml
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2];
if (!SRC) { console.error('usage: node scripts/posts.mjs export.xml'); process.exit(1); }

const xml = readFileSync(SRC, 'utf8');

/* ── minimal WXR item parser (no deps) ───────────────────── */
const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
const tag = (s, t) => { const m = s.match(new RegExp(`<${t}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${t}>`)); return m ? m[1] : ''; };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&#8217;/g, '’').replace(/&#8216;/g, '‘').replace(/&#8220;/g, '“').replace(/&#8221;/g, '”').replace(/&#8211;/g, '–').replace(/&#8230;/g, '…');

/* Consolidated: near-duplicate posts folded into one canonical. Dropped from output; 301 in vercel.json. */
const CONSOLIDATE = {
  'basic-seo-techniques-all-you-need-to-know': 'basic-seo-techniques-your-ultimate-guide-to-getting-started',
  'basic-seo-techniques-a-beginners-guide':    'basic-seo-techniques-your-ultimate-guide-to-getting-started',
};

const posts = items
  .filter((s) => tag(s, 'wp:post_type') === 'post' && tag(s, 'wp:status') === 'publish')
  .map((s) => {
    const cats = [...s.matchAll(/<category domain="category"[^>]*>(?:<!\[CDATA\[)?([^\]<]+)/g)].map((m) => m[1].trim());
    const tags = [...s.matchAll(/<category domain="post_tag"[^>]*>(?:<!\[CDATA\[)?([^\]<]+)/g)].map((m) => m[1].trim());
    const metaDesc = (s.match(/<wp:meta_key>(?:<!\[CDATA\[)?_yoast_wpseo_metadesc(?:\]\]>)?<\/wp:meta_key>\s*<wp:meta_value>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/wp:meta_value>/) || [])[1] || '';
    return {
      slug: tag(s, 'wp:post_name'),
      title: unesc(tag(s, 'title')).trim().replace(/\s+[–—-]\s+(Part \d)/i, ': $1').replace(/\s+[–—]\s+/g, ': '),
      date: tag(s, 'wp:post_date').slice(0, 10),
      modified: tag(s, 'wp:post_modified').slice(0, 10),
      excerpt: unesc(tag(s, 'excerpt:encoded')).replace(/<[^>]+>/g, '').trim(),
      metaDesc: unesc(metaDesc).trim(),
      categories: cats,
      tags,
      raw: tag(s, 'content:encoded'),
    };
  })
  .filter((p) => !CONSOLIDATE[p.slug])
  .sort((a, b) => (a.date < b.date ? 1 : -1));

/* ── Gutenberg/classic → clean HTML ───────────────────────── */
function clean(html, slug) {
  let h = html;
  h = h.replace(/<!--\s*\/?wp:[^>]*-->/g, '');                          // block comments
  h = h.replace(/<script[\s\S]*?<\/script>/gi, '');
  // Classic-editor shortcodes: [caption] → <figure>, drop anything else.
  h = h.replace(/\[caption[^\]]*\]([\s\S]*?)\[\/caption\]/g, (m, inner) => {
    const img = (inner.match(/<img[^>]*>/) || [''])[0];
    const cap = inner.replace(/<a[^>]*>|<\/a>|<img[^>]*>/g, '').trim();
    return `<figure>${img}${cap ? `<figcaption>${cap}</figcaption>` : ''}</figure>`;
  });
  h = h.replace(/\[\/?[a-z_]+[^\]]*\]/g, '');
  h = h.replace(/<div[^>]*class="wp-block-yoast-seo-table-of-contents[\s\S]*?<\/div>/gi, '');
  h = h.replace(/\sclass="[^"]*"/g, '').replace(/\sstyle="[^"]*"/g, '').replace(/\sid="[^"]*"/g, '');
  // LinkedIn / editor paste residue on anchors (tracking + hovercard attrs).
  h = h.replace(/\sdata-[a-z-]+="[^"]*"/g, '');
  // External anchors: open in new tab safely. Internal (/…) left alone.
  h = h.replace(/<a\s+href="(https?:\/\/[^"]+)"([^>]*)>/g, (m, url, rest) => {
    if (/woldezzy\.xyz/.test(url)) return m;
    const hasRel = /\srel=/.test(rest), hasTarget = /\starget=/.test(rest);
    return `<a href="${url}"${rest}${hasRel ? '' : ' rel="noopener"'}${hasTarget ? '' : ' target="_blank"'}>`;
  });
  h = h.replace(/<(p|li|h[1-6])>\s*(&nbsp;|\s)*<\/\1>/g, '');          // empty blocks
  h = h.replace(/<br\s*\/?>\s*<br\s*\/?>/g, '</p><p>');
  // Normalise heading levels: the shallowest level used becomes h2, deeper levels shift up by the same amount.
  h = h.replace(/<(\/?)h1[\s>]/g, '<$1h2>');
  const used = [...new Set([...h.matchAll(/<h([2-6])[\s>]/g)].map((m) => +m[1]))].sort();
  if (used.length && used[0] > 2) {
    const shift = used[0] - 2;
    h = h.replace(/<(\/?)h([2-6])([\s>])/g, (m, c, l, t) => `<${c}h${Math.max(2, +l - shift)}${t}`);
  }
  // Collapse skips inside the body (e.g. h2 → h4): walk and clamp each heading to previous+1.
  let prev = 1;
  h = h.replace(/<h([2-6])([\s>])([\s\S]*?)<\/h\1>/g, (m, l, t, inner) => { const lvl = Math.min(+l, prev + 1); prev = lvl; return `<h${lvl}${t}${inner}</h${lvl}>`; });
  // absolute → site-relative for internal links
  h = h.replace(/https?:\/\/(?:www\.)?woldezzy\.xyz\//g, '/');
  // series nav box (inline-styled div) → semantic aside
  h = h.replace(/<div>\s*<p><strong>📘 Product Marketing Career Series<\/strong><\/p>\s*<ul>([\s\S]*?)<\/ul>\s*<\/div>/, '<aside class="series" aria-label="Series navigation"><p class="series__title">Product Marketing Career Series</p><ol class="series__list">$1</ol></aside>');
  // images: rewrite to local, strip size suffix, add lazy
  h = h.replace(/<img([^>]*?)src="([^"]+)"([^>]*)>/g, (m, a, src, b) => {
    const file = src.split('/').pop().replace(/-\d+x\d+(?=\.\w+$)/, '');
    const w = (m.match(/width="(\d+)"/) || [])[1] || '1200';
    const ht = (m.match(/height="(\d+)"/) || [])[1] || '800';
    const alt = (m.match(/alt="([^"]*)"/) || [])[1] || '';
    return `<img src="/public/images/posts/${slug}/${file}" width="${w}" height="${ht}" alt="${alt}" loading="lazy" decoding="async">`;
  });
  h = h.replace(/<figure>\s*<img/g, '<figure><img');

  /* ── House style ─────────────────────────────────────────────
     1. "Label – description" inside <li> or <p> → <strong>Label.</strong> description
     2. Remaining en/em dashes: parenthetical aside → commas; trailing clause → full stop;
        before a list/explanation → colon. Decided by what follows the dash.
     3. Known AI-pattern phrases → plain alternatives (word-level; voice untouched).
     ──────────────────────────────────────────────────────────── */
  h = h.replace(/<(li|p)>\s*(<strong>)?([A-Z][^<–—:-]{2,60}?)(<\/strong>)?\s+[–—-]\s+/g, (m, tag, so, label, sc) => `<${tag}><strong>${label.trim().replace(/\.$/, '')}.</strong> `);
  h = h.replace(/<(h[2-4])>([^<]*?)\s+[–—]\s+([^<]*?)<\/\1>/g, '<$1>$2: $3</$1>');         // "The Modern Job – What Stays" → "The Modern Job: What Stays"
  // paired dashes = aside → commas
  h = h.replace(/\s+[–—]\s+([^–—<.!?]{3,80}?)\s+[–—]\s+/g, ', $1, ');
  // dash followed by lowercase continuation that reads as a list/explanation → colon
  h = h.replace(/\s*[–—]\s+(?=(?:[a-z][^.!?<]*,\s*[a-z][^.!?<]*(?:,|\s+and\s+)))/g, ': ');
  // dash before a capitalised or clause-initial word → full stop
  h = h.replace(/([a-z0-9\u2019'")])\s*[–—]\s+([A-Z])/g, '$1. $2');
  // anything left → comma (shortest safe fallback)
  h = h.replace(/\s*[–—]\s*/g, ', ');
  // spaced hyphen used as a dash: "x - y" (never "Mon-Thu", "$200/month", "e-mail")
  h = h.replace(/([a-z0-9\u2019'")])\s+-\s+([A-Z])/g, '$1. $2');
  h = h.replace(/(\w)\s+-\s+(\w)/g, '$1, $2');
  h = h.replace(/,\s*,/g, ',').replace(/\.\s*\./g, '.').replace(/:\s*:/g, ':');

  const AI = [
    [/\bleverag(e|es|ing|ed)\b/gi, (m, t) => ({e:'use',es:'uses',ing:'using',ed:'used'})[t.toLowerCase()]],
    [/\bdelve(s|d)? (into|deeper)\b/gi, 'look at'],
    [/\bdive(s|d)? (deep|deeper) into\b/gi, 'go into'],
    [/\bin today['\u2019]s (fast-paced |rapidly changing |ever-evolving |digital )?(world|landscape|era|age|economy)\b/gi, 'today'],
    [/\bthe (digital |marketing |seo |business )?landscape\b/gi, 'the market'],
    [/\bgame[- ]changer\b/gi, 'a big shift'],
    [/\bseamless(ly)?\b/gi, (m, ly) => ly ? 'smoothly' : 'smooth'],
    [/\bunlock(s|ed|ing)? (the )?(full |true |real )?potential\b/gi, 'get more out of it'],
    [/\bnavigat(e|ing) the\b/gi, (m, t) => t === 'e' ? 'work through the' : 'working through the'],
    [/\bit['\u2019]s (important|crucial|essential|vital) to (note|remember|understand) that\b/gi, 'Note that'],
    [/\bin conclusion,?\s*/gi, ''],
    [/\bfurthermore,?\s*/gi, ''],
    [/\bmoreover,?\s*/gi, ''],
    [/\badditionally,?\s*/gi, ''],
    [/\bultimately,?\s*/gi, ''],
    [/\bembark(s|ed|ing)? on\b/gi, 'start'],
    [/\brobust\b/gi, 'strong'],
    [/\bholistic(ally)?\b/gi, (m, ly) => ly ? 'as a whole' : 'whole'],
    [/\bsynerg(y|ies|istic)\b/gi, 'fit'],
    [/\bcutting[- ]edge\b/gi, 'new'],
    [/\bever[- ]evolving\b/gi, 'changing'],
    [/\bfuture[- ]proof(ing)?\b/gi, 'durable'],
    [/\bstay ahead of the curve\b/gi, 'keep up'],
    [/\bat the end of the day,?\s*/gi, ''],
    [/\bwhether you['\u2019]re a [^,.]+? or a [^,.]+?,\s*/gi, ''],
    [/\bthe (digital )?(economy|age|era)\b/gi, 'now'],
    [/\btapestry\b/gi, 'mix'],
    [/\bparadigm shift\b/gi, 'big change'],
    [/\bsupercharge\b/gi, 'boost'],
    [/\bskyrocket(s|ed|ing)?\b/gi, (m, t) => ({'':'jump',s:'jumps',ed:'jumped',ing:'jumping'})[t||'']],
  ];
  for (const [re, rep] of AI) h = h.replace(re, rep);
  h = h.replace(/\bTwitter\b(?![^<]*<\/a>)/g, 'X (formerly Twitter)').replace(/X \(formerly Twitter\)([^.]*?)X \(formerly Twitter\)/g, 'X (formerly Twitter)$1X');

  /* Per-post editorial fixes. Dated statistics are anchored to their year rather than
     presented as current; a handful of sentences that the generic rules left awkward are rewritten. */
  const EDITS = {
    'social-media-marketing-building-an-engaged-online-community': [
      ['Engagement is down across many platforms this year.', 'Engagement fell across most platforms in 2024, and the trend has not reversed.'],
      ['One trusted report says Instagram engagement fell', 'Rival IQ\u2019s 2024 benchmark report put Instagram engagement down'],
      ['Rival IQ\u2019s 2024 median was 0.43%, which many still use as a target.', 'Rival IQ\u2019s 2024 median was 0.43%. Treat it as a floor, not a target.'],
      ['Example: on Instagram this year, carousels often win.', 'Example: on Instagram, carousels have outperformed Reels for engagement since 2024.'],
      ['Try more carousels on IG.', 'Try more carousels on Instagram.'],
      ['Here\u2019s the thing: community is not about', 'Community is not about'],
    ],
    'learn-how-to-scale-your-business-with-seo': [
      ['looks like it\u2019s on life support, flat, barely twitching.', 'looks like it is on life support. Flat. Barely twitching.'],
      ['I\u2019ll show you exactly how to use SEO as a growth engine, step-by-step, no fluff, so you can', 'I will show you how to use SEO as a growth engine, step by step, so you can'],
      ['you\u2019re not just getting random clicks, you\u2019re putting', 'you are not getting random clicks. You are putting'],
      ['That\u2019s warm traffic. That\u2019s money-in-the-bank traffic.', 'That is warm traffic.'],
      ['Scaling SEO without a solid foundation is like pouring water into a basket, effort wasted.', 'Scaling SEO without a solid foundation is pouring water into a basket.'],
      ['you\u2019ll burn out faster than a cheap generator in Lagos', 'you will burn out faster than a cheap generator in Lagos'],
      ['Scaling SEO isn\u2019t about working more hours, it\u2019s about building systems', 'Scaling SEO is not about working more hours. It is about building systems'],
      ['That bait-and-switch didn\u2019t just kill conversions, it dented the brand\u2019s', 'That bait-and-switch killed conversions and dented the brand\u2019s'],
    ],
    'governance-privacy-and-risk-in-ai-marketing-what-digital-managers-must-know': [
      ['A global survey in 2024 showed that about 70 out of every 100 companies', 'McKinsey\u2019s 2024 State of AI survey found that about 70 out of every 100 companies'],
      ['Research found that nearly 6 in 10 Google searches end without a click', 'SparkToro\u2019s 2024 study found that nearly 6 in 10 Google searches end without a click'],
      ['Don\u2019t expect them to be perfect, treat them as raw material.', 'Do not expect them to be perfect. Treat them as raw material.'],
      ['leaned heavily on attribution models, \u201cthis click led to that sale.\u201d', 'leaned heavily on attribution models: \u201cthis click led to that sale.\u201d'],
      ['A good digital marketing manager doesn\u2019t just push growth, they protect the company too.', 'A good digital marketing manager does not just push growth. They protect the company too.'],
    ],
    'paying-for-seo-tools-smart-investment-or-monthly-money-drain': [
      ['Omo, I wouldn\u2019t lie, it\u2019s a tussle between', 'I will not lie, it is a tussle between'],
    ],
  };
  for (const [a, b] of (EDITS[slug] || [])) h = h.split(a).join(b);
  // Capitalise sentence starts that lost their opener ("Furthermore, the X" → "the X")
  h = h.replace(/(<p>|[.!?]\s+)([a-z])/g, (m, pre, c) => pre + c.toUpperCase());

  // Autolink. Operates on text nodes only: split on tags, never touch anything inside <a>…</a>,
  // and only link real-looking hosts (excludes placeholder domains used as prose examples).
  const PLACEHOLDER = /^(https?:\/\/)?(www\.)?(mysite|example|yoursite|yourdomain|domain|site)\.(com|org|net)/i;
  const parts = h.split(/(<a\b[\s\S]*?<\/a>|<[^>]+>)/g);
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (!seg || seg.startsWith('<')) continue;           // tag or anchor block
    let out = seg;
    // bare URLs
    out = out.replace(/(^|[\s(>])(https?:\/\/[^\s<)"']+[^\s<)"'.,;:!?])/g, (m, pre, url) =>
      PLACEHOLDER.test(url) ? m : `${pre}<a href="${url}" rel="noopener" target="_blank">${url}</a>`);
    // @handles → X profile (only the author's own handle; others are ambiguous across networks)
    out = out.replace(/(^|[\s(])@woldezzy\b/g, '$1<a href="https://x.com/woldezzy" rel="noopener me" target="_blank">@woldezzy</a>');
    parts[i] = out;
  }
  h = parts.join('');
  h = h.replace(/\n{3,}/g, '\n\n').trim();
  return h;
}

const words = (html) => html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
const readMins = (n) => Math.max(1, Math.round(n / 220));
const fmtDate = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const CAT_MAP = { 'My Web Designs': 'AI & Governance', 'Website Optimization': 'Analytics', 'mobile applications': 'Mobile', 'Mobile Network': 'Mobile', 'Smartphones': 'Mobile', 'Product Marketing Series': 'Product Marketing' };
const primaryCat = (p) => { const c = p.categories.find((x) => x !== 'My Web Designs') || p.categories[0] || 'Journal'; return CAT_MAP[c] || c; };

/* ── description: Yoast meta → excerpt → first paragraph ───── */
function desc(p, body) {
  let cand = p.metaDesc || p.excerpt || '';
  if (cand.replace(/<[^>]+>/g, '').trim().length < 60) {
    // No usable meta: take body prose until ~160 chars, across paragraphs.
    cand = body.replace(/<(h[1-6]|aside|figure)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ');
  }
  let t = cand.replace(/\s+/g, ' ').trim();
  t = t.replace(/([a-z0-9\u2019'")])\s*[–—]\s+([A-Z])/g, '$1. $2').replace(/\s*[–—]\s*/g, ', ').replace(/,\s*,/g, ',');
  return t.length > 160 ? t.slice(0, 157).replace(/\s\S*$/, '') + '…' : t;
}

mkdirSync(join(ROOT, 'pages', 'journal'), { recursive: true });

/* Pre-compute tiering + category for every post so related-post selection can see the whole set. */
const ARCHIVE_FORCE_PRE = new Set(['iphone-8-is-the-newest-magic-with-wireless-charging-and-glass-frame']);
const pre = posts.map((p) => {
  const body = clean(p.raw, p.slug);
  const n = words(body);
  return { ...p, body, n, cat: primaryCat(p), tier: (ARCHIVE_FORCE_PRE.has(p.slug) || (n < 300 && p.date < '2021-01-01')) ? 'archive' : 'featured',
    series: /product-marketing|starting-a-career-in-ppm/.test(p.slug) ? 'pmm' : null };
});
function related(self, k = 3) {
  const pool = pre.filter((q) => q.slug !== self.slug && q.tier === 'featured');
  const score = (q) => (self.series && q.series === self.series ? 100 : 0) + (q.cat === self.cat ? 10 : 0) - Math.abs(new Date(q.date) - new Date(self.date)) / 3.15e10;
  return pool.sort((a, b) => score(b) - score(a)).slice(0, k);
}
const relCard = (q) => `        <a href="/journal/${q.slug}/" class="post-card">
          <span class="post-card__date"><time datetime="${q.date}">${fmtDate(q.date)}</time> · ${q.cat}</span>
          <div class="post-card__thumb"><picture>
            <source type="image/avif" srcset="/public/images/covers/${q.slug}-960.avif">
            <source type="image/webp" srcset="/public/images/covers/${q.slug}-960.webp">
            <img src="/public/images/covers/${q.slug}.jpg" width="1600" height="900" alt="" loading="lazy" decoding="async">
          </picture></div>
          <h3 class="post-card__title">${q.title}</h3>
        </a>`;

const SEO_TITLE = {
  '5-ways-you-can-use-google-analytics-for-conversion': 'Five ways to use Google Analytics for conversion',
  'do-you-have-content-ideas-for-the-covid-19-lockdown-if-not-check-this': 'Content ideas for the COVID-19 lockdown',
  'entities-not-keywords-ai-recognition': 'Entities, not keywords: how AI search recognises you',
  'gain-organic-traffic-at-zero-cost-strategies-and-insights-from-wole-oduwole': 'How to gain organic traffic at zero cost',
  'google-algorithm-update-june-2018-google-gives-more-attention-to-video-content': 'Google June 2018 update: more weight on video content',
  'governance-privacy-and-risk-in-ai-marketing-what-digital-managers-must-know': 'Governance, privacy and risk in AI marketing',
  'iphone-8-is-the-newest-magic-with-wireless-charging-and-glass-frame': 'iPhone 8: wireless charging and a glass frame',
};
const DROP = new Set(["iphone-8-is-the-newest-magic-with-wireless-charging-and-glass-frame", "mtn-to-increase-data-tariff-blames-it-on-ncc-regulations", "whats-life-without-data-airtel-fires-shots-at-glo-others", "how-to-make-video-call-on-whatsapp"]);
const out = [];
for (const p of posts) {
  if (DROP.has(p.slug)) continue;
  const body = clean(p.raw, p.slug);
  const n = words(body);
  // Editorial overrides: off-brand consumer-tech news stays in the archive regardless of length.
  const ARCHIVE_FORCE = new Set(['iphone-8-is-the-newest-magic-with-wireless-charging-and-glass-frame']);
  const tier = (ARCHIVE_FORCE.has(p.slug) || (n < 300 && p.date < '2021-01-01')) ? 'archive' : 'featured';
  const cat = primaryCat(p);
  const d = desc(p, body);
  const series = /product-marketing|starting-a-career-in-ppm/.test(p.slug) ? 'Product Marketing Career Series' : null;
  const seriesNo = series ? (p.slug.includes('part-1') ? 1 : p.slug.includes('part-2') ? 2 : 3) : null;
  const imgRefs = [...body.matchAll(/\/public\/images\/posts\/[^"]+/g)].map((m) => m[0]);

  const meta = {
    title: SEO_TITLE[p.slug] || (p.title.length <= 52 ? `${p.title} · 'Wole Oduwole` : p.title),
    desc: d,
    path: `/journal/${p.slug}/`,
    ogType: 'article',
    ogImage: `https://woldezzy.xyz/public/images/covers/${p.slug}.jpg`,
    priority: tier === 'featured' ? '0.7' : '0.3',
    noindex: tier === 'archive',
    schema: {
      '@context': 'https://schema.org',
      '@graph': [{
      '@type': 'BlogPosting',
      '@id': `https://woldezzy.xyz/journal/${p.slug}/#article`,
      headline: p.title,
      description: d,
      datePublished: p.date,
      dateModified: p.modified || p.date,
      author: {
        '@type': 'Person',
        '@id': 'https://woldezzy.xyz/#person',
        name: "'Wole Oduwole",
        alternateName: 'Adewole Oduwole',
        url: 'https://woldezzy.xyz/about/',
        jobTitle: 'SEO Consultant and Growth Marketing Executive',
        image: 'https://woldezzy.xyz/public/images/wole-oduwole-seogidi-960.jpg',
        sameAs: ['https://www.linkedin.com/in/woldezzy/', 'https://x.com/woldezzy', 'https://orcid.org/0009-0001-9302-3329'],
      },
      publisher: { '@id': 'https://woldezzy.xyz/#person' },
      image: `https://woldezzy.xyz/public/images/covers/${p.slug}.jpg`,
      url: `https://woldezzy.xyz/journal/${p.slug}/`,
      mainEntityOfPage: `https://woldezzy.xyz/journal/${p.slug}/`,
      articleSection: cat,
      keywords: p.tags.join(', '),
      wordCount: n,
      inLanguage: 'en-GB',
      isPartOf: { '@id': 'https://woldezzy.xyz/journal/#blog' },
      }, {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://woldezzy.xyz/' },
          { '@type': 'ListItem', position: 2, name: 'Journal', item: 'https://woldezzy.xyz/journal/' },
          { '@type': 'ListItem', position: 3, name: p.title, item: `https://woldezzy.xyz/journal/${p.slug}/` },
        ],
      }],
    },
  };

  const NOTES = {
    'how-to-reduce-bounce-rate-on-your-website': 'This piece was written in 2019 against Universal Analytics. GA4 retired bounce rate in favour of engagement rate in 2023. The behavioural advice still holds; the metric names do not.',
    'do-you-have-content-ideas-for-the-covid-19-lockdown-if-not-check-this': 'Written in April 2020, during the first UK and Nigerian lockdowns. Kept as a record of how content strategy adapted that month.',
    'why-you-should-move-to-https-today': 'Written in 2017, when HTTPS was still a choice. It is now a baseline. The reasoning is kept for the record.',
    'should-i-use-outbound-link-open-link-in-new-tab-in-my-post': 'Written in 2018. The accessibility argument against forcing new tabs has strengthened since; the SEO argument is unchanged.',
  };
  const note = NOTES[p.slug] ? `<aside class="note" role="note"><p><strong>Editor\u2019s note, 2026.</strong> ${NOTES[p.slug]}</p></aside>\n` : '';

  const fragment = `<!--meta
${JSON.stringify(meta, null, 2)}
-->
<article class="post" itemscope itemtype="https://schema.org/BlogPosting">
  <header class="page-hero post__hero">
    <div class="container container--wide">
      <nav aria-label="Breadcrumb">
        <ol class="crumbs">
          <li><a href="/">Home</a></li>
          <li><a href="/journal/">Journal</a></li>
          <li><span aria-current="page" class="crumbs__current">${p.title}</span></li>
        </ol>
      </nav>
      <p class="eyebrow page-hero__eyebrow"><span class="eyebrow__index">${cat}</span> <time datetime="${p.date}">${fmtDate(p.date)}</time> · ${readMins(n)} min read${tier === 'archive' ? ' · Archive' : ''}</p>
      <h1 class="page-hero__title post__title" itemprop="headline">${p.title}</h1>
      <p class="post__byline-top">By <a href="/about/" rel="author" itemprop="author">'Wole Oduwole</a></p>
    </div>
  </header>

  <figure class="post__cover">
    <div class="container container--wide">
      <picture>
        <source type="image/avif" srcset="/public/images/covers/${p.slug}-960.avif 960w, /public/images/covers/${p.slug}-1600.avif 1600w" sizes="(min-width: 1280px) 1280px, 100vw">
        <source type="image/webp" srcset="/public/images/covers/${p.slug}-960.webp 960w, /public/images/covers/${p.slug}-1600.webp 1600w" sizes="(min-width: 1280px) 1280px, 100vw">
        <img src="/public/images/covers/${p.slug}.jpg" width="1600" height="900" alt="" decoding="async" itemprop="image">
      </picture>
    </div>
  </figure>

  <div class="container container--narrow">
    <div class="prose post__body" itemprop="articleBody">
${note}${body}
    </div>

    <footer class="post__footer">
      <aside class="author" aria-label="About the author">
        <a href="/about/" class="author__photo" rel="author" tabindex="-1" aria-hidden="true">
          <picture>
            <source type="image/avif" srcset="/public/images/wole-oduwole-seogidi-640.avif">
            <source type="image/webp" srcset="/public/images/wole-oduwole-seogidi-640.webp">
            <img src="/public/images/wole-oduwole-seogidi-640.jpg" width="96" height="128" alt="" loading="lazy" decoding="async">
          </picture>
        </a>
        <div class="author__body">
          <p class="eyebrow">Written by</p>
          <p class="author__name"><a href="/about/" rel="author">'Wole Oduwole</a></p>
          <p class="author__bio">SEO consultant and growth marketing executive. Twelve years across search, growth and product marketing for tech companies in Africa and the UK. Founder and CMO of SEOGidi. Innovator Founder, with SERPGidi endorsed by Innovator International. MRes, University of Wolverhampton, 2026.</p>
          <ul class="author__links">
            <li><a href="https://www.linkedin.com/in/woldezzy/" rel="me noopener" target="_blank">LinkedIn</a></li>
            <li><a href="https://x.com/woldezzy" rel="me noopener" target="_blank">X</a></li>
            <li><a href="https://orcid.org/0009-0001-9302-3329" rel="me noopener" target="_blank">ORCID</a></li>
            <li><a href="/contact/">Contact</a></li>
          </ul>
        </div>
      </aside>

      <div class="share" data-share data-title="${esc(p.title)}" data-url="https://woldezzy.xyz/journal/${p.slug}/">
        <p class="eyebrow">Share</p>
        <ul class="share__list">
          <li><button type="button" class="share__btn" data-share-native hidden>Share…</button></li>
          <li><a class="share__btn" data-share-network="linkedin" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`https://woldezzy.xyz/journal/${p.slug}/`)}" rel="noopener" target="_blank">LinkedIn</a></li>
          <li><a class="share__btn" data-share-network="x" href="https://x.com/intent/post?text=${encodeURIComponent(p.title)}&url=${encodeURIComponent(`https://woldezzy.xyz/journal/${p.slug}/`)}&via=woldezzy" rel="noopener" target="_blank">X</a></li>
          <li><a class="share__btn" data-share-network="whatsapp" href="https://wa.me/?text=${encodeURIComponent(p.title + ' https://woldezzy.xyz/journal/' + p.slug + '/')}" rel="noopener" target="_blank">WhatsApp</a></li>
          <li><a class="share__btn" data-share-network="email" href="mailto:?subject=${encodeURIComponent(p.title)}&body=${encodeURIComponent('https://woldezzy.xyz/journal/' + p.slug + '/')}">Email</a></li>
          <li><button type="button" class="share__btn" data-share-copy>Copy link</button></li>
        </ul>
        <p class="share__status" role="status" aria-live="polite"></p>
      </div>
    </footer>
  </div>

  <section class="related" aria-labelledby="related-title">
    <div class="container container--wide">
      <div class="chapter">
        <span class="chapter__num">§</span>
        <span class="chapter__title">Keep reading</span>
        <a href="/journal/" class="chapter__action">All essays →</a>
      </div>
      <h2 class="statement" id="related-title" style="font-size: var(--t-2xl)">Related <em>essays</em>.</h2>
      <div class="journal-grid">
${related(pre.find((q) => q.slug === p.slug)).map(relCard).join('\n')}
      </div>
    </div>
  </section>
</article>
`;
  writeFileSync(join(ROOT, 'pages', 'journal', `${p.slug}.html`), fragment);
  out.push({ slug: p.slug, title: p.title, date: p.date, cat, tier, words: n, mins: readMins(n), desc: d, series, seriesNo, imgRefs, tags: p.tags });
}

/* ── journal index ─────────────────────────────────────────── */
const card = (p) => `      <a href="/journal/${p.slug}/" class="post-card reveal">
        <span class="post-card__date"><time datetime="${p.date}">${fmtDate(p.date)}</time> · ${p.cat}</span>
        <div class="post-card__thumb">
          <picture>
            <source type="image/avif" srcset="/public/images/covers/${p.slug}-960.avif">
            <source type="image/webp" srcset="/public/images/covers/${p.slug}-960.webp">
            <img src="/public/images/covers/${p.slug}.jpg" width="1600" height="900" alt="" loading="lazy" decoding="async">
          </picture>
        </div>
        <h2 class="post-card__title">${p.title}</h2>
        <p class="post-card__excerpt">${p.desc}</p>
        <span class="post-card__meta">${p.mins} min read</span>
      </a>`;

const featured = out.filter((p) => p.tier === 'featured');
const archive = out.filter((p) => p.tier === 'archive');

const index = `<!--meta
{
  "title": "Journal · 'Wole Oduwole on SEO, growth and African tech",
  "desc": "${featured.length} essays by 'Wole Oduwole on SEO strategy, growth marketing, product marketing and building tech companies in Africa and the UK. 2016 to ${out[0].date.slice(0, 4)}.",
  "path": "/journal/",
  "ogType": "website",
  "priority": "0.8",
  "schema": {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": "https://woldezzy.xyz/journal/#blog",
    "name": "Journal",
    "url": "https://woldezzy.xyz/journal/",
    "author": { "@id": "https://woldezzy.xyz/#person" },
    "publisher": { "@id": "https://woldezzy.xyz/#person" },
    "inLanguage": "en-GB",
    "hasPart": ${JSON.stringify(featured.map((p) => ({ '@type': 'BlogPosting', '@id': `https://woldezzy.xyz/journal/${p.slug}/#article`, headline: p.title, url: `https://woldezzy.xyz/journal/${p.slug}/`, datePublished: p.date, image: `https://woldezzy.xyz/public/images/covers/${p.slug}.jpg`, author: { '@id': 'https://woldezzy.xyz/#person' } })))}
  }
}
-->
<section class="page-hero" aria-labelledby="journal-title">
  <div class="container container--wide">
    <p class="eyebrow page-hero__eyebrow"><span class="eyebrow__index">Journal</span> ${featured.length} essays · 2016 to ${out[0].date.slice(0, 4)}</p>
    <h1 class="page-hero__title" id="journal-title">Notes from the <em>work</em>.</h1>
    <p class="page-hero__lede">Essays on SEO, growth, product marketing and building tech companies across Africa and the UK. Written when something is worth putting down.</p>
  </div>
</section>

<section class="section" aria-label="Essays">
  <div class="container container--wide">
    <div class="journal-grid journal-grid--index reveal-group">
${featured.map(card).join('\n')}
    </div>
  </div>
</section>

<section class="section section--sm" aria-labelledby="archive-title">
  <div class="container container--wide">
    <div class="chapter">
      <span class="chapter__num">§</span>
      <span class="chapter__title">Archive</span>
    </div>
    <h2 class="statement" id="archive-title" style="font-size: var(--t-2xl)">Earlier, shorter <em>notes</em>.</h2>
    <p style="color: var(--fg-mute); max-width: 56ch; margin-bottom: var(--s-7)">Short pieces from 2016 to 2019, kept for the record. Not indexed; the thinking has moved on.</p>
    <div class="work-index">
${archive.map((p) => `      <a href="/journal/${p.slug}/" class="work-item">
        <span class="work-item__num">${p.date.slice(0, 4)}</span>
        <div>
          <h3 class="work-item__title" style="font-size: var(--t-lg)">${p.title}</h3>
          <p class="work-item__desc">${p.cat} · ${p.mins} min</p>
        </div>
        <span class="work-item__arrow" aria-hidden="true">→</span>
      </a>`).join('\n')}
    </div>
  </div>
</section>
`;
writeFileSync(join(ROOT, 'pages', 'journal.html'), index);
writeFileSync(join(ROOT, 'scripts', 'posts.json'), JSON.stringify(out, null, 2));

console.log(`${out.length} posts → pages/journal/  (${featured.length} featured, ${archive.length} archive)`);
console.log(`${out.reduce((a, p) => a + p.imgRefs.length, 0)} inline image refs`);
