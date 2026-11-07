/**
 * Woldezzy — main.js
 * Vanilla ES module. No dependencies.
 * Concerns: theme, header scroll state, mobile nav, scroll reveal, hero portrait parallax.
 * INP budget: every listener is passive or rAF-batched; no synchronous layout reads in handlers.
 */

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');
const FINE_POINTER = window.matchMedia('(hover: hover) and (pointer: fine)');

/* ──────────────────────────────────────────
   THEME
   Order of precedence: localStorage override > prefers-color-scheme > dark.
   Early inline script in <head> applies data-theme before first paint to avoid FOUC.
   This module only wires the toggle.
   ────────────────────────────────────────── */
const THEME_KEY = 'woldezzy:theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const toggle = document.querySelector('[data-theme-toggle]');
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(theme === 'light'));
    toggle.setAttribute(
      'aria-label',
      theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'
    );
  }
}

function initTheme() {
  const toggle = document.querySelector('[data-theme-toggle]');
  if (!toggle) return () => {};

  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current);

  let fadeTimer = 0;
  const onClick = () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    const root = document.documentElement;
    root.classList.add('theme-transition');
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* storage unavailable */ }
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => root.classList.remove('theme-transition'), 280);
  };
  toggle.addEventListener('click', onClick);
  return () => toggle.removeEventListener('click', onClick);
}

/* ──────────────────────────────────────────
   HEADER SCROLL STATE
   rAF-batched; reads scrollY once per frame max.
   ────────────────────────────────────────── */
function initHeader() {
  const header = document.querySelector('[data-header]');
  if (!header) return () => {};

  let ticking = false;
  let lastState = null;

  const update = () => {
    const scrolled = window.scrollY > 8;
    if (scrolled !== lastState) {
      header.setAttribute('data-scrolled', String(scrolled));
      lastState = scrolled;
    }
    ticking = false;
  };

  const onScroll = () => {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  update();
  return () => window.removeEventListener('scroll', onScroll);
}

/* ──────────────────────────────────────────
   MOBILE NAV
   ────────────────────────────────────────── */
function initNav() {
  const toggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-nav]');
  if (!toggle || !nav) return () => {};

  const setOpen = (open) => {
    nav.setAttribute('data-open', String(open));
    toggle.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) {
      const first = nav.querySelector('a');
      first && first.focus({ preventScroll: true });
    }
  };

  const onToggle = () => setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  const onNavClick = (e) => {
    if (e.target.closest('a')) setOpen(false);
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  };
  const mq = window.matchMedia('(min-width: 720px)');
  const onMq = (e) => { if (e.matches) setOpen(false); };

  toggle.addEventListener('click', onToggle);
  nav.addEventListener('click', onNavClick);
  document.addEventListener('keydown', onKey);
  mq.addEventListener('change', onMq);

  return () => {
    toggle.removeEventListener('click', onToggle);
    nav.removeEventListener('click', onNavClick);
    document.removeEventListener('keydown', onKey);
    mq.removeEventListener('change', onMq);
  };
}

/* ──────────────────────────────────────────
   SCROLL REVEAL
   IntersectionObserver; unobserves after first intersect.
   ────────────────────────────────────────── */
function initReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!els.length) return () => {};

  if (REDUCED_MOTION.matches || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.setAttribute('data-in', 'true'));
    return () => {};
  }

  // Stagger: index siblings inside any .reveal-group so CSS can delay them.
  document.querySelectorAll('.reveal-group').forEach((g) => {
    let i = 0;
    for (const child of g.children) if (child.classList.contains('reveal')) child.style.setProperty('--i', String(i++));
  });

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.setAttribute('data-in', 'true');
          io.unobserve(entry.target);
        }
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.08 }
  );
  els.forEach((el) => io.observe(el));
  return () => io.disconnect();
}

/* ──────────────────────────────────────────
   HERO PORTRAIT PARALLAX
   GPU-only transform on the image. Disabled on touch and reduced motion.
   Reads getBoundingClientRect once per frame only while hero is in viewport.
   ────────────────────────────────────────── */
