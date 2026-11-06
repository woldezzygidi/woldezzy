/* GA4. Loaded after first paint so it never sits on the LCP path.
   Cross-document View Transitions are full navigations, so page_view fires per page as normal. */
(function () {
  const ID = 'G-Z54VW5FSZW';
  if (navigator.doNotTrack === '1' || /bot|crawl|spider|lighthouse|headless/i.test(navigator.userAgent)) return;

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', ID, { anonymize_ip: true, transport_type: 'beacon' });

  const load = () => {
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
    document.head.appendChild(s);
  };
  if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 2500 });
  else setTimeout(load, 1200);

  // Events worth having beyond page_view.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const url = new URL(a.href, location.href);
    if (a.closest('[data-share]')) {
      gtag('event', 'share', { method: a.dataset.shareNetwork || url.hostname, content_type: 'article', item_id: location.pathname });
    } else if (url.origin !== location.origin) {
      gtag('event', 'click', { link_domain: url.hostname, link_url: url.href, outbound: true });
    } else if (url.protocol === 'mailto:' || url.protocol === 'tel:') {
      gtag('event', 'contact', { method: url.protocol.replace(':', '') });
    }
  }, { passive: true });

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-share-native]');
    if (t) gtag('event', 'share', { method: 'native', content_type: 'article', item_id: location.pathname });
    const th = e.target.closest('[data-theme-toggle]');
    if (th) gtag('event', 'theme_toggle', { theme: document.documentElement.dataset.theme || 'dark' });
  }, { passive: true });

  // Scroll depth on journal posts: 50% and 90%, once each.
  if (document.querySelector('article.post')) {
    const fired = new Set();
    const onScroll = () => {
      const pct = (scrollY + innerHeight) / document.documentElement.scrollHeight * 100;
      for (const m of [50, 90]) if (pct >= m && !fired.has(m)) { fired.add(m); gtag('event', 'scroll_depth', { percent: m, item_id: location.pathname }); }
      if (fired.size === 2) removeEventListener('scroll', onScroll);
    };
    addEventListener('scroll', onScroll, { passive: true });
  }
})();
