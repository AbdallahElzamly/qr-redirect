// ============================================================
// QR Redirect Admin — Frontend Logic
// ============================================================

let allCards = [];
let baseUrl = window.location.origin;

// ── Boot ──────────────────────────────────────────────────
async function boot() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        baseUrl = data.base_url || window.location.origin;
        document.getElementById('domainPreview').textContent = baseUrl + '/go/';
        document.getElementById('statusBadge').textContent =
            data.db === 'supabase' ? '🟢 Supabase متصل' : '🟡 وضع التجربة (Memory)';
    } catch { document.getElementById('statusBadge').textContent = '🔴 تعذر الاتصال'; }

    await loadCards();
}

// ── Load cards from server ────────────────────────────────
async function loadCards() {
    try {
        const res = await fetch('/api/cards');
        const data = await res.json();
        allCards = data.cards || [];
        renderCardsTable(allCards);
        renderStatsTable(allCards);
        renderKPI(allCards);
    } catch (e) {
        showToast('تعذر تحميل الكروت', 'error');
    }
}

// ── Tab Switching ─────────────────────────────────────────
function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('border-white', 'text-white');
        b.classList.add('border-transparent', 'text-gray-400');
    });
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));

    document.getElementById('tab-' + name).classList.add('border-white', 'text-white');
    document.getElementById('tab-' + name).classList.remove('border-transparent', 'text-gray-400');
    document.getElementById('pane-' + name).classList.remove('hidden');
}

// ── Toast ─────────────────────────────────────────────────
function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `fixed top-4 right-4 z-50 text-white text-sm font-bold px-5 py-3 rounded-xl shadow-xl transition-all ${type === 'error' ? 'bg-red-600' : 'bg-emerald-600'}`;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 3000);
}

// ============================================================
// TAB 1: QR GENERATION
// ============================================================

/**
 * Generates a single QR code PNG as a DataURL.
 * Draws black QR on white background, then overlays the number in the center.
 */
function generateQRDataURL(num, size) {
    return new Promise((resolve) => {
        const url = `${baseUrl}/go/${num}`;
        const hidden = document.getElementById('qrHidden');
        hidden.innerHTML = '';

        new QRCode(hidden, {
            text: url,
            width: size,
            height: size,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H   // High error correction so center overlay doesn't break it
        });

        // QRCode.js renders async via image element
        setTimeout(() => {
            const img = hidden.querySelector('img') || hidden.querySelector('canvas');
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');

            const drawOverlay = () => {
                // White circle in center (covers ~18% of QR)
                const cx = size / 2;
                const cy = size / 2;
                const r  = size * 0.10;

                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
                ctx.fill();

                // Number text
                const fontSize = Math.round(size * 0.13);
                ctx.font = `900 ${fontSize}px Arial, sans-serif`;
                ctx.fillStyle = '#000000';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(num), cx, cy);

                resolve(canvas.toDataURL('image/png'));
            };

            if (img instanceof HTMLCanvasElement) {
                ctx.drawImage(img, 0, 0, size, size);
                drawOverlay();
            } else if (img instanceof HTMLImageElement) {
                if (img.complete) {
                    ctx.drawImage(img, 0, 0, size, size);
                    drawOverlay();
                } else {
                    img.onload = () => { ctx.drawImage(img, 0, 0, size, size); drawOverlay(); };
                }
            } else {
                // Fallback: create canvas from scratch
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, size, size);
                drawOverlay();
            }
        }, 120);
    });
}

// Preview QR codes in grid
async function previewQRs() {
    const from = parseInt(document.getElementById('fromNum').value, 10);
    const to   = parseInt(document.getElementById('toNum').value, 10);
    if (isNaN(from) || isNaN(to) || from > to || from < 1 || to > 99) {
        return showToast('أرقام غير صحيحة (1–99)', 'error');
    }

    const container = document.getElementById('previewContainer');
    const grid      = document.getElementById('previewGrid');
    container.innerHTML = '';
    grid.classList.remove('hidden');

    for (let n = from; n <= to; n++) {
        const dataUrl = await generateQRDataURL(n, 200);
        const div = document.createElement('div');
        div.className = 'text-center';
        div.innerHTML = `
            <img src="${dataUrl}" class="rounded-lg border border-gray-700 w-full" alt="QR ${n}">
            <div class="text-xs text-gray-400 mt-1 font-bold">#${n}</div>
        `;
        container.appendChild(div);
    }
    showToast(`تم توليد ${to - from + 1} كيو ار كود`);
}

