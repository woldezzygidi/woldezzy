#!/usr/bin/env node
/**
 * scripts/covers.mjs — featured images for every journal post.
 *
 * One visual system, 29 unique motifs. Each motif is a small geometric
 * argument that encodes the post's thesis, not just its topic — so the
 * journal index reads as a body of thought rather than a stock-photo grid.
 *
 * Constants across all covers:
 *   canvas 1600×900 · ink background · paper text · one terracotta accent
 *   category + year top-left (tracked caps) · title bottom-left (Inter Tight 600)
 *   hairline rule · accent dot · motif occupies the right 45%
 *
 * Series (Product Marketing I/II/III) share a chapter-numeral treatment.
 *
 * Output: public/images/covers/<slug>.jpg (1600×900, OG) + -960/-1600 avif/webp.
 * Deterministic. Regenerate anytime: node scripts/covers.mjs
 */
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'images', 'covers');
mkdirSync(OUT, { recursive: true });
const posts = JSON.parse(readFileSync(join(ROOT, 'scripts', 'posts.json'), 'utf8'));

const FONT = readFileSync(join(ROOT, 'public', 'fonts', 'inter-tight.woff2')).toString('base64');

const INK = '#0A0908', PAPER = '#F5F0E6', MUTE = '#A8A294', DIM = '#6E6A5F', ACC = '#E8623F', ACC2 = '#B8482B';
const W = 1600, H = 900;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ── title wrapping: ~22 chars/line at 72px in the left 55% ───────── */
function wrap(text, max = 24) {
  const out = []; let line = '';
  for (const w of text.replace(/[–—]/g, '-').split(' ')) {
    if ((line + ' ' + w).trim().length > max) { out.push(line.trim()); line = w; } else line = (line + ' ' + w).trim();
  }
  if (line) out.push(line);
  return out.slice(0, 4);
}

/* ── MOTIFS ─────────────────────────────────────────────────────────
   Each returns SVG fragments drawn inside a 640×640 box anchored at (880,130).
   Keep strokes ≥ 3px so they survive the 960px downscale.
   ───────────────────────────────────────────────────────────────────── */
