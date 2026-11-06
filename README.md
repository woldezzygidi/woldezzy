# woldezzy.xyz — static site

Zero-framework static site. HTML/CSS/vanilla JS. One build script, one font family, one accent colour.

## Build

```sh
npm install          # sharp only (image processing)
node build.mjs       # → dist/
```

`dist/` is the deployable artefact. Point any static host at it (Cloudflare Pages, Netlify, Vercel static, GitHub Pages). `_headers` and `_redirects` are Netlify/Cloudflare-format; translate to `vercel.json` if deploying there.

## Images (one-time, after domain allowlist)

Source media is still on the live WordPress host. Pull + process in one step:

```sh
node scripts/images.mjs          # fetches scripts/images.manifest.json → source-images/ → public/images/
node scripts/tiles.mjs           # typographic tiles for external projects + OG images (already run)
node build.mjs
```

If fetching is blocked, drop the originals into `source-images/` (filenames as listed in the manifest) and run `node scripts/images.mjs --local`.

## Adding a journal post

1. Create `pages/journal/<slug>.html` with the `<!--meta {…} -->` front-matter block (see any page in `pages/` for the shape; use `"ogType": "article"`).
2. Add a `.post-card` entry to `pages/journal.html` and optionally to the `data-journal-latest` grid in `index.html`.
3. `node build.mjs`.

## Layout

```
index.html                 hand-authored homepage (bespoke LCP preloads)
pages/*.html               fragments: <!--meta JSON--> + <main> contents
_partials/shell.html       head + header + footer wrapper applied by build
css/                       tokens → fonts → base → components → home → content → regional
js/main.js                 theme · header · nav · reveal · parallax (all listeners cleaned on pagehide)
public/fonts               Inter Tight variable, normal + italic (OFL)
public/images              generated ladders (avif/webp/jpg)
scripts/                   images.mjs · tiles.mjs · manifest
```

## Verified (Playwright, mobile 390px, Slow-4G + 4× CPU)

| page | LCP | CLS | INP | transfer |
|---|---|---|---|---|
| / | 904ms | 0.000 | 88ms | 110KB |
| /wolverhampton-birmingham-seo/ | 652ms | 0.000 | 128ms | 104KB |
| /research/ | 632ms | 0.000 | 88ms | 104KB |

Every page: exactly one `<h1>`, no heading skips, valid JSON-LD, all images with width/height + alt, no horizontal scroll, skip-link, single `<main>`.
