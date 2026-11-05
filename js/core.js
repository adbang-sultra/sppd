/* ============================================================
   INTI: utilitas, kriptografi, brankas data terenkripsi, penyimpanan,
   event delegation (pengganti onclick agar CSP tanpa 'unsafe-inline').
   ============================================================ */
'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const PS = 10;
const esc = s => String(s ?? '').replace(/[&<>"'`]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c]));
/* Bersihkan teks: buang karakter kontrol, batasi panjang */
const txt = (s, n = 300) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g, '').slice(0, n);
const rnd = n => crypto.getRandomValues(new Uint8Array(n));
const uid = () => Array.from(rnd(10), b => (b % 36).toString(36)).join('');
const okId = s => typeof s === 'string' && /^[a-z0-9]{4,40}$/.test(s);
const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const okDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : '';
const dt = s => s ? new Date(s + 'T00:00:00').toLocaleDateString('id-ID', {weekday:'long', day:'numeric', month:'long', year:'numeric'}) : '';
const dts = s => s ? new Date(s + 'T00:00:00').toLocaleDateString('id-ID', {day:'numeric', month:'long', year:'numeric'}) : '';
const lama = (a, b) => a && b ? Math.round((new Date(b) - new Date(a)) / 864e5) + 1 : 0;
const clamp = (v, a, b, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d; };
const hex = (c, d = '#14b8a6') => /^#[0-9a-f]{6}$/i.test(c || '') ? c.toLowerCase() : d;
const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);

/* ---------- Kriptografi (Web Crypto) ---------- */
const TE = new TextEncoder(), TD8 = new TextDecoder();
const b64 = buf => { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode.apply(null, a.subarray(i, i + 32768)); return btoa(s); };
const ub = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const newSalt = () => b64(rnd(16));
const ITER = 600000;            /* PBKDF2-SHA256, rekomendasi OWASP 2023 */
async function kdf(pw, salt, it = ITER) {
  const k = await crypto.subtle.importKey('raw', TE.encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', hash:'SHA-256', salt:ub(salt), iterations:it}, k, {name:'AES-GCM', length:256}, false, ['wrapKey','unwrapKey','encrypt','decrypt']);
}
/* hash versi lama (dipakai hanya untuk migrasi akun lama) */
async function legacyHash(pw, salt, it) {
  const k = await crypto.subtle.importKey('raw', TE.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt:ub(salt), iterations:it}, k, 256));
}
const sameH = (a, b) => { a = String(a); b = String(b); let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; };
const CSOK = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
const zip = async (u8, d) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(d ? new DecompressionStream('gzip') : new CompressionStream('gzip'))).arrayBuffer());
/* Enkripsi objek: JSON -> (gzip) -> AES-256-GCM. AAD = nama kunci, agar rekaman tidak bisa ditukar. */
async function seal(key, obj, aad) {
  const iv = rnd(12); let p = TE.encode(JSON.stringify(obj)), z = 0;
  if (CSOK && p.length > 400) { p = await zip(p); z = 1; }
  const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData:TE.encode(aad)}, key, p);
  return JSON.stringify({v:2, z, iv:b64(iv), ct:b64(ct)});
}
async function unseal(key, str, aad) {
  const o = JSON.parse(str);
  let p = new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM', iv:ub(o.iv), additionalData:TE.encode(aad)}, key, ub(o.ct)));
  if (o.z) p = await zip(p, 1);
  return JSON.parse(TD8.decode(p));
}
const newDEK = () => crypto.subtle.generateKey({name:'AES-GCM', length:256}, true, ['encrypt','decrypt']);
async function wrapDEK(dek, kek) { const iv = rnd(12); return {wiv:b64(iv), wk:b64(await crypto.subtle.wrapKey('raw', dek, kek, {name:'AES-GCM', iv}))}; }
const unwrapDEK = (o, kek) => crypto.subtle.unwrapKey('raw', ub(o.wk), kek, {name:'AES-GCM', iv:ub(o.wiv)}, {name:'AES-GCM', length:256}, true, ['encrypt','decrypt']);

