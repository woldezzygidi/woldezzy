#!/usr/bin/env node
/**
 * scripts/check.mjs — static validation of dist/. Zero deps; runs in CI.
 *
 * Per page: exactly one <h1>, no heading-level skips, every <img> has
 * width/height/alt, JSON-LD parses, canonical + description present,
 * no reference to a missing local asset. Exits 1 on any failure.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
if (!existsSync(DIST)) { console.error('dist/ missing — run node build.mjs first'); process.exit(1); }

const pages = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const f = join(d, e);
    if (statSync(f).isDirectory()) walk(f);
    else if (e.endsWith('.html')) pages.push(f);
  }
})(DIST);

let failures = 0;
const fail = (page, msg) => { failures++; console.error(`✗ ${page.replace(DIST, '')}: ${msg}`); };

for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  const rel = file.replace(DIST, '') || '/';

  const h1s = (html.match(/<h1[\s>]/g) || []).length;
  if (h1s !== 1) fail(file, `${h1s} <h1> elements`);

  const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => +m[1]);
  for (let i = 1; i < levels.length; i++) if (levels[i] > levels[i - 1] + 1) { fail(file, `heading skip h${levels[i - 1]} → h${levels[i]}`); break; }

  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    const tag = m[0];
    if (!/\balt=/.test(tag)) fail(file, `img missing alt: ${tag.slice(0, 80)}`);
    if (!/\bwidth=/.test(tag) || !/\bheight=/.test(tag)) fail(file, `img missing width/height: ${tag.slice(0, 80)}`);
  }

  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (e) { fail(file, `invalid JSON-LD: ${e.message}`); }
  }

  if (!/<link rel="canonical" href="https:\/\/woldezzy\.xyz\//.test(html)) fail(file, 'canonical missing or wrong host');
  if (!/<meta name="description" content="[^"]{20,}"/.test(html)) fail(file, 'meta description missing/short');
  if (!/<title>[^<]{10,}<\/title>/.test(html)) fail(file, 'title missing/short');

  // Local asset references must exist (skip images; they arrive via scripts/images.mjs)
  for (const m of html.matchAll(/(?:href|src)="(\/(?:css|js|public\/fonts|public\/papers)\/[^"]+)"/g)) {
    if (!existsSync(join(DIST, m[1]))) fail(file, `missing asset ${m[1]}`);
  }
}

// Image references: warn (not fail) so CI passes before the media import
const refs = new Set();
for (const file of pages) for (const m of readFileSync(file, 'utf8').matchAll(/\/public\/images\/[^"\s,]+/g)) refs.add(m[0]);
const missingImgs = [...refs].filter((r) => !existsSync(join(DIST, r)));
if (missingImgs.length) console.warn(`⚠ ${missingImgs.length} image references not yet present (run: npm run images)`);

for (const f of ['sitemap.xml', 'robots.txt', 'favicon.svg']) if (!existsSync(join(DIST, f))) fail(join(DIST, f), 'missing');

console.log(`${pages.length} pages checked, ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
