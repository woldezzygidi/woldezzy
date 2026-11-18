// Contact form endpoint, served by the Worker in worker/index.js. Sends via Resend when RESEND_API_KEY is set.
// Env (Worker > Settings > Variables and Secrets): RESEND_API_KEY (secret, required to send),
// CONTACT_TO (default wole@woldezzy.xyz), CONTACT_FROM (a sender verified on Resend).

const MAX = { name: 120, email: 200, message: 4000 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TYPES = { project: 'Consulting or a project', role: 'Full-time role', contract: 'Contract or interim', fractional: 'Fractional CMO', speaking: 'Speaking or training', other: 'Something else' };

const json = (status, data, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });

export async function onRequestPost({ request, env }) {
  let body = null;
  try { body = await request.json(); } catch { body = null; }
  if (!body || typeof body !== 'object') return json(400, { ok: false, error: 'body' });

  // Honeypot: real users never fill this.
  if (body.company) return json(200, { ok: true });

  const name = String(body.name || '').trim().slice(0, MAX.name);
  const email = String(body.email || '').trim().slice(0, MAX.email);
  const message = String(body.message || '').trim().slice(0, MAX.message);
  const type = TYPES[body.type] || TYPES.project;
  if (name.length < 2 || !EMAIL.test(email) || message.length < 20) return json(422, { ok: false, error: 'fields' });

  const key = env.RESEND_API_KEY;
  if (!key) return json(503, { ok: false, error: 'unconfigured' });

  const to = env.CONTACT_TO || 'wole@woldezzy.xyz';
  const from = env.CONTACT_FROM || 'Website <contact@woldezzy.xyz>';
  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to: [to], reply_to: email,
      subject: `[${type}] Enquiry from ${name}`,
      text: `Type: ${type}\nFrom: ${name} <${email}>\n\n${message}`,
      html: `<p><em>${esc(type)}</em></p><p><strong>${esc(name)}</strong> &lt;${esc(email)}&gt;</p><p style="white-space:pre-wrap">${esc(message)}</p>`,
    }),
  });
  if (!r.ok) return json(502, { ok: false, error: 'send' });
  return json(200, { ok: true });
}

export function onRequest() {
  return json(405, { ok: false, error: 'method' }, { Allow: 'POST' });
}