/* ---------- Brankas & penyimpanan ---------- */
const DEF = {emp:[], prog:[], sppd:[], rep:[], log:[], cfg:{prov:'Sulawesi Tenggara', kab:'', kec:'', desa:'', instansi:'Sekretariat Daerah Provinsi Sulawesi Tenggara', alamat:'', telp:'', pejabat:'', nip:'', jabatan:'Sekretaris Daerah', ta:String(new Date().getFullYear()), prefix:'SPPD', logo:''}};
const KEYS = Object.keys(DEF);
const Vault = {key:null, xk:k => 'sppd_x_' + k, ready:() => !!localStorage.getItem('sppd_vault')};
const D = {}; KEYS.forEach(k => D[k] = structuredClone(DEF[k]));
const chain = {};
let BC = null; try { BC = new BroadcastChannel('sppd'); } catch {}
function persist(k) {
  if (!Vault.key) return Promise.resolve();
  if (Cloud.on) { if (k !== 'log') Cloud.queue(k); return Promise.resolve(); }   /* mode cloud: dikirim ke server */
  const key = Vault.key;
  chain[k] = (chain[k] || Promise.resolve()).then(async () => {
    localStorage.setItem(Vault.xk(k), await seal(key, D[k], k));
    BC?.postMessage({t:'data', k});
  }).catch(e => toast('Gagal menyimpan: ' + (e?.name === 'QuotaExceededError' ? 'penyimpanan browser penuh (kurangi foto/gambar latar)' : (e?.message || e)), 'err'));
  return chain[k];
}
const flush = () => Promise.all([...Object.values(chain), Cloud.on ? Cloud.flush() : null]);
const Store = {
  async read(k) { const s = localStorage.getItem(Vault.xk(k)); return s ? unseal(Vault.key, s, k) : null; },
  async loadAll() { for (const k of KEYS) { const v = await this.read(k); D[k] = v == null ? structuredClone(DEF[k]) : CLEAN[k](v); } },
  set(k, v) { if (!Auth.canWrite(k)) { toast('Akses ditolak untuk peran Anda', 'err'); return false; } D[k] = v; persist(k); return true; },
  wipeMemory() { KEYS.forEach(k => D[k] = structuredClone(DEF[k])); }
};
const save = k => Store.set(k, D[k]);
/* sinkron antar-tab */
BC && (BC.onmessage = async e => {
  const m = e.data || {};
  if (m.t === 'logout' && Auth.logged()) Auth.logout('Anda keluar di tab lain', true);
  if (m.t === 'data' && Cloud.on && Vault.key) { Cloud.pull().then(ch => { if (ch && !$('#mod').innerHTML) render(); }).catch(() => {}); return; }
  if (m.t === 'data' && Vault.key && KEYS.includes(m.k)) { try { const v = await Store.read(m.k); if (v) { D[m.k] = CLEAN[m.k](v); if (!$('#mod').innerHTML) render(); } } catch {} }
});

/* ---------- Pembersih data (dipakai saat memuat, impor & restore) ---------- */
const CLEAN = {};
const arr = (v, max = 20000) => Array.isArray(v) ? v.slice(0, max).filter(x => x && typeof x === 'object' && !Array.isArray(x)) : [];
const pick = (o, keys, n = 300) => { const r = {}; keys.forEach(k => r[k] = txt(own(o, k) ? o[k] : '', n)); return r; };

/* ---------- Event delegation ---------- */
const ACT = {}, PERM = {}, CH = {};
/* act(nama, fungsi, izin) : izin 'w' = operator ke atas, 'a' = administrator */
const act = (n, f, p) => { ACT[n] = f; if (p) PERM[n] = p; };
const onCh = (n, f, p) => { CH[n] = f; if (p) PERM['ch:' + n] = p; };
const allowed = n => !PERM[n] || Auth.can(PERM[n]);
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  const n = el.dataset.act, f = own(ACT, n) && ACT[n]; if (!f) return;
  e.preventDefault();
  if (!allowed(n)) return toast('Akses ditolak untuk peran Anda', 'err');
  f(el, e);
});
['change', 'input'].forEach(t => document.addEventListener(t, e => {
  const el = e.target.closest(t === 'change' ? '[data-ch]' : '[data-in]'); if (!el) return;
  const n = t === 'change' ? el.dataset.ch : el.dataset.in, f = own(CH, n) && CH[n]; if (!f) return;
  if (!allowed('ch:' + n)) { toast('Akses ditolak untuk peran Anda', 'err'); el.value = ''; return; }
  f(el, e);
}));

