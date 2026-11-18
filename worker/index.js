// Cloudflare Worker with static assets. Everything is served from ./dist (including _headers and
// _redirects); only /api/* reaches this code first (see run_worker_first in wrangler.jsonc).
import { onRequestPost, onRequest } from './contact.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/contact' || url.pathname === '/api/contact/') {
      return request.method === 'POST' ? onRequestPost({ request, env }) : onRequest();
    }
    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ ok: false, error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    return env.ASSETS.fetch(request);
  },
};
