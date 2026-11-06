#!/usr/bin/env node
/**
 * scripts/tiles.mjs — generate typographic tiles for external projects
 * (no source imagery) and Open Graph images for every indexable page.
 *
 * Renders SVG → sharp → avif/webp/jpg at the widths templates reference.
 * Fonts are embedded as base64 so the SVG rasteriser doesn't depend on
 * system fonts.
 */
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'images');
mkdirSync(OUT, { recursive: true });

const BG = '#0A0908', FG = '#F5F0E6', MUTE = '#A8A294', ACCENT = '#E8623F';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, '&#39;');

/* Project tiles — 4:3 at 960w. Serif title, mono meta, accent rule. */
function tileSVG({ title, meta, w = 960, h = 720 }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${BG}"/>
  <rect x="64" y="64" width="${w - 128}" height="1" fill="${FG}" fill-opacity="0.12"/>
  <text x="64" y="112" font-family="JetBrains Mono, Menlo, monospace" font-size="18" letter-spacing="2.5" fill="${MUTE}">${esc(meta.toUpperCase())}</text>
  <text x="64" y="${h / 2 + 36}" font-family="Georgia, 'Times New Roman', serif" font-weight="300" font-size="88" letter-spacing="-2.5" fill="${FG}">${esc(title)}</text>
  <rect x="64" y="${h - 120}" width="96" height="3" fill="${ACCENT}"/>
  <text x="64" y="${h - 72}" font-family="JetBrains Mono, Menlo, monospace" font-size="16" letter-spacing="2" fill="${MUTE}">WOLDEZZY.XYZ</text>
</svg>`;
}

/* OG image — 1200×630. */
function ogSVG({ title, subtitle }) {
  const w = 1200, h = 630;
  const lines = wrap(title, 26);
  const titleY = h / 2 - (lines.length - 1) * 42 + 20;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${BG}"/>
  <text x="80" y="110" font-family="JetBrains Mono, Menlo, monospace" font-size="20" letter-spacing="3" fill="${MUTE}">'WOLE ODUWOLE</text>
  <circle cx="${w - 90}" cy="100" r="7" fill="${ACCENT}"/>
  ${lines.map((l, i) => `<text x="80" y="${titleY + i * 84}" font-family="Georgia, 'Times New Roman', serif" font-weight="300" font-size="72" letter-spacing="-2" fill="${FG}">${esc(l)}</text>`).join('\n  ')}
  <text x="80" y="${h - 80}" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="${MUTE}">${esc(subtitle)}</text>
  <rect x="80" y="${h - 50}" width="120" height="3" fill="${ACCENT}"/>
</svg>`;
}

function wrap(text, max) {
  const words = text.split(' '), out = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > max) { out.push(line.trim()); line = w; }
    else line = (line + ' ' + w).trim();
  }
  if (line) out.push(line);
  return out;
}

async function rasterise(svg, slug, widths, formats) {
  const buf = Buffer.from(svg);
  for (const w of widths) {
    for (const fmt of formats) {
      const out = join(OUT, `${slug}-${w}.${fmt}`);
      if (existsSync(out)) continue;
      let p = sharp(buf, { density: 144 }).resize({ width: w });
      if (fmt === 'avif') p = p.avif({ quality: 60 });
      else if (fmt === 'webp') p = p.webp({ quality: 82 });
      else p = p.jpeg({ quality: 86, mozjpeg: true });
      await p.toFile(out);
    }
  }
}

const tiles = [
  { slug: 'wallsmiths', title: 'Wallsmiths & Co', meta: 'SEO & content · Construction · UK' },
  { slug: 'catlives',   title: 'Catlives',        meta: 'Product marketing · Platform · UK' },
  { slug: 'seogidi',    title: 'SEOGidi',         meta: 'Founder & CMO · AI-native SEO · 2022' },
];
for (const t of tiles) {
  await rasterise(tileSVG(t), t.slug, [960], ['avif', 'webp', 'jpg']);
  console.log(`✓ tile ${t.slug}`);
}

const ogs = [
  { slug: 'og-home',           title: "SEO Consultant, Growth Marketer and TechPreneur", subtitle: 'woldezzy.xyz' },
  { slug: 'og-research',       title: 'The Role of Technology in the UK FMCG Supply Chain', subtitle: 'Independent research · July 2025 · Adewole Oduwole' },
  { slug: 'og-west-midlands',  title: 'SEO Specialist in the West Midlands, England', subtitle: 'Birmingham · Wolverhampton · Coventry · Dudley · Walsall · Solihull' },
  { slug: 'og-driving-school', title: 'Olu K Driving School: #1 in two cities', subtitle: 'Local SEO case study' },
];
for (const o of ogs) {
  const out = join(OUT, `${o.slug}.jpg`);
  if (!existsSync(out)) await sharp(Buffer.from(ogSVG(o)), { density: 144 }).resize({ width: 1200, height: 630 }).jpeg({ quality: 86, mozjpeg: true }).toFile(out);
  console.log(`✓ og ${o.slug}`);
}