const M = {
  // Entities not keywords: a word-list (struck) vs a connected entity graph
  entities: () => {
    const nodes = [[320, 120], [140, 300], [500, 300], [220, 500], [420, 500], [320, 340]];
    const edges = [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 5], [1, 5], [2, 5]];
    return `
    ${edges.map(([a, b]) => `<line x1="${nodes[a][0]}" y1="${nodes[a][1]}" x2="${nodes[b][0]}" y2="${nodes[b][1]}" stroke="${MUTE}" stroke-width="2.5" opacity=".55"/>`).join('')}
    ${nodes.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i === 5 ? 28 : 16}" fill="${i === 5 ? ACC : INK}" stroke="${i === 5 ? ACC : PAPER}" stroke-width="3"/>`).join('')}
    <g opacity=".35" stroke="${PAPER}" stroke-width="3"><line x1="20" y1="80" x2="110" y2="80"/><line x1="20" y1="110" x2="90" y2="110"/><line x1="20" y1="140" x2="120" y2="140"/><line x1="20" y1="170" x2="80" y2="170"/></g>
    <line x1="10" y1="70" x2="130" y2="180" stroke="${ACC}" stroke-width="4"/>`;
  },
  // Dark funnel: funnel whose lower half dissolves into unmeasured noise
  darkfunnel: () => {
    let dots = '';
    let seed = 7;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 180; i++) { const y = 330 + rnd() * 300; const spread = 60 + (y - 330) * 0.55; const x = 320 + (rnd() - 0.5) * spread * 2; dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(2 + rnd() * 3).toFixed(1)}" fill="${ACC}" opacity="${(0.15 + rnd() * 0.6).toFixed(2)}"/>`; }
    return `<path d="M60 60 L580 60 L370 320 L270 320 Z" fill="none" stroke="${PAPER}" stroke-width="4"/>
    <path d="M60 60 L580 60 L370 320 L270 320 Z" fill="${PAPER}" opacity=".08"/>
    <line x1="270" y1="320" x2="270" y2="345" stroke="${PAPER}" stroke-width="4" stroke-dasharray="4 10"/>
    <line x1="370" y1="320" x2="370" y2="345" stroke="${PAPER}" stroke-width="4" stroke-dasharray="4 10"/>
    ${dots}`;
  },
  // Product marketing series: chapter numeral + three-column "product · marketing · sales" bridge
  series: (n) => `
    <text x="320" y="300" text-anchor="middle" font-family="Inter Tight" font-weight="600" font-size="300" fill="${PAPER}" opacity=".22">${['I', 'II', 'III'][n - 1]}</text>
    <rect x="80" y="380" width="140" height="140" fill="none" stroke="${PAPER}" stroke-width="4"/>
    <rect x="250" y="380" width="140" height="140" fill="${ACC}"/>
    <rect x="420" y="380" width="140" height="140" fill="none" stroke="${PAPER}" stroke-width="4"/>
    <line x1="220" y1="450" x2="250" y2="450" stroke="${PAPER}" stroke-width="4"/>
    <line x1="390" y1="450" x2="420" y2="450" stroke="${PAPER}" stroke-width="4"/>
    <text x="320" y="600" text-anchor="middle" font-family="Inter Tight" font-weight="500" font-size="22" letter-spacing="4" fill="${MUTE}">PRODUCT · MARKETING · SALES</text>`,
  // AI governance: a shield made of a grid, one cell marked
  governance: () => {
    let g = '';
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) { const x = 100 + c * 76, y = 100 + r * 76; const inside = Math.hypot(x - 290, y - 290) < 230 && y < 500; if (!inside) continue; g += `<rect x="${x}" y="${y}" width="60" height="60" fill="${r === 2 && c === 3 ? ACC : 'none'}" stroke="${PAPER}" stroke-width="2.5" opacity="${r === 2 && c === 3 ? 1 : 0.5}"/>`; }
    return `<path d="M290 40 L540 120 L540 300 Q540 480 290 580 Q40 480 40 300 L40 120 Z" fill="none" stroke="${PAPER}" stroke-width="5"/>${g}`;
  },
  // SEO tools cost: stacked coin-discs with one leaking out
  tools: () => `
    ${[0, 1, 2, 3, 4].map((i) => `<ellipse cx="300" cy="${480 - i * 44}" rx="180" ry="44" fill="${INK}" stroke="${PAPER}" stroke-width="4"/>`).join('')}
    <ellipse cx="300" cy="480" rx="180" ry="44" fill="none" stroke="${PAPER}" stroke-width="4"/>
    <ellipse cx="300" cy="260" rx="180" ry="44" fill="${ACC}"/>
    <path d="M480 300 q60 40 20 120 q-40 60 20 110" fill="none" stroke="${ACC}" stroke-width="5" stroke-dasharray="10 12"/>
    <circle cx="520" cy="560" r="14" fill="${ACC}"/>`,
  // Social community: concentric rings of dots, one cluster connected
  community: () => {
    let s = '';
    for (let ring = 1; ring <= 4; ring++) { const n = ring * 8; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const r = ring * 65; const x = 320 + Math.cos(a) * r, y = 320 + Math.sin(a) * r; const hot = ring === 2 && i < 4; s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${hot ? 12 : 7}" fill="${hot ? ACC : PAPER}" opacity="${hot ? 1 : 0.4 + ring * 0.12}"/>`; } }
    s += `<path d="M450 320 L412 412 L320 450 L228 412" fill="none" stroke="${ACC}" stroke-width="4"/>`;
    return `<circle cx="320" cy="320" r="26" fill="${PAPER}"/>${s}`;
  },
  // Scale with SEO: compounding staircase, each step the sum of the last two
  scale: () => {
    const steps = [1, 1, 2, 3, 5, 8]; let s = '', x = 60; const unit = 48;
    steps.forEach((h, i) => { s += `<rect x="${x}" y="${580 - h * unit}" width="78" height="${h * unit}" fill="${i === 5 ? ACC : 'none'}" stroke="${PAPER}" stroke-width="4"/>`; x += 92; });
    return s + `<path d="M100 540 Q320 480 560 200" fill="none" stroke="${ACC}" stroke-width="4" stroke-dasharray="2 14"/>`;
  },
  // Basics / beginners: a single large letter S built from a search bar + magnifier
  basics: () => `
    <rect x="60" y="80" width="520" height="88" rx="44" fill="none" stroke="${PAPER}" stroke-width="5"/>
    <circle cx="520" cy="124" r="22" fill="none" stroke="${ACC}" stroke-width="6"/><line x1="536" y1="140" x2="560" y2="164" stroke="${ACC}" stroke-width="7" stroke-linecap="round"/>
    <g stroke="${PAPER}" stroke-width="5" opacity=".9"><line x1="60" y1="260" x2="580" y2="260"/><line x1="60" y1="340" x2="460" y2="340"/><line x1="60" y1="420" x2="520" y2="420"/><line x1="60" y1="500" x2="380" y2="500"/></g>
    <circle cx="60" cy="260" r="12" fill="${ACC}"/><circle cx="60" cy="340" r="12" fill="${ACC}"/><circle cx="60" cy="420" r="12" fill="${ACC}"/><circle cx="60" cy="500" r="12" fill="${ACC}"/>`,
  // Organic presence for free: a seed line growing into branches, no coin
  organic: () => `
    <line x1="320" y1="600" x2="320" y2="300" stroke="${PAPER}" stroke-width="6"/>
    <path d="M320 460 Q220 420 180 330" fill="none" stroke="${PAPER}" stroke-width="5"/>
    <path d="M320 400 Q420 360 470 260" fill="none" stroke="${PAPER}" stroke-width="5"/>
    <path d="M320 300 Q290 200 320 110" fill="none" stroke="${PAPER}" stroke-width="5"/>
    <circle cx="180" cy="330" r="16" fill="${ACC}"/><circle cx="470" cy="260" r="16" fill="${ACC}"/><circle cx="320" cy="110" r="16" fill="${ACC}"/>
    <ellipse cx="320" cy="600" rx="200" ry="18" fill="none" stroke="${MUTE}" stroke-width="3"/>`,
  // SERP features stealing clicks: a results list with the top block eating the rest
  serp: () => `
    <rect x="60" y="80" width="520" height="190" fill="${ACC}" opacity=".9"/>
    <g stroke="${PAPER}" stroke-width="4" opacity=".35"><line x1="60" y1="330" x2="560" y2="330"/><line x1="60" y1="400" x2="500" y2="400"/><line x1="60" y1="470" x2="540" y2="470"/><line x1="60" y1="540" x2="420" y2="540"/></g>
    <path d="M580 270 L580 560 L560 560" fill="none" stroke="${ACC}" stroke-width="4" stroke-dasharray="6 10"/>
    <circle cx="540" cy="175" r="26" fill="${INK}"/><path d="M528 175 L538 185 L556 165" fill="none" stroke="${PAPER}" stroke-width="4"/>`,
  // Google Analytics conversion: a line chart funnelling into a single square
  analytics: () => `
    <polyline points="60,480 160,420 260,440 360,320 460,340 560,180" fill="none" stroke="${PAPER}" stroke-width="5" stroke-linejoin="round"/>
    ${[60, 160, 260, 360, 460].map((x, i) => `<circle cx="${x}" cy="${[480, 420, 440, 320, 340][i]}" r="9" fill="${INK}" stroke="${PAPER}" stroke-width="4"/>`).join('')}
    <rect x="520" y="140" width="80" height="80" fill="${ACC}"/>
    <line x1="60" y1="560" x2="600" y2="560" stroke="${MUTE}" stroke-width="3"/>`,
  // Grow on social: a single post icon multiplying outward
  social: () => `
    ${[[320, 320, 1], [160, 180, .55], [480, 180, .55], [160, 460, .55], [480, 460, .55], [80, 320, .3], [560, 320, .3], [320, 80, .3], [320, 560, .3]].map(([x, y, o]) => `<rect x="${x - 44}" y="${y - 44}" width="88" height="88" rx="18" fill="${o === 1 ? ACC : 'none'}" stroke="${PAPER}" stroke-width="4" opacity="${o}"/>`).join('')}
    <circle cx="320" cy="320" r="14" fill="${INK}"/>`,
  // Content ideas: a lightbulb drawn as a speech bubble
  ideas: () => `
    <path d="M320 80 a160 160 0 0 1 160 160 c0 70 -50 110 -70 150 l0 50 l-180 0 l0 -50 c-20 -40 -70 -80 -70 -150 a160 160 0 0 1 160 -160 z" fill="none" stroke="${PAPER}" stroke-width="5"/>
    <rect x="250" y="470" width="140" height="22" rx="8" fill="${PAPER}"/><rect x="265" y="505" width="110" height="22" rx="8" fill="${PAPER}" opacity=".6"/>
    <g stroke="${ACC}" stroke-width="5" stroke-linecap="round"><line x1="320" y1="20" x2="320" y2="50"/><line x1="160" y1="80" x2="182" y2="102"/><line x1="480" y1="80" x2="458" y2="102"/></g>
    <text x="320" y="270" text-anchor="middle" font-family="Inter Tight" font-weight="600" font-size="120" fill="${ACC}">?</text>`,
  // Bounce rate: ball entering a box, arrow out
  bounce: () => `
    <rect x="120" y="200" width="400" height="300" fill="none" stroke="${PAPER}" stroke-width="5"/>
    <path d="M40 320 Q200 120 330 330" fill="none" stroke="${PAPER}" stroke-width="4" stroke-dasharray="8 10"/>
    <circle cx="330" cy="330" r="22" fill="${ACC}"/>
    <path d="M350 330 Q460 160 600 120" fill="none" stroke="${ACC}" stroke-width="5"/>
    <path d="M585 100 L600 120 L578 128" fill="none" stroke="${ACC}" stroke-width="5"/>`,
  // Outbound links: a chain, one link broken, one new tab opening
  links: () => `
    <rect x="60" y="260" width="130" height="80" rx="40" fill="none" stroke="${PAPER}" stroke-width="5"/>
    <rect x="170" y="260" width="130" height="80" rx="40" fill="none" stroke="${PAPER}" stroke-width="5"/>
    <rect x="280" y="260" width="130" height="80" rx="40" fill="none" stroke="${PAPER}" stroke-width="5"/>
    <rect x="420" y="140" width="160" height="110" rx="6" fill="none" stroke="${ACC}" stroke-width="5"/>
    <line x1="420" y1="170" x2="580" y2="170" stroke="${ACC}" stroke-width="5"/>
    <path d="M410 300 L500 250" fill="none" stroke="${ACC}" stroke-width="5"/><path d="M482 246 L500 250 L494 268" fill="none" stroke="${ACC}" stroke-width="5"/>`,
  // Algorithm update / video: a play triangle made of ranking bars
  video: () => `
    ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="120" y="${160 + i * 60}" width="${140 + i * 60}" height="36" fill="${i === 2 ? ACC : 'none'}" stroke="${PAPER}" stroke-width="4"/>`).join('')}
    <path d="M460 200 L580 320 L460 440 Z" fill="${PAPER}"/>`,
  // HTTPS: a padlock whose shackle is an S
  https: () => `
    <rect x="160" y="340" width="320" height="220" rx="16" fill="none" stroke="${PAPER}" stroke-width="6"/>
    <path d="M390 150 a70 70 0 0 0 -140 0 a70 70 0 0 0 70 70 a70 70 0 0 1 70 70 a70 70 0 0 1 -140 0 L250 340" fill="none" stroke="${ACC}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="390" y1="150" x2="390" y2="340" stroke="${ACC}" stroke-width="11" stroke-linecap="round" opacity=".35"/>
    <circle cx="320" cy="430" r="24" fill="${ACC}"/><rect x="311" y="430" width="18" height="60" rx="8" fill="${ACC}"/>`,
  // AMP: a lightning bolt over a phone outline
  amp: () => `
    <rect x="200" y="60" width="240" height="520" rx="36" fill="none" stroke="${PAPER}" stroke-width="5"/>
    <path d="M350 160 L260 350 L330 350 L290 500 L400 290 L330 290 Z" fill="${ACC}"/>`,
  // Mobile network / data: signal bars with one bar as a price tag
  network: () => `
    ${[0, 1, 2, 3, 4].map((i) => `<rect x="${110 + i * 90}" y="${520 - (i + 1) * 80}" width="60" height="${(i + 1) * 80}" fill="${i === 4 ? ACC : 'none'}" stroke="${PAPER}" stroke-width="4"/>`).join('')}
    <text x="500" y="100" text-anchor="middle" font-family="Inter Tight" font-weight="600" font-size="48" fill="${ACC}">₦</text>`,
  // WhatsApp video call: two overlapping speech bubbles with a camera dot
  videocall: () => `
    <rect x="80" y="140" width="300" height="220" rx="40" fill="none" stroke="${PAPER}" stroke-width="5"/>
    <rect x="260" y="280" width="300" height="220" rx="40" fill="${INK}" stroke="${ACC}" stroke-width="5"/>
    <circle cx="410" cy="390" r="34" fill="none" stroke="${PAPER}" stroke-width="5"/><circle cx="410" cy="390" r="12" fill="${ACC}"/>`,
  // Masterclass: a stepped podium, top step accent
  masterclass: () => `
    <rect x="60" y="400" width="160" height="180" fill="none" stroke="${PAPER}" stroke-width="5"/>
    <rect x="240" y="260" width="160" height="320" fill="${ACC}"/>
    <rect x="420" y="330" width="160" height="250" fill="none" stroke="${PAPER}" stroke-width="5"/>
    <text x="320" y="440" text-anchor="middle" font-family="Inter Tight" font-weight="600" font-size="120" fill="${INK}">1</text>`,
  // Starter pack: a toolbox grid, 3×3, three filled
  starter: () => `
    ${[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => `<rect x="${90 + c * 160}" y="${90 + r * 160}" width="140" height="140" rx="10" fill="${(r + c) % 2 === 0 && r !== 1 ? ACC : 'none'}" stroke="${PAPER}" stroke-width="4"/>`)).join('')}`,
  // iPhone: glass rectangle with wireless-charging rings (archive)
  iphone: () => `
    <rect x="210" y="40" width="220" height="460" rx="40" fill="none" stroke="${PAPER}" stroke-width="5"/>
    ${[40, 80, 120].map((r) => `<circle cx="320" cy="600" r="${r}" fill="none" stroke="${ACC}" stroke-width="4" opacity="${1 - r / 160}"/>`).join('')}`,
};

/* slug → motif */
const MOTIF = {
  'entities-not-keywords-ai-recognition': M.entities,
  'the-dark-funnel-why-your-traffic-charts-started-lying-to-you': M.darkfunnel,
  'how-to-start-a-career-in-product-marketing-in-the-uk-part-1': () => M.series(1),
  'starting-a-career-in-ppm-part-2': () => M.series(2),
  'how-to-start-a-career-in-product-marketing-in-the-uk-part-3': () => M.series(3),
  'governance-privacy-and-risk-in-ai-marketing-what-digital-managers-must-know': M.governance,
  'paying-for-seo-tools-smart-investment-or-monthly-money-drain': M.tools,
  'social-media-marketing-building-an-engaged-online-community': M.community,
  'learn-how-to-scale-your-business-with-seo': M.scale,
  'basic-seo-techniques-your-ultimate-guide-to-getting-started': M.basics,
  'how-to-build-organic-presence-for-free-a-comprehensive-guide': M.organic,
  'how-to-grow-on-social-media-strategies-and-real-world-examples': M.social,
  'gain-organic-traffic-at-zero-cost-strategies-and-insights-from-wole-oduwole': M.organic,
  'is-google-going-too-far-with-serp-features-and-stealing-clicks': M.serp,
  'basic-seo-techniques-all-you-need-to-know': M.basics,
  'basic-seo-techniques-a-beginners-guide': M.basics,
  '5-ways-you-can-use-google-analytics-for-conversion': M.analytics,
  'do-you-have-content-ideas-for-the-covid-19-lockdown-if-not-check-this': M.ideas,
  'how-to-reduce-bounce-rate-on-your-website': M.bounce,
  'google-algorithm-update-june-2018-google-gives-more-attention-to-video-content': M.video,
  'should-i-use-outbound-link-open-link-in-new-tab-in-my-post': M.links,
  'seo-masterclass': M.masterclass,
  'starter-pack-simple-seo-techniques-for-blogs-1': M.starter,
  'iphone-8-is-the-newest-magic-with-wireless-charging-and-glass-frame': M.iphone,
  'why-you-should-move-to-https-today': M.https,
  'mtn-to-increase-data-tariff-blames-it-on-ncc-regulations': M.network,
  'how-to-make-video-call-on-whatsapp': M.videocall,
  'whats-life-without-data-airtel-fires-shots-at-glo-others': M.network,
  'introducing-accelerated-mobile-pages-amp-and-effects-on-seo': M.amp,
};

/* The three "basics" posts share a motif; vary accent placement so they're still distinct. */
const VARIANT = {
  'basic-seo-techniques-all-you-need-to-know': 1,
  'basic-seo-techniques-a-beginners-guide': 2,
  'gain-organic-traffic-at-zero-cost-strategies-and-insights-from-wole-oduwole': 1,
  'whats-life-without-data-airtel-fires-shots-at-glo-others': 1,
};

function cover(p) {
  const motif = (MOTIF[p.slug] || M.basics)();
  const v = VARIANT[p.slug] || 0;
  const rot = v === 1 ? 'rotate(90 320 320)' : v === 2 ? 'rotate(180 320 320)' : '';
  const lines = wrap(p.title);
  const fs = lines.length >= 4 ? 56 : lines.length === 3 ? 64 : 72;
  const lh = fs * 1.08;
  const titleTop = H - 110 - (lines.length - 1) * lh;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><style>@font-face{font-family:"Inter Tight";src:url(data:font/woff2;base64,${FONT}) format("woff2");font-weight:100 900}</style></defs>
  <rect width="${W}" height="${H}" fill="${INK}"/>
  <rect x="80" y="80" width="${W - 160}" height="1" fill="${PAPER}" opacity=".14"/>
  <text x="80" y="60" font-family="Inter Tight" font-weight="500" font-size="18" letter-spacing="3.5" fill="${MUTE}">${esc(p.cat.toUpperCase())}  ·  ${p.date.slice(0, 4)}${p.series ? `  ·  PART ${p.seriesNo}` : ''}</text>
  <circle cx="${W - 90}" cy="54" r="7" fill="${ACC}"/>
  <g transform="translate(880 130) ${rot}">${motif}</g>
  ${lines.map((l, i) => `<text x="80" y="${(titleTop + i * lh).toFixed(0)}" font-family="Inter Tight" font-weight="600" font-size="${fs}" letter-spacing="-2" fill="${PAPER}">${esc(l)}</text>`).join('\n  ')}
  <text x="80" y="${H - 40}" font-family="Inter Tight" font-weight="500" font-size="16" letter-spacing="3" fill="${DIM}">'WOLE ODUWOLE  ·  WOLDEZZY.XYZ</text>
</svg>`;
}

let n = 0;
for (const p of posts) {
  const svg = Buffer.from(cover(p));
  const base = sharp(svg, { density: 96 });
  const jobs = [];
  const jpg = join(OUT, `${p.slug}.jpg`);
  if (!existsSync(jpg)) jobs.push(base.clone().jpeg({ quality: 84, mozjpeg: true, progressive: true }).toFile(jpg));
  for (const w of [960, 1600]) {
    for (const fmt of ['avif', 'webp']) {
      const f = join(OUT, `${p.slug}-${w}.${fmt}`);
      if (existsSync(f)) continue;
      let pipe = base.clone().resize({ width: w });
      pipe = fmt === 'avif' ? pipe.avif({ quality: 58, effort: 6 }) : pipe.webp({ quality: 80 });
      jobs.push(pipe.toFile(f));
    }
  }
  await Promise.all(jobs);
  n++;
  process.stdout.write(`\r${n}/${posts.length} ${p.slug.slice(0, 50).padEnd(50)}`);
}
console.log(`\n✓ ${n} covers → public/images/covers/`);
