/* ============================================================
   SIM-SPPD — Asisten AI untuk Laporan Perjalanan Dinas  (Vercel Serverless Function)
   Dipanggil dari menu "Laporan Perjalanan" → tombol "Buat Isi Laporan dengan AI".

   Variabel lingkungan (Vercel → Project → Settings → Environment Variables):
     AI_API_KEY        (wajib)  kunci API penyedia AI — JANGAN taruh di js/config.js
     AI_PROVIDER       gemini (bawaan) | anthropic | groq | openai
     AI_MODEL          nama model; bila kosong dipakai nilai bawaan penyedia (periksa dokumentasi penyedia)
     AI_BASE_URL       (opsional) untuk penyedia lain yang kompatibel OpenAI
   Otorisasi (salah satu):
     SUPABASE_URL + SUPABASE_ANON_KEY  → mode cloud: sesi pengguna (admin/operator) diperiksa ke Supabase
     AI_ACCESS_CODE                    → mode lokal: kode akses yang diketik pengguna saat pertama memakai fitur ini
   Yang dikirim ke penyedia AI hanya teks yang diketik di formulir (maksud, tujuan, tanggal, hasil yang dicapai).
   Nama, NIP, dan data pribadi pegawai TIDAK dikirim.
   ============================================================ */
'use strict';
const crypto = require('crypto');
const DEFMODEL = {gemini:'gemini-2.5-flash', anthropic:'claude-haiku-5-5', groq:'llama-3.3-70b-versatile', openai:'gpt-4o-mini'};
const HITS = new Map();   // pembatas laju sederhana per alamat IP (per instans fungsi): 15 permintaan / 10 menit

const send = (res, code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(obj)); };
const cut = (v, n) => String(v == null ? '' : v).replace(/\u0000/g, '').trim().slice(0, n);
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

async function authorized(req) {
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_ANON_KEY;
  if (bearer && U && K && /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(U)) {
    try {
      const r = await fetch(U + '/rest/v1/rpc/sppd_me', {method:'POST', headers:{'Content-Type':'application/json', apikey:K, Authorization:'Bearer ' + K}, body:JSON.stringify({p_t:bearer}), signal:AbortSignal.timeout(8000)});
      if (r.ok) { const j = await r.json(); if (j && j.ok && j.user && ['admin', 'operator'].includes(j.user.role)) return true; }
    } catch { /* jatuh ke pemeriksaan kode akses */ }
  }
  const code = process.env.AI_ACCESS_CODE;
  return !!(code && req.headers['x-ai-code'] && same(req.headers['x-ai-code'], code));
}

const SYSTEM = `Anda adalah penyusun laporan perjalanan dinas pemerintah daerah di Indonesia. Tulis dalam Bahasa Indonesia baku yang formal, kalimat lengkap, tanpa markdown, tanpa tanda bintang, tanpa judul.
ATURAN KETAT: gunakan HANYA informasi yang diberikan pengguna. Jangan mengarang nama orang, angka, tanggal, nomor atau judul peraturan, nama instansi lain, maupun temuan yang tidak ada pada "hasil yang dicapai". Bila informasi kurang, tulis secara umum dan netral.
Keluarkan HANYA satu objek JSON valid dengan kunci berikut (semua nilai berupa string; pisahkan paragraf/butir dengan karakter baris baru \\n):
- "latar": Latar Belakang, 2 paragraf.
- "mt": Maksud dan Tujuan, 1 paragraf.
- "keg": Kegiatan yang dilaksanakan, 2–5 baris; tiap baris satu kegiatan tanpa nomor (rincian di bawahnya boleh diawali "- ").
- "kes": Kesimpulan, 3–5 butir, satu butir per baris, tanpa nomor dan tanpa tanda "-".
- "tl": Saran/tindak lanjut, 3–5 butir, satu butir per baris, tanpa nomor dan tanpa tanda "-".
- "penutup": Penutup, 1 paragraf singkat.`;

function userPrompt(c) {
  return `Data perjalanan dinas:
Instansi: ${c.instansi || '-'}
Maksud perjalanan: ${c.maksud || '-'}
Tujuan/lokasi: ${c.tujuan || '-'}${c.asal ? ' (berangkat dari ' + c.asal + ')' : ''}
Waktu: ${c.tb || '-'} s.d ${c.tk || '-'}
Jumlah petugas: ${c.orang || 1} orang

Hasil yang dicapai (ditulis oleh petugas):
"""
${c.hasil}
"""

Susun isi laporan berdasarkan data di atas.`;
}

