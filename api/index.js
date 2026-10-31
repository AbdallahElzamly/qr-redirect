require('dotenv').config();
const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());

// ── Supabase Setup ──────────────────────────────────────────────────────────
const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
      })
    : null;

// In-memory fallback (works instantly without any DB setup)
const memCards = {};
for (let i = 1; i <= 99; i++) {
    memCards[i] = {
        id: i, label: '', primary_url: '', secondary_url: '',
        scan_count: 0, primary_scans: 0, secondary_scans: 0, is_active: true
    };
}

async function getCard(id) {
    if (supabase) {
        const { data } = await supabase.from('cards').select('*').eq('id', id).single();
        return data;
    }
    return memCards[id] || null;
}

async function getAllCards() {
    if (supabase) {
        const { data } = await supabase.from('cards').select('*').order('id');
        return data || [];
    }
    return Object.values(memCards).sort((a, b) => a.id - b.id);
}

async function updateCard(id, fields) {
    if (supabase) {
        const { data } = await supabase.from('cards')
            .update({ ...fields, updated_at: new Date().toISOString() })
            .eq('id', id).select().single();
        return data;
    }
    if (memCards[id]) Object.assign(memCards[id], fields);
    return memCards[id];
}

async function incrementScan(id, type) {
    // type: 'primary' or 'secondary'
    if (supabase) {
        const card = await getCard(id);
        if (!card) return;
        const updates = { scan_count: (card.scan_count || 0) + 1 };
        if (type === 'primary') updates.primary_scans = (card.primary_scans || 0) + 1;
        else updates.secondary_scans = (card.secondary_scans || 0) + 1;
        await supabase.from('cards').update(updates).eq('id', id);
    } else {
        if (!memCards[id]) return;
        memCards[id].scan_count++;
        if (type === 'primary') memCards[id].primary_scans++;
        else memCards[id].secondary_scans++;
    }
}

// ── Redirect Route: /go/:id ─────────────────────────────────────────────────
// Smart redirect: checks cookie to decide primary vs secondary URL
app.get('/go/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id) || id < 1 || id > 99) {
        return res.status(404).send(errorPage('رقم الكارت غير صحيح'));
    }

    const card = await getCard(id);

    if (!card || !card.is_active) {
        return res.status(404).send(errorPage('هذا الكارت غير مفعّل بعد'));
    }

    if (!card.primary_url) {
        return res.status(404).send(errorPage('لم يتم تحديد وجهة لهذا الكارت'));
    }

    // Check if user already visited primary URL (cookie: qr_{id}_seen)
    const cookieName = `qr_${id}_seen`;
    const alreadySeen = req.headers.cookie && req.headers.cookie.includes(`${cookieName}=1`);

    let destination;
    let scanType;

    if (alreadySeen && card.secondary_url) {
        // Already reviewed on primary → send to secondary
        destination = card.secondary_url;
        scanType = 'secondary';
    } else {
        // First time or no secondary → send to primary
        destination = card.primary_url;
        scanType = 'primary';
        // Set cookie (365 days) to remember this visit
        res.setHeader('Set-Cookie', `${cookieName}=1; Max-Age=31536000; Path=/; SameSite=Lax`);
    }

    // Increment counter (non-blocking)
    incrementScan(id, scanType).catch(() => {});

    // Instant redirect
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.status(302).setHeader('Location', destination);
    return res.send(`<!DOCTYPE html><html><head>
        <meta charset="utf-8">
        <meta http-equiv="refresh" content="0;url=${destination}">
        <script>window.location.replace(${JSON.stringify(destination)})</script>
    </head><body></body></html>`);
});

// ── Admin API ───────────────────────────────────────────────────────────────

// Get all cards
app.get('/api/cards', async (req, res) => {
    try {
        const cards = await getAllCards();
        res.json({ success: true, cards });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Update a card (label, primary_url, secondary_url, is_active)
app.put('/api/cards/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id < 1 || id > 99) {
        return res.status(400).json({ success: false, error: 'Invalid card ID' });
    }

    const { label, primary_url, secondary_url, is_active } = req.body;
    const updates = {};
    if (label !== undefined) updates.label = String(label).trim();
    if (primary_url !== undefined) updates.primary_url = String(primary_url).trim();
    if (secondary_url !== undefined) updates.secondary_url = String(secondary_url).trim();
    if (is_active !== undefined) updates.is_active = Boolean(is_active);

    try {
        const card = await updateCard(id, updates);
        res.json({ success: true, card });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Bulk update cards (array of { id, primary_url, secondary_url, label })
app.post('/api/cards/bulk', async (req, res) => {
    const { cards } = req.body;
    if (!Array.isArray(cards)) return res.status(400).json({ success: false, error: 'cards must be array' });

    const results = [];
    for (const c of cards) {
        const id = parseInt(c.id, 10);
        if (isNaN(id) || id < 1 || id > 99) continue;
        const updates = {};
        if (c.label !== undefined) updates.label = String(c.label).trim();
        if (c.primary_url !== undefined) updates.primary_url = String(c.primary_url).trim();
        if (c.secondary_url !== undefined) updates.secondary_url = String(c.secondary_url).trim();
        try {
            const card = await updateCard(id, updates);
            results.push(card);
        } catch (e) {}
    }
    res.json({ success: true, updated: results.length });
});

// Reset scan counters for a card
app.post('/api/cards/:id/reset', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id < 1 || id > 99) return res.status(400).json({ success: false });
    try {
        await updateCard(id, { scan_count: 0, primary_scans: 0, secondary_scans: 0 });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Status check
app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        db: supabase ? 'supabase' : 'memory',
        base_url: `${req.protocol}://${req.get('host')}`
    });
});

// ── Static files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Error page helper ─────────────────────────────────────────────────────────
function errorPage(msg) {
    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>خطأ</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#111;color:#fff;font-family:Arial,sans-serif;text-align:center;}
  .box{padding:2rem;max-width:320px;}
  h2{color:#f87171;font-size:1.25rem;margin-bottom:.5rem;}
  p{color:#94a3b8;font-size:.9rem;}
</style>
</head>
<body><div class="box">
  <h2>⚠️ ${msg}</h2>
  <p>إذا كنت تعتقد أن هذا خطأ، تواصل مع المسؤول.</p>
</div></body></html>`;
}

// ── Start server ──────────────────────────────────────────────────────────────
if (!process.env.VERCEL) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`✅ QR Redirect running at http://localhost:${PORT}`);
        console.log(`🔗 Test redirect: http://localhost:${PORT}/go/1`);
        console.log(`⚙️  Admin panel:  http://localhost:${PORT}`);
    });
}

module.exports = app;