/* ---------- Komponen UI ---------- */
function toast(m, t) {
  const e = document.createElement('div'); e.className = 'tst ' + (t === 'err' ? 'bad' : 'ok');
  e.innerHTML = I(t === 'err' ? 'alert' : 'check') + '<span></span>'; e.lastChild.textContent = m;
  $('#toast').appendChild(e); requestAnimationFrame(() => e.classList.add('in'));
  setTimeout(() => { e.classList.remove('in'); setTimeout(() => e.remove(), 300); }, 3600);
}
let modalOk = null, lastFocus = null;
function modal(t, body, ok, wide, okLabel = 'Simpan') {
  lastFocus = document.activeElement;
  $('#mod').innerHTML = `<div class="ov" data-act="ovClose"><div class="dlg ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(t)}"><div class="dlg-h"><b>${t}</b><button class="ib" data-act="closeM" aria-label="Tutup">${I('x')}</button></div><div class="dlg-b">${body}</div><div class="dlg-f"><button class="btn2" data-act="closeM">Tutup</button>${ok ? `<button class="btn" id="mok" data-act="modalOk">${I('check')}${esc(okLabel)}</button>` : ''}</div></div></div>`;
  modalOk = ok || null; post($('#mod'));
  setTimeout(() => ($('#mod .dlg-b input:not([type=hidden]):not([readonly]),#mod .dlg-b select,#mod .dlg-b textarea') || $('#mod .dlg'))?.focus?.(), 60);
}
const closeM = () => { $('#mod').innerHTML = ''; modalOk = null; lastFocus?.focus?.(); };
act('closeM', closeM);
act('ovClose', (el, e) => { if (e.target === el) closeM(); });
act('modalOk', async () => { if (!modalOk) return; const b = $('#mok'); b.disabled = true; try { if (await modalOk()) closeM(); } finally { if (b.isConnected) b.disabled = false; } });
/* Dialog konfirmasi (pengganti confirm) */
function ask(msg, okLabel = 'Ya, lanjutkan', danger = true) {
  return new Promise(res => {
    const w = document.createElement('div'); w.className = 'ov ask';
    w.innerHTML = `<div class="dlg sm" role="alertdialog" aria-modal="true"><div class="dlg-b askb"><div class="ask-ic ${danger ? 'bad' : ''}">${I(danger ? 'alert' : 'info')}</div><p></p></div><div class="dlg-f"><button class="btn2" data-r="0">Batal</button><button class="${danger ? 'btnd' : 'btn'}" data-r="1"></button></div></div>`;
    w.querySelector('p').textContent = msg; w.querySelector('[data-r="1"]').textContent = okLabel;
    const done = v => { w.remove(); document.removeEventListener('keydown', k); res(v); };
    const k = e => { if (e.key === 'Escape') done(false); };
    w.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1'); else if (e.target === w) done(false); });
    document.addEventListener('keydown', k); document.body.appendChild(w); w.querySelector('[data-r="1"]').focus();
  });
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#mod').innerHTML && !document.querySelector('.ov.ask')) closeM();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && Auth.logged()) { e.preventDefault(); ACT.palette(); }
});

/* Tabel responsif: di layar kecil baris berubah menjadi kartu (memakai data-label) */
const table = (h, rows, cls = '') => `<div class="tblw ${cls}"><table class="tbl"><thead><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(r => `<tr>${r.map((c, i) => `<td data-label="${esc(String(h[i]).replace(/<[^>]*>/g, ''))}">${c}</td>`).join('')}</tr>`).join('') : `<tr class="empty"><td colspan="${h.length}">${I('folder', 'big')}<div>Belum ada data</div></td></tr>`}</tbody></table></div>`;
const badge = t => `<span class="badge ${t === 'Selesai' || t === 'Aktif' ? 'b-ok' : t === 'Draft' ? 'b-warn' : 'b-bad'}">${esc(t)}</span>`;
/* Tombol: b(label, aksi, {id,k,...}, kelas, ikon) */
const b = (label, a, data = {}, cls = 'btn2', ic = '') => `<button class="${cls}" data-act="${a}"${Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('')}>${ic ? I(ic) : ''}${label ? `<span>${label}</span>` : ''}</button>`;