async function llm(system, user) {
  const prov = String(process.env.AI_PROVIDER || 'gemini').toLowerCase(), key = process.env.AI_API_KEY, model = process.env.AI_MODEL || DEFMODEL[prov] || DEFMODEL.openai;
  if (!key) { const e = new Error('Layanan AI belum dikonfigurasi di server (AI_API_KEY belum diisi).'); e.code = 503; throw e; }
  const sig = AbortSignal.timeout(40000);
  let r, j, text;
  if (prov === 'anthropic') {
    r = await fetch('https://api.anthropic.com/v1/messages', {method:'POST', signal:sig, headers:{'Content-Type':'application/json', 'x-api-key':key, 'anthropic-version':'2023-06-01'}, body:JSON.stringify({model, max_tokens:3000, temperature:.4, system, messages:[{role:'user', content:user}]})});
    j = await r.json(); text = j?.content?.map(x => x.text || '').join('');
  } else if (prov === 'gemini') {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {method:'POST', signal:sig, headers:{'Content-Type':'application/json', 'x-goog-api-key':key}, body:JSON.stringify({systemInstruction:{parts:[{text:system}]}, contents:[{role:'user', parts:[{text:user}]}], generationConfig:{temperature:.4, responseMimeType:'application/json'}})});
    j = await r.json(); text = j?.candidates?.[0]?.content?.parts?.map(x => x.text || '').join('');
  } else {
    const base = String(process.env.AI_BASE_URL || (prov === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1')).replace(/\/+$/, '');
    r = await fetch(base + '/chat/completions', {method:'POST', signal:sig, headers:{'Content-Type':'application/json', Authorization:'Bearer ' + key}, body:JSON.stringify({model, temperature:.4, response_format:{type:'json_object'}, messages:[{role:'system', content:system}, {role:'user', content:user}]})});
    j = await r.json(); text = j?.choices?.[0]?.message?.content;
  }
  if (!r.ok || !text) { const e = new Error('Penyedia AI menolak/gagal merespons' + (j?.error?.message ? ': ' + String(j.error.message).slice(0, 160) : ' (kode ' + r.status + ')')); e.code = 502; throw e; }
  return text;
}

const FIELDS = {latar:2500, mt:1500, keg:2000, kes:1800, tl:1800, penutup:600};
function parse(text) {
  const t = String(text).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim(), m = t.match(/\{[\s\S]*\}/);
  const o = JSON.parse(m ? m[0] : t), out = {};
  for (const [k, n] of Object.entries(FIELDS)) { let v = o[k]; if (Array.isArray(v)) v = v.join('\n'); out[k] = cut(v, n).replace(/\*\*/g, '').replace(/\r/g, ''); }
  return out;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, {ok:false, error:'Metode tidak diizinkan'});
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim(), now = Date.now(), h = (HITS.get(ip) || []).filter(t => now - t < 6e5);
  if (h.length >= 15) return send(res, 429, {ok:false, error:'Terlalu banyak permintaan, coba lagi beberapa menit lagi.'});
  h.push(now); HITS.set(ip, h); if (HITS.size > 500) HITS.clear();
  if (!(await authorized(req))) return send(res, 401, {ok:false, error:'Tidak berwenang. Masuk sebagai Admin/Operator, atau isi kode akses AI.', needCode:!!process.env.AI_ACCESS_CODE});
  let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = null; } }
  const c = b && b.kind === 'laporan' && b.ctx && typeof b.ctx === 'object' ? b.ctx : null;
  if (!c) return send(res, 400, {ok:false, error:'Permintaan tidak valid'});
  const ctx = {instansi:cut(c.instansi, 200), maksud:cut(c.maksud, 600), tujuan:cut(c.tujuan, 200), asal:cut(c.asal, 100), tb:cut(c.tb, 40), tk:cut(c.tk, 40), orang:Math.min(99, Math.max(1, +c.orang || 1)), hasil:cut(c.hasil, 6000)};
  if (ctx.hasil.length < 30) return send(res, 400, {ok:false, error:'Isi "Hasil yang Dicapai" terlebih dahulu.'});
  try { return send(res, 200, {ok:true, data:parse(await llm(SYSTEM, userPrompt(ctx)))}); }
  catch (e) { return send(res, e.code || 502, {ok:false, error:e.code ? e.message : 'Jawaban AI tidak dapat dibaca, coba lagi.'}); }
};
