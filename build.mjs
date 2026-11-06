#!/usr/bin/env node
/**
 * build.mjs — zero-dependency static build.
 *
 * 1. Concatenates CSS into dist/css/main.css (single request, no @import chain).
 * 2. Wraps each pages/*.html body fragment with the site shell (head + header + footer).
 * 3. Sets aria-current="page" on the matching nav link.
 * 4. Copies public/ and js/ into dist/.
 * 5. Emits sitemap.xml and robots.txt.
 *
 * Usage: node build.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, cpSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, 'dist');
const SITE = 'https://woldezzy.xyz';

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const write = (p, s) => {
  const full = join(DIST, p);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, s);
};

/* ──────── 1. CSS ──────── */
const cssOrder = ['tokens', 'fonts', 'base', 'components', 'home', 'content', 'regional', 'journal'];
const css = cssOrder.map((n) => `/* ${n}.css */\n` + read(`css/${n}.css`)).join('\n\n');
write('css/main.css', css);

/* ──────── 2. Shell ──────── */
const shell = read('_partials/shell.html');

/* ──────── 3. Pages ──────── */
const NAV = [
  ['/about/', 'About'],
  ['/work/', 'Work'],
  ['/services/', 'Services'],
  ['/research/', 'Research'],
  ['/journal/', 'Journal'],
  ['/contact/', 'Contact'],
];

function renderNav(current) {
  return NAV.map(([href, label]) => {
    const cur = current === href ? ' aria-current="page"' : '';
    return `<li><a class="nav__link" href="${href}"${cur}>${label}</a></li>`;
  }).join('\n        ');
}

/**
 * Page fragment format: a leading HTML comment block with JSON front-matter,
 * then the <main> contents.
 *   <!--meta
 *   { "title": "...", "desc": "...", "path": "/about/", "ogType": "profile", "ogImage": "...", "schema": {...} }
 *   -->
 */
function parseFragment(src) {
  const m = src.match(/^<!--meta\s*([\s\S]*?)-->\s*([\s\S]*)$/);
  if (!m) throw new Error('Fragment missing <!--meta --> block');
  return { meta: JSON.parse(m[1]), body: m[2] };
}

const pages = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith('.html')) pages.push(full);
  }
}
walk(join(ROOT, 'pages'));

const urls = [];
for (const file of pages) {
  const { meta, body } = parseFragment(readFileSync(file, 'utf8'));
  const canonical = SITE + meta.path;
  const ogImage = meta.ogImage || `${SITE}/public/images/og-home.jpg`;
  const schema = meta.schema ? JSON.stringify(meta.schema, null, 0) : '';

  const html = shell
    .replaceAll('{{TITLE}}', meta.title)
    .replaceAll('{{DESC}}', meta.desc)
    .replaceAll('{{CANONICAL}}', canonical)
    .replaceAll('{{OG_TYPE}}', meta.ogType || 'website')
    .replaceAll('{{OG_IMAGE}}', ogImage)
    .replaceAll('{{SCHEMA}}', schema ? `<script type="application/ld+json">${schema}</script>` : '')
    .replaceAll('{{NAV}}', renderNav(meta.path))
    .replaceAll('{{ROBOTS}}', meta.noindex ? '<meta name="robots" content="noindex, nofollow">' : '')
    .replaceAll('{{EXTRA_HEAD}}', meta.extraHead || '')
    .replaceAll('{{BODY}}', body);

  const out = meta.path.endsWith('/') ? meta.path + 'index.html' : meta.path;
  write(out, html);
  if (!meta.noindex) urls.push({ loc: canonical, priority: meta.priority ?? '0.7' });
}

/* Homepage is hand-authored (bespoke hero preload) — copy as-is. */
write('index.html', read('index.html'));
urls.unshift({ loc: SITE + '/', priority: '1.0' });

/* ──────── 4. Static assets ──────── */
cpSync(join(ROOT, 'public'), join(DIST, 'public'), { recursive: true });
cpSync(join(ROOT, 'js'), join(DIST, 'js'), { recursive: true });
for (const f of ['favicon.svg', 'apple-touch-icon.png']) {
  if (existsSync(join(ROOT, f))) cpSync(join(ROOT, f), join(DIST, f));
}

/* ──────── 5. Sitemap + robots ──────── */
const today = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><priority>${u.priority}</priority></url>`).join('\n')}
</urlset>
`;
write('sitemap.xml', sitemap);
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`Built ${pages.length + 1} pages → ${relative(ROOT, DIST)}/`);