// Download all QR codes as ZIP
async function downloadZIP() {
    const from = parseInt(document.getElementById('fromNum').value, 10);
    const to   = parseInt(document.getElementById('toNum').value, 10);
    const size = parseInt(document.getElementById('qrSize').value, 10);

    if (isNaN(from) || isNaN(to) || from > to || from < 1 || to > 99) {
        return showToast('أرقام غير صحيحة (1–99)', 'error');
    }

    const total = to - from + 1;
    const wrap  = document.getElementById('progressWrap');
    const bar   = document.getElementById('progressBar');
    const txt   = document.getElementById('progressTxt');
    wrap.classList.remove('hidden');

    const zip = new JSZip();
    const folder = zip.folder('qr-codes');

    for (let n = from; n <= to; n++) {
        const dataUrl = await generateQRDataURL(n, size);
        const base64  = dataUrl.split(',')[1];
        folder.file(`qr-${String(n).padStart(2, '0')}.png`, base64, { base64: true });

        const pct = Math.round(((n - from + 1) / total) * 100);
        bar.style.width = pct + '%';
        txt.textContent = pct + '%';
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `qr-codes-${from}-${to}.zip`;
    a.click();
    URL.revokeObjectURL(url);

    setTimeout(() => wrap.classList.add('hidden'), 1000);
    showToast(`✅ تم تحميل ${total} كيو ار كود في ملف ZIP`);
}

// ============================================================
// TAB 2: MANAGE DESTINATIONS
// ============================================================

function renderCardsTable(cards) {
    const tbody = document.getElementById('cardsTable');
    const q     = (document.getElementById('searchCards')?.value || '').toLowerCase();

    const filtered = cards.filter(c =>
        !q || String(c.id).includes(q) || (c.label || '').toLowerCase().includes(q)
    );

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500">لا توجد نتائج</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(card => `
        <tr class="hover:bg-gray-800/30 transition" data-id="${card.id}">
            <td class="px-3 py-2.5 font-extrabold text-white text-center w-10">
                <span class="inline-block w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white text-xs font-black leading-none">${card.id}</span>
            </td>
            <td class="px-3 py-2.5">
                <input value="${escHtml(card.label || '')}" placeholder="اسم المحل..." data-field="label"
                    class="w-full bg-transparent border-b border-gray-700 focus:border-white outline-none py-1 text-gray-200 text-xs placeholder-gray-600">
            </td>
            <td class="px-3 py-2.5">
                <input value="${escHtml(card.primary_url || '')}" placeholder="https://g.page/r/..." data-field="primary_url"
                    class="w-full bg-transparent border-b border-gray-700 focus:border-white outline-none py-1 text-emerald-400 text-xs font-mono placeholder-gray-600 text-left">
            </td>
            <td class="px-3 py-2.5">
                <input value="${escHtml(card.secondary_url || '')}" placeholder="https://facebook.com/..." data-field="secondary_url"
                    class="w-full bg-transparent border-b border-gray-700 focus:border-white outline-none py-1 text-blue-400 text-xs font-mono placeholder-gray-600 text-left">
            </td>
            <td class="px-3 py-2.5 text-center text-gray-300 font-mono">
                <div class="text-sm font-bold">${card.scan_count || 0}</div>
                <div class="text-gray-500">${card.primary_scans||0}↑ ${card.secondary_scans||0}↷</div>
            </td>
            <td class="px-3 py-2.5 text-center">
                <button onclick="saveCard(${card.id}, this)"
                    class="bg-white text-black text-[10px] font-black px-3 py-1.5 rounded-lg hover:bg-gray-200 transition">
                    حفظ
                </button>
            </td>
        </tr>
    `).join('');
}

async function saveCard(id, btn) {
    const row    = btn.closest('tr');
    const label  = row.querySelector('[data-field="label"]').value.trim();
    const pUrl   = row.querySelector('[data-field="primary_url"]').value.trim();
    const sUrl   = row.querySelector('[data-field="secondary_url"]').value.trim();

    btn.textContent = '...';
    btn.disabled = true;

    try {
        const res = await fetch(`/api/cards/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label, primary_url: pUrl, secondary_url: sUrl })
        });
        const data = await res.json();
        if (data.success) {
            // Update local state
            const idx = allCards.findIndex(c => c.id === id);
            if (idx !== -1) allCards[idx] = data.card;
            showToast(`✅ تم حفظ الكارت #${id}`);
        } else {
            showToast(data.error || 'خطأ في الحفظ', 'error');
        }
    } catch {
        showToast('تعذر الاتصال بالخادم', 'error');
    } finally {
        btn.textContent = 'حفظ';
        btn.disabled = false;
    }
}

