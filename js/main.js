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
  cleanups.push(initTheme(), initHeader(), initNav(), initReveal(), initParallax(), initShare());
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