function initParallax() {
  const img = document.querySelector('[data-parallax]');
  if (!img || REDUCED_MOTION.matches || !FINE_POINTER.matches) return () => {};

  const wrapper = img.parentElement;
  let active = false;
  let ticking = false;
  const strength = 0.08;

  const io = new IntersectionObserver(
    ([entry]) => { active = entry.isIntersecting; if (active) onScroll(); },
    { threshold: 0 }
  );
  io.observe(wrapper);

  const update = () => {
    const rect = wrapper.getBoundingClientRect();
    const centre = rect.top + rect.height / 2;
    const offset = (centre - window.innerHeight / 2) * -strength;
    img.style.transform = `translate3d(0, ${offset.toFixed(2)}px, 0) scale(1.08)`;
    ticking = false;
  };

  const onScroll = () => {
    if (!active || ticking) return;
    requestAnimationFrame(update);
    ticking = true;
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  return () => {
    window.removeEventListener('scroll', onScroll);
    io.disconnect();
    img.style.transform = '';
  };
}

/* ──────────────────────────────────────────
   SHARE — native Web Share when available, else the link list; copy-to-clipboard.
   ────────────────────────────────────────── */
/* Homepage hero: ambient frames. Extra frames are only fetched after the page has loaded,
   so the LCP image is never contested. Crossfade every 6s; pauses when the tab is hidden. */
function initHeroFrames() {
  const fig = document.querySelector('.hero__portrait[data-frames]');
  if (!fig || REDUCED_MOTION.matches) return () => {};
  let frames;
  try { frames = JSON.parse(fig.dataset.frames); } catch (_) { return () => {}; }
  if (!Array.isArray(frames) || !frames.length) return () => {};

  const first = fig.querySelector('.hero__frame');
  const label = fig.querySelector('[data-frame-label]');
  const firstLabel = label ? label.textContent : '';
  const pics = [first];
  let i = 0, timer = 0, started = false;

  const build = (f) => {
    const pic = document.createElement('picture');
    pic.className = 'hero__frame';
    pic.setAttribute('aria-hidden', 'true');
    pic.innerHTML = `<source type="image/avif" srcset="${f.avif}" sizes="(min-width: 1024px) 460px, 90vw"><source type="image/webp" srcset="${f.webp}" sizes="(min-width: 1024px) 460px, 90vw"><img src="${f.jpg}" width="768" height="1024" alt="" loading="lazy" decoding="async">`;
    pic.dataset.label = f.label;
    return pic;
  };

  const setLabel = (text) => {
    if (!label) return;
    label.classList.add('is-swapping');
    setTimeout(() => { label.textContent = text; label.classList.remove('is-swapping'); }, 280);
  };

  const advance = () => {
    const next = (i + 1) % pics.length;
    pics[i].classList.remove('is-active');
    pics[next].classList.add('is-active');
    i = next;
    setLabel(i === 0 ? firstLabel : pics[i].dataset.label);
  };

  const start = () => {
    if (started) return;
    started = true;
    frames.forEach((f) => { const p = build(f); fig.insertBefore(p, fig.querySelector('figcaption')); pics.push(p); });
    timer = setInterval(() => { if (!document.hidden) advance(); }, 6000);
  };

  // Wait for load + idle so the hero never competes with LCP.
  const onLoad = () => ('requestIdleCallback' in window ? requestIdleCallback(start, { timeout: 3000 }) : setTimeout(start, 1500));
  if (document.readyState === 'complete') onLoad(); else window.addEventListener('load', onLoad, { once: true });

  return () => { clearInterval(timer); window.removeEventListener('load', onLoad); };
}

/* About: horizontal film strip. Native scroll-snap does the work; JS adds the counter, buttons and drag. */
function initStrip() {
  const track = document.querySelector('[data-strip]');
  if (!track) return () => {};
  const items = [...track.querySelectorAll('[data-strip-item]')];
  const ui = document.querySelector('[data-strip-ui]');
  const idx = ui?.querySelector('[data-strip-index]');
  const prev = ui?.querySelector('[data-strip-prev]');
  const next = ui?.querySelector('[data-strip-next]');
  if (!items.length) return () => {};

  let current = 0;
  const setCurrent = (n) => {
    current = n;
    items.forEach((el, k) => el.classList.toggle('is-current', k === n));
    if (idx) idx.textContent = String(n + 1).padStart(2, '0');
    if (prev) prev.disabled = n === 0;
    if (next) next.disabled = n === items.length - 1;
  };

  // The current item is the one whose left edge is nearest the track's scroll-padding start.
  const pad = () => parseFloat(getComputedStyle(track).scrollPaddingInlineStart) || 0;
  let raf = 0;
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const x = track.scrollLeft + pad();
      let best = 0, bestD = Infinity;
      items.forEach((el, k) => { const d = Math.abs(el.offsetLeft - x); if (d < bestD) { bestD = d; best = k; } });
      if (best !== current) setCurrent(best);
    });
  };
  const go = (n) => {
    n = Math.max(0, Math.min(items.length - 1, n));
    track.scrollTo({ left: items[n].offsetLeft - pad(), behavior: REDUCED_MOTION.matches ? 'auto' : 'smooth' });
  };
  const onPrev = () => go(current - 1);
  const onNext = () => go(current + 1);
  const onKey = (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); onNext(); } else if (e.key === 'ArrowLeft') { e.preventDefault(); onPrev(); } };

  // Pointer drag for mouse users (touch already scrolls natively).
  let dragging = false, startX = 0, startLeft = 0, moved = false;
  const onDown = (e) => { if (e.pointerType !== 'mouse') return; dragging = true; moved = false; startX = e.clientX; startLeft = track.scrollLeft; track.classList.add('is-dragging'); track.setPointerCapture(e.pointerId); };
  const onMove = (e) => { if (!dragging) return; const dx = e.clientX - startX; if (Math.abs(dx) > 4) moved = true; track.scrollLeft = startLeft - dx; };
  const onUp = (e) => { if (!dragging) return; dragging = false; track.classList.remove('is-dragging'); try { track.releasePointerCapture(e.pointerId); } catch (_) {} if (moved) go(current); };
  const onClick = (e) => { if (moved) { e.preventDefault(); moved = false; } };

  track.addEventListener('scroll', onScroll, { passive: true });
  track.addEventListener('keydown', onKey);
  track.addEventListener('pointerdown', onDown);
  track.addEventListener('pointermove', onMove);
  track.addEventListener('pointerup', onUp);
  track.addEventListener('pointercancel', onUp);
  track.addEventListener('click', onClick, true);
  prev?.addEventListener('click', onPrev);
  next?.addEventListener('click', onNext);
  setCurrent(0);

  return () => {
    track.removeEventListener('scroll', onScroll);
    track.removeEventListener('keydown', onKey);
    track.removeEventListener('pointerdown', onDown);
    track.removeEventListener('pointermove', onMove);
    track.removeEventListener('pointerup', onUp);
    track.removeEventListener('pointercancel', onUp);
    track.removeEventListener('click', onClick, true);
    prev?.removeEventListener('click', onPrev);
    next?.removeEventListener('click', onNext);
    if (raf) cancelAnimationFrame(raf);
  };
}

