// Vercel serverless function: emails quote-form enquiries via Resend.
// Env vars: RESEND_API_KEY (required), ENQUIRY_TO, ENQUIRY_FROM (optional overrides).

const TO = process.env.ENQUIRY_TO || 'Enquiries@spotlessmate.com.au';
const FROM = process.env.ENQUIRY_FROM || 'Spotless Mate Website <enquiries@spotlessmate.com.au>';

const FIELDS = [
  ['name', 'Name'],
  ['suburb', 'Suburb'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['service', 'Type of clean'],
  ['often', 'How often'],
  ['beds', 'Bedrooms'],
  ['baths', 'Bathrooms'],
  ['notes', 'Notes']
];

function clean(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function esc(s) {
  return s.replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'Email is not configured' });
  }

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  // Honeypot: real visitors never see or fill this field.
  if (clean(body.company, 200)) return res.status(200).json({ ok: true });

  const data = {};
  FIELDS.forEach(function (f) { data[f[0]] = clean(body[f[0]], f[0] === 'notes' ? 2000 : 200); });

  if (!data.name || !data.suburb) {
    return res.status(400).json({ error: 'Please add your name and suburb.' });
  }
  if (!data.phone && !data.email) {
    return res.status(400).json({ error: 'Please add a phone number or email so we can reply.' });
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return res.status(400).json({ error: 'That email address does not look right.' });
  }

  const rows = FIELDS.filter(function (f) { return data[f[0]]; });
  const text = rows.map(function (f) { return f[1] + ': ' + data[f[0]]; }).join('\n');
  const html =
    '<h2 style="font-family:sans-serif;color:#0b4f4a">New quote enquiry</h2>' +
    '<table style="font-family:sans-serif;font-size:15px;border-collapse:collapse">' +
    rows.map(function (f) {
      return '<tr><td style="padding:6px 16px 6px 0;color:#666;vertical-align:top">' + f[1] +
        '</td><td style="padding:6px 0;white-space:pre-wrap">' + esc(data[f[0]]) + '</td></tr>';
    }).join('') +
    '</table>';

  const payload = {
    from: FROM,
    to: [TO],
    subject: 'Quote enquiry: ' + data.name + ' (' + data.suburb + ')',
    text: text,
    html: html
  };
  if (data.email) payload.reply_to = data.email;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!r.ok) {
      console.error('Resend error', r.status, await r.text());
      return res.status(502).json({ error: 'Could not send right now.' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Resend request failed', e);
    return res.status(502).json({ error: 'Could not send right now.' });
  }
};
