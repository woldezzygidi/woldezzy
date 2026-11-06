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
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&#8217;/g, '’').replace(/&#8216;/g, '‘').replace(/&#8220;/g, '“').replace(/&#8221;/g, '”').replace(/&#8211;/g, '–').replace(/&#8230;/g, '…');

const posts = items
  .filter((s) => tag(s, 'wp:post_type') === 'post' && tag(s, 'wp:status') === 'publish')
  .map((s) => {
    const cats = [...s.matchAll(/<category domain="category"[^>]*>(?:<!\[CDATA\[)?([^\]<]+)/g)].map((m) => m[1].trim());
    const tags = [...s.matchAll(/<category domain="post_tag"[^>]*>(?:<!\[CDATA\[)?([^\]<]+)/g)].map((m) => m[1].trim());
    const metaDesc = (s.match(/<wp:meta_key>(?:<!\[CDATA\[)?_yoast_wpseo_metadesc(?:\]\]>)?<\/wp:meta_key>\s*<wp:meta_value>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/wp:meta_value>/) || [])[1] || '';
    return {
      slug: tag(s, 'wp:post_name'),
      title: unesc(tag(s, 'title')).trim(),
      date: tag(s, 'wp:post_date').slice(0, 10),
      modified: tag(s, 'wp:post_modified').slice(0, 10),
      excerpt: unesc(tag(s, 'excerpt:encoded')).replace(/<[^>]+>/g, '').trim(),
      metaDesc: unesc(metaDesc).trim(),
      categories: cats,
      tags,
      raw: tag(s, 'content:encoded'),
    };
  })
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
    const hasRel = /\srel=/.test(rest);
    return `<a href="${url}"${rest}${hasRel ? '' : ' rel="noopener"'} target="_blank">`;
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
  const t = cand.replace(/\s+/g, ' ').trim();
  return t.length > 160 ? t.slice(0, 157).replace(/\s\S*$/, '') + '…' : t;
}

mkdirSync(join(ROOT, 'pages', 'journal'), { recursive: true });
const out = [];
for (const p of posts) {
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
    title: `${p.title} · 'Wole Oduwole`,
    desc: d,
    path: `/journal/${p.slug}/`,
    ogType: 'article',
    ogImage: `https://woldezzy.xyz/public/images/covers/${p.slug}.jpg`,
    priority: tier === 'featured' ? '0.7' : '0.3',
    noindex: tier === 'archive',
    schema: {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: p.title,
      description: d,
      datePublished: p.date,
      dateModified: p.modified || p.date,
      author: { '@id': 'https://woldezzy.xyz/#person' },
      publisher: { '@id': 'https://woldezzy.xyz/#person' },
      image: `https://woldezzy.xyz/public/images/covers/${p.slug}.jpg`,
      url: `https://woldezzy.xyz/journal/${p.slug}/`,
      mainEntityOfPage: `https://woldezzy.xyz/journal/${p.slug}/`,
      articleSection: cat,
      keywords: p.tags.join(', '),
      wordCount: n,
      inLanguage: 'en-GB',
      isPartOf: { '@id': 'https://woldezzy.xyz/journal/#blog' },
    },
  };

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
          <li><span aria-current="page">${cat}</span></li>
        </ol>
      </nav>
      <p class="eyebrow page-hero__eyebrow"><span class="eyebrow__index">${cat}</span> <time datetime="${p.date}">${fmtDate(p.date)}</time> · ${readMins(n)} min read${tier === 'archive' ? ' · Archive' : ''}</p>
      <h1 class="page-hero__title post__title" itemprop="headline">${p.title}</h1>
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
${body}
    </div>

    <footer class="post__footer">
      <p class="eyebrow">Written by</p>
      <p class="post__byline">'Wole Oduwole, marketing executive and techpreneur. <a href="/about/" class="ulink">About</a> · <a href="/contact/" class="ulink">Contact</a></p>
    </footer>
  </div>
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
  "title": "Journal · Writing by 'Wole Oduwole on SEO, growth and African tech",
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
    "blogPost": ${JSON.stringify(featured.map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: `https://woldezzy.xyz/journal/${p.slug}/`, datePublished: p.date })))}
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