function initShare() {
  const root = document.querySelector('[data-share]');
  if (!root) return () => {};
  const title = root.dataset.title, url = root.dataset.url;
  const status = root.querySelector('.share__status');
  const say = (msg) => { if (status) { status.textContent = msg; setTimeout(() => { status.textContent = ''; }, 2400); } };

  const nativeBtn = root.querySelector('[data-share-native]');
  const onNative = async () => { try { await navigator.share({ title, url }); } catch (_) { /* user cancelled */ } };
  if (nativeBtn && navigator.share && navigator.canShare?.({ title, url })) {
    nativeBtn.hidden = false;
    nativeBtn.addEventListener('click', onNative);
  }

  const copyBtn = root.querySelector('[data-share-copy]');
  const onCopy = async () => {
    try { await navigator.clipboard.writeText(url); say('Link copied'); }
    catch (_) { say('Copy failed. Select the address bar instead.'); }
  };
  copyBtn && copyBtn.addEventListener('click', onCopy);

  return () => { nativeBtn && nativeBtn.removeEventListener('click', onNative); copyBtn && copyBtn.removeEventListener('click', onCopy); };
}

/* ──────────────────────────────────────────
   FOOTER YEAR
   ────────────────────────────────────────── */
function initYear() {
  const el = document.querySelector('[data-year]');
  if (el) el.textContent = String(new Date().getFullYear());
}

/* ──────────────────────────────────────────
   BOOT
   ────────────────────────────────────────── */
const cleanups = [];

function boot() {
  initYear();
  cleanups.push(initTheme(), initHeader(), initNav(), initReveal(), initParallax(), initShare(), initHeroFrames(), initStrip());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

// bfcache: tear down on pagehide so no listeners leak across navigations.
window.addEventListener('pagehide', () => {
  cleanups.forEach((fn) => { try { fn(); } catch (_) {} });
  cleanups.length = 0;
}, { once: true });
