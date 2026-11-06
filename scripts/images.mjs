#!/usr/bin/env node
/**
 * scripts/images.mjs — fetch + process the media library.
 *
 * Reads scripts/images.manifest.json, downloads each source (or reads it from
 * ./source-images/ if already present), then emits every width × format the
 * templates reference, into public/images/.
 *
 * Requires: sharp (npm i -D sharp). Zero other deps.
 * Usage:    node scripts/images.mjs            # fetch + build
 *           node scripts/images.mjs --local    # skip fetch, use ./source-images/
 */
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'source-images');
const OUT = join(ROOT, 'public', 'images');
const manifest = JSON.parse(readFileSync(join(ROOT, 'scripts', 'images.manifest.json'), 'utf8'));
const LOCAL = process.argv.includes('--local');

mkdirSync(SRC, { recursive: true });
mkdirSync(OUT, { recursive: true });

async function fetchSource(entry) {
  const dest = join(SRC, entry.file);
  if (existsSync(dest)) return dest;
  if (LOCAL) throw new Error(`Missing ${entry.file} in source-images/ (run without --local to fetch)`);
  const res = await fetch(entry.src, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`${res.status} ${entry.src}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

async function emit(entry, srcPath) {
  const base = sharp(srcPath).rotate();
  const meta = await base.metadata();
  const tasks = [];
  for (const w of entry.widths) {
    const width = Math.min(w, meta.width);
    const pipe = () => base.clone().resize({ width, withoutEnlargement: true });
    for (const fmt of entry.formats) {
      const out = join(OUT, `${entry.slug}-${w}.${fmt}`);
      if (existsSync(out)) continue;
      let p = pipe();
      if (fmt === 'avif') p = p.avif({ quality: 55, effort: 6 });
      else if (fmt === 'webp') p = p.webp({ quality: 78, effort: 5 });
      else if (fmt === 'jpg') p = p.flatten({ background: '#0A0908' }).jpeg({ quality: 82, mozjpeg: true, progressive: true });
      else if (fmt === 'png') p = p.png({ compressionLevel: 9, palette: entry.palette ?? false });
      tasks.push(p.toFile(out).then(() => out));
    }
  }
  // Single-size passthrough (logos): keep aspect, cap height, emit png + no ladder
  if (entry.single) {
    if (entry.inline) {
      // Inline post images: keep original filename+ext, cap height, re-encode in place.
      const out = join(OUT, entry.slug);
      mkdirSync(dirname(out), { recursive: true });
      if (!existsSync(out)) {
        let p = base.clone().resize({ height: entry.single.height, withoutEnlargement: true });
        p = /\.png$/i.test(out) ? p.png({ compressionLevel: 9, palette: true }) : p.jpeg({ quality: 82, mozjpeg: true, progressive: true });
        tasks.push(p.toFile(out).then(() => out));
      }
    } else {
      const out = join(OUT, `${entry.slug}.png`);
      if (!existsSync(out)) {
        tasks.push(base.clone().resize({ height: entry.single.height, withoutEnlargement: true }).png({ compressionLevel: 9 }).toFile(out).then(() => out));
      }
    }
  }
  return Promise.all(tasks);
}

let ok = 0, fail = 0;
for (const entry of manifest) {
  try {
    const src = await fetchSource(entry);
    const outs = await emit(entry, src);
    ok++;
    console.log(`✓ ${entry.slug} (${outs.length} files)`);
  } catch (e) {
    fail++;
    console.error(`✗ ${entry.slug}: ${e.message}`);
  }
}
console.log(`\n${ok} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
