// Vercel serverless function: emails booking requests from the instant-price form via Resend.
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
  ['price', 'Price shown'],
  ['notes', 'Notes']
];

// Same price list as the instant price on index.html. Recomputed here so the
// emailed price can't be edited in the browser.
const REGULAR = [199, 239, 299, 369, 439];
const LARGER = [449, 569, 719, 869, 999]; // end of lease, deep, move in / out
const EXTRA_BATH = 40;
const DISCOUNT = { Weekly: 0.10, Fortnightly: 0.05 };

function priceFor(d) {
  const bedIdx = d.beds === '5+' ? 4 : parseInt(d.beds, 10) - 1;
  const baths = d.baths === '4+' ? 4 : parseInt(d.baths, 10);
  if (!(bedIdx >= 0 && bedIdx <= 4) || !(baths >= 1 && baths <= 4)) return '';
  const regular = d.service === 'Regular clean';
  const full = (regular ? REGULAR : LARGER)[bedIdx] + EXTRA_BATH * (baths - 1);
  const price = Math.round(full * (1 - (regular ? (DISCOUNT[d.often] || 0) : 0)));
  const from = d.beds === '5+' || d.baths === '4+' ? 'from ' : '';
  const per = regular && d.often !== 'Just once' ? ' per clean' : '';
  return from + '$' + price + per;
}

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
  if (clean(body.website, 200)) return res.status(200).json({ ok: true });

  const data = {};
  FIELDS.forEach(function (f) { data[f[0]] = clean(body[f[0]], f[0] === 'notes' ? 2000 : 200); });
  data.price = priceFor(data);

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
    '<h2 style="font-family:sans-serif;color:#0b4f4a">New booking request</h2>' +
    '<table style="font-family:sans-serif;font-size:15px;border-collapse:collapse">' +
    rows.map(function (f) {
      return '<tr><td style="padding:6px 16px 6px 0;color:#666;vertical-align:top">' + f[1] +
        '</td><td style="padding:6px 0;white-space:pre-wrap">' + esc(data[f[0]]) + '</td></tr>';
    }).join('') +
    '</table>';

  const payload = {
    from: FROM,
    to: [TO],
    subject: 'Booking request: ' + data.name + ' (' + data.suburb + ')' + (data.price ? ', ' + data.price : ''),
    text: text,
    html: html
  };
  if (data.email) payload.reply_to = data.email;

  if (!(await send(payload))) {
    return res.status(502).json({ error: 'Could not send right now.' });
  }

  // Confirmation to the customer. The enquiry already reached us, so a failure here is only logged.
  if (data.email) {
    const site = process.env.SITE_URL || 'https://' + (req.headers['x-forwarded-host'] || req.headers.host);
    await send(confirmation(data, rows, site.replace(/\/$/, '')));
  }

  return res.status(200).json({ ok: true });
};

async function send(payload) {
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
      return false;
    }
    return true;
  } catch (e) {
    console.error('Resend request failed', e);
    return false;
  }
}

function confirmation(data, rows, site) {
  const first = data.name.split(/\s+/)[0];
  const summary = rows.filter(function (f) { return f[0] !== 'name' && f[0] !== 'email'; });
  const text =
    'Hi ' + first + ',\n\n' +
    "Thanks for your booking request! We'll be in touch within 1 hour (during business hours) to confirm a time.\n\n" +
    "Here's what you sent us:\n" +
    summary.map(function (f) { return f[1] + ': ' + data[f[0]]; }).join('\n') + '\n\n' +
    'Need to add anything? Just reply to this email, or call or text us on 0431 039 905.\n\n' +
    'Cheers,\nThe Spotless Mate team\nHome cleaning in Ryde & greater Sydney\n0431 039 905 · instagram.com/spotlessmate';
  const html =
    '<div style="font-family:sans-serif;font-size:16px;line-height:1.55;color:#0F4C5C;max-width:560px">' +
    '<img src="' + site + '/email-logo.png" width="96" height="96" alt="Spotless Mate" ' +
    'style="display:block;width:96px;height:96px;border-radius:50%;border:0;margin:0 0 20px">' +
    '<p style="font-size:22px;font-weight:bold;margin:0 0 16px">Thanks for your booking request, ' + esc(first) + '!</p>' +
    '<p style="margin:0 0 16px">We\'ll be in touch within 1 hour (during business hours) to confirm a time.</p>' +
    '<p style="margin:0 0 8px;font-weight:bold">Here\'s what you sent us:</p>' +
    '<table style="font-size:15px;border-collapse:collapse;background:#E6F7F2;border-radius:12px;margin:0 0 16px">' +
    summary.map(function (f) {
      return '<tr><td style="padding:8px 16px;color:#2F5F69;vertical-align:top">' + f[1] +
        '</td><td style="padding:8px 16px 8px 0;white-space:pre-wrap">' + esc(data[f[0]]) + '</td></tr>';
    }).join('') +
    '</table>' +
    '<p style="margin:0 0 16px">Need to add anything? Just reply to this email, or call or text us on ' +
    '<a href="tel:+61431039905" style="color:#0F4C5C;font-weight:bold">0431 039 905</a>.</p>' +
    '<p style="margin:0">Cheers,<br><strong>The Spotless Mate team</strong><br>' +
    '<span style="color:#2F5F69">Home cleaning in Ryde &amp; greater Sydney · 0431 039 905 · ' +
    '<a href="https://www.instagram.com/spotlessmate/" style="color:#0F4C5C">@spotlessmate</a></span></p>' +
    '</div>';
  return {
    from: FROM,
    to: [data.email],
    reply_to: TO,
    subject: 'Thanks for your booking request, ' + first + '!',
    text: text,
    html: html
  };
}
