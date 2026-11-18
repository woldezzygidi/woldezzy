# woldezzy.xyz — static site

Zero-framework static site. HTML/CSS/vanilla JS. One build script, one font family, one accent colour.

## Build

```sh
npm run setup        # sharp for the image scripts only; the site build needs no packages
node build.mjs       # → dist/
```

`dist/` is the deployable artefact, served by a Cloudflare Worker with static assets (see `wrangler.jsonc`). Every push to `main` builds and deploys automatically.

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

## Hosting: Cloudflare Workers (static assets)

- `wrangler.jsonc`: Worker `woldezzy`, assets from `./dist`, `/api/*` handled by `worker/index.js`.
- Workers Builds settings: build command `node build.mjs`, deploy command `npx wrangler deploy`, Node 24 (from `.node-version`).
- Headers and redirects live in `vercel.json` (kept as the single source; the file name is historical). The build writes `dist/_headers` and `dist/_redirects`, which Workers static assets apply.
- Contact form: `worker/contact.js`. Set `RESEND_API_KEY` as a secret, and optionally `CONTACT_TO`, `CONTACT_FROM`, under the Worker's Settings > Variables and Secrets.
