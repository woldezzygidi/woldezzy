// Brand mark: circular avatar (transparent) and dark disc with terracotta ring, plus favicon set.
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
const SRC = process.argv[2];
const OUT = 'public/brand';
mkdirSync(OUT, { recursive: true });
const svg = (s) => sharp(Buffer.from(s)).png().toBuffer();

const up = await sharp(SRC).resize(1000, 1000, { kernel: 'lanczos3' }).sharpen({ sigma: 0.6 }).png().toBuffer();
const cx = 445, cy = 405, r = 400;
const mask = await svg(`<svg xmlns="http://www.w3.org/2000/svg" width="${2 * r}" height="${2 * r}"><circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`);
const crop = await sharp(up).extract({ left: cx - r, top: cy - r, width: 2 * r, height: 2 * r }).png().toBuffer();
const circle = await sharp(crop).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();

const ring = await svg(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><circle cx="400" cy="400" r="396" fill="#0A0908"/><circle cx="400" cy="400" r="386" fill="none" stroke="#E8623F" stroke-width="14"/></svg>`);
const disc = await sharp(ring).composite([{ input: await sharp(circle).resize(740, 740).png().toBuffer(), left: 30, top: 30 }]).png().toBuffer();

for (const w of [48, 96, 192]) {
  await sharp(circle).resize(w, w).png({ palette: true }).toFile(`${OUT}/avatar-${w}.png`);
  await sharp(circle).resize(w, w).webp({ quality: 86 }).toFile(`${OUT}/avatar-${w}.webp`);
}
await sharp(disc).resize(512, 512).png().toFile(`${OUT}/mark-512.png`);

// Favicons from the disc.
await sharp(disc).resize(180, 180).png().toFile('apple-touch-icon.png');
await sharp(disc).resize(192, 192).png().toFile('icon-192.png');
await sharp(disc).resize(512, 512).png().toFile('icon-512.png');
const b64 = (await sharp(disc).resize(128, 128).png({ palette: true }).toBuffer()).toString('base64');
writeFileSync('favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><image width="128" height="128" href="data:image/png;base64,${b64}"/></svg>\n`);

// ICO: 16/32/48 PNG-in-ICO.
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map((s) => sharp(disc).resize(s, s).png().toBuffer()));
const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length; const dirs = [];
pngs.forEach((p, i) => { const d = Buffer.alloc(16); d.writeUInt8(sizes[i], 0); d.writeUInt8(sizes[i], 1); d.writeUInt8(0, 2); d.writeUInt8(0, 3); d.writeUInt16LE(1, 4); d.writeUInt16LE(32, 6); d.writeUInt32LE(p.length, 8); d.writeUInt32LE(offset, 12); offset += p.length; dirs.push(d); });
writeFileSync('favicon.ico', Buffer.concat([header, ...dirs, ...pngs]));
console.log('brand assets written');