async function bulkAssign() {
    const from  = parseInt(document.getElementById('bulkFrom').value, 10);
    const to    = parseInt(document.getElementById('bulkTo').value, 10);
    const pUrl  = document.getElementById('bulkPrimary').value.trim();
    const sUrl  = document.getElementById('bulkSecondary').value.trim();

    if (isNaN(from) || isNaN(to) || from > to) return showToast('أرقام غير صحيحة', 'error');
    if (!pUrl) return showToast('الرابط الأول مطلوب', 'error');

    const cards = [];
    for (let i = from; i <= to; i++) {
        cards.push({ id: i, primary_url: pUrl, secondary_url: sUrl });
    }

    try {
        const res = await fetch('/api/cards/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cards })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`✅ تم تحديث ${data.updated} كارت`);
            await loadCards();
        }
    } catch {
        showToast('خطأ في الحفظ الجماعي', 'error');
    }
}

// ── Search filter ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const searchEl = document.getElementById('searchCards');
    if (searchEl) {
        searchEl.addEventListener('input', () => renderCardsTable(allCards));
    }
});

// ============================================================
// TAB 3: STATS
// ============================================================

function renderKPI(cards) {
    const active = cards.filter(c => c.primary_url).length;
    document.getElementById('kpiTotal').textContent    = cards.reduce((s,c) => s+(c.scan_count||0), 0).toLocaleString();
    document.getElementById('kpiPrimary').textContent  = cards.reduce((s,c) => s+(c.primary_scans||0), 0).toLocaleString();
    document.getElementById('kpiSecondary').textContent= cards.reduce((s,c) => s+(c.secondary_scans||0), 0).toLocaleString();
    document.getElementById('kpiActive').textContent   = active;
}

function renderStatsTable(cards) {
    const sorted = [...cards]
        .filter(c => c.scan_count > 0)
        .sort((a, b) => (b.scan_count || 0) - (a.scan_count || 0));

    if (sorted.length === 0) {
        document.getElementById('statsTable').innerHTML =
            '<tr><td colspan="6" class="text-center py-8 text-gray-500">لا توجد مسحات بعد</td></tr>';
        return;
    }

    document.getElementById('statsTable').innerHTML = sorted.map(card => `
        <tr class="hover:bg-gray-800/20">
            <td class="px-4 py-3 font-extrabold">
                <span class="inline-block w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white text-xs font-black">${card.id}</span>
            </td>
            <td class="px-4 py-3 text-gray-300">${escHtml(card.label || '—')}</td>
            <td class="px-4 py-3 text-center font-bold text-white font-mono">${(card.scan_count||0).toLocaleString()}</td>
            <td class="px-4 py-3 text-center text-emerald-400 font-mono">${(card.primary_scans||0).toLocaleString()}</td>
            <td class="px-4 py-3 text-center text-blue-400 font-mono">${(card.secondary_scans||0).toLocaleString()}</td>
            <td class="px-4 py-3 text-center">
                <button onclick="resetCard(${card.id})"
                    class="text-[10px] text-gray-400 hover:text-red-400 border border-gray-700 hover:border-red-400 px-2 py-1 rounded transition">
                    إعادة ضبط
                </button>
            </td>
        </tr>
    `).join('');
}

async function resetCard(id) {
    if (!confirm(`إعادة ضبط عدادات الكارت #${id}؟`)) return;
    try {
        await fetch(`/api/cards/${id}/reset`, { method: 'POST' });
        showToast(`تم إعادة ضبط كارت #${id}`);
        await loadCards();
    } catch {
        showToast('فشل إعادة الضبط', 'error');
    }
}

// ── Utility ───────────────────────────────────────────────
function escHtml(s) {
    return String(s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Init ──────────────────────────────────────────────────
boot();