/* Setelah render: isi ikon, lebar grafik, animasi angka (semua via CSSOM, aman untuk CSP) */
function post(root = document) {
  root.querySelectorAll('[data-ico]').forEach(e => { if (!e.firstChild) e.innerHTML = I(e.dataset.ico); });
  root.querySelectorAll('[data-w]').forEach(e => { const w = clamp(e.dataset.w, 0, 100, 0); requestAnimationFrame(() => requestAnimationFrame(() => e.style.setProperty('--w', w + '%'))); });
  root.querySelectorAll('[data-p]').forEach(e => e.style.setProperty('--p', clamp(e.dataset.p, 0, 100, 0)));
  root.querySelectorAll('[data-count]').forEach(e => {
    const n = clamp(e.dataset.count, 0, 1e12, 0), t0 = performance.now(), d = 900;
    if (matchMedia('(prefers-reduced-motion:reduce)').matches) { e.textContent = n.toLocaleString('id-ID'); return; }
    const f = t => { const k = Math.min(1, (t - t0) / d), v = Math.round(n * (1 - Math.pow(1 - k, 3))); e.textContent = v.toLocaleString('id-ID'); if (k < 1) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  root.querySelectorAll('img[data-src]').forEach(e => { const s = okSrc(e.dataset.src); if (s) e.src = s; });
}

/* ---------- Validasi & pemrosesan gambar ---------- */
const okSrc = s => /^(assets\/[\w\-./]+\.(svg|png|jpe?g|webp)|data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$/.test(s || '') && !/\.\./.test(s) ? s : '';
const okImg = s => /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s || '') ? s : '';
/* Periksa tanda tangan biner (magic bytes) — bukan hanya ekstensi/tipe MIME */
async function sniff(f) {
  const h = new Uint8Array(await f.slice(0, 12).arrayBuffer());
  if (h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47) return 'png';
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return 'jpeg';
  if (h[0] === 0x52 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x46 && h[8] === 0x57 && h[9] === 0x45 && h[10] === 0x42 && h[11] === 0x50) return 'webp';
  return '';
}
/* Gambar di-encode ulang lewat kanvas: membuang metadata/EXIF & muatan tersembunyi (polyglot). */
async function reencode(f, maxDim, type = 'image/jpeg', q = .82, maxIn = 8e6) {
  if (f.size > maxIn) throw new Error('Ukuran file melebihi ' + Math.round(maxIn / 1e6) + ' MB');
  if (!(await sniff(f))) throw new Error('File bukan gambar PNG/JPG/WebP yang valid');
  const u = URL.createObjectURL(f);
  try {
    const im = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('Gambar rusak / tidak dapat dibaca')); i.src = u; });
    const k = Math.min(1, maxDim / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL(type, q);
  } finally { URL.revokeObjectURL(u); }
}

/* ---------- Unduhan & CSV ---------- */
function dl(n, t, m = 'text/csv') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], {type:m + ';charset=utf-8'})); a.download = n.replace(/[^\w.\-]/g, '_'); a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 800); }
/* Anti CSV/Formula injection (OWASP): awalan = + - @ TAB CR diberi tanda kutip */
const toCSV = r => '﻿' + r.map(x => x.map(v => { let s = String(v ?? ''); if (/^[=+@\t\r]/.test(s) || /^-[^\d\s]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }).join(',')).join('\r\n');
function parseCSV(t) { const r = []; let row = [], c = '', q = false; for (let i = 0; i < t.length; i++) { const h = t[i]; if (q) { if (h === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += h; } else if (h === '"') q = true; else if (h === ',' || h === ';') { row.push(c); c = ''; } else if (h === '\n' || h === '\r') { if (h === '\r' && t[i + 1] === '\n') i++; row.push(c); r.push(row); row = []; c = ''; } else c += h; if (r.length > 10000) break; } if (c || row.length) { row.push(c); r.push(row); } return r.filter(x => x.some(y => y.trim())); }

/* Efek riak saat tombol ditekan */
document.addEventListener('pointerdown', e => {
  const t = e.target.closest('.btn,.btn2,.btnd'); if (!t || matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  const r = t.getBoundingClientRect(), s = Math.max(r.width, r.height), i = document.createElement('span');
  i.className = 'ripple'; i.style.width = i.style.height = s + 'px'; i.style.left = (e.clientX - r.left - s / 2) + 'px'; i.style.top = (e.clientY - r.top - s / 2) + 'px';
  t.appendChild(i); setTimeout(() => i.remove(), 650);
}, {passive:true});
