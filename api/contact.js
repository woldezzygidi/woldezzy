// Contact form endpoint. Vercel serverless (Node). Sends via Resend when RESEND_API_KEY is set.
// Env: RESEND_API_KEY (required to send), CONTACT_TO (default wole@woldezzy.xyz), CONTACT_FROM (verified sender on Resend).
export const config = { runtime: 'nodejs' };

const MAX = { name: 120, email: 200, message: 4000 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'method' }); }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'body' });

  // Honeypot: real users never fill this.
  if (body.company) return res.status(200).json({ ok: true });

  const name = String(body.name || '').trim().slice(0, MAX.name);
  const email = String(body.email || '').trim().slice(0, MAX.email);
  const message = String(body.message || '').trim().slice(0, MAX.message);
  const TYPES = { project: 'Consulting or a project', role: 'Full-time role', contract: 'Contract or interim', fractional: 'Fractional CMO', speaking: 'Speaking or training', other: 'Something else' };
  const type = TYPES[body.type] || TYPES.project;
  if (name.length < 2 || !EMAIL.test(email) || message.length < 20) return res.status(422).json({ ok: false, error: 'fields' });

  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(503).json({ ok: false, error: 'unconfigured' });

  const to = process.env.CONTACT_TO || 'wole@woldezzy.xyz';
  const from = process.env.CONTACT_FROM || 'Website <contact@woldezzy.xyz>';
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
  if (!r.ok) return res.status(502).json({ ok: false, error: 'send' });
  return res.status(200).json({ ok: true });
}
