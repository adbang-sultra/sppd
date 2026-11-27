/* ============================================================
   ASISTEN AI  (v1.4.0)
   1) Pengaturan → Model AI  : Administrator menambah / mengubah / menghapus / menguji model AI
                               (penyedia, ID model, kunci API). Disimpan terenkripsi di D.cfg.ai.
   2) Laporan Perjalanan     : tiap bagian punya kotak ARAHAN (prompt) sendiri → AI menyusun isi bagian itu →
                               hasil masuk ke kolom biasa sehingga bisa diedit, direvisi, atau diurungkan.
   Semua panggilan lewat /api/ai (api/ai.js). Browser tidak pernah menghubungi penyedia AI langsung (CSP).
   ============================================================ */
'use strict';

/* ---------- Penyedia & bagian laporan ---------- */
const AIPROV = {
  gemini:     {n:'Google Gemini', m:['gemini-2.5-flash', 'gemini-2.5-pro'], h:'Kunci dibuat di Google AI Studio.'},
  anthropic:  {n:'Anthropic (Claude)', m:['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'], h:'Kunci dibuat di console.anthropic.com.'},
  openai:     {n:'OpenAI', m:['gpt-4o-mini', 'gpt-4o'], h:'Kunci dibuat di platform.openai.com.'},
  groq:       {n:'Groq', m:['llama-3.3-70b-versatile'], h:'Kunci dibuat di console.groq.com.'},
  openrouter: {n:'OpenRouter', m:['openai/gpt-4o-mini', 'google/gemini-2.5-flash'], h:'Kunci dibuat di openrouter.ai. ID model berbentuk penyedia/nama-model.'},
  custom:     {n:'Kompatibel OpenAI (alamat sendiri)', m:[], h:'Untuk layanan lain yang meniru API OpenAI (/chat/completions). Isi Alamat dasar, mis. https://api.contoh.id/v1.'}
};
/* bagian laporan yang bisa dibuat AI: k = id kolom (#l_<k>), ph = contoh arahan, warn = pengingat setelah hasil dibuat */
const AIS = [
  {k:'latar',   l:'Latar Belakang',              ph:'Arahan (opsional), mis. tekankan perlunya koordinasi pembangunan dengan pemerintah kabupaten'},
  {k:'dasar',   l:'Dasar Hukum',                 ph:'Sebutkan peraturan yang ingin dimuat, mis. UU 23/2014 tentang Pemerintahan Daerah; Permendagri 77/2020', warn:'Periksa nomor, tahun, dan judul peraturan sebelum disimpan.'},
  {k:'mt',      l:'Maksud dan Tujuan',           ph:'Arahan (opsional), mis. fokus pada sinkronisasi data realisasi anggaran'},
  {k:'wkt',     l:'Waktu Pelaksanaan',           ph:'Arahan (opsional), mis. sebutkan lama perjalanan'},
  {k:'keg',     l:'Kegiatan yang Dilaksanakan',  ph:'Tulis kegiatannya, mis. berangkat, rapat koordinasi dengan Bappeda, dokumentasi, kembali'},
  {k:'hasil',   l:'Hasil yang Dicapai',          ph:'Tulis poin hasilnya — AI hanya merapikan, tidak menambah temuan'},
  {k:'kes',     l:'Kesimpulan',                  ph:'Arahan (opsional), mis. tekankan perlunya percepatan penyerapan anggaran'},
  {k:'tl',      l:'Saran',                       ph:'Arahan (opsional), mis. usulkan rapat evaluasi bulanan'},
  {k:'penutup', l:'Penutup',                     ph:'Arahan (opsional), mis. nada formal dan singkat'}
];
const AIALL = ['latar', 'mt', 'keg', 'kes', 'tl', 'penutup'];       // bagian yang diisi tombol "Buat Semua Bagian"

/* ---------- Pembersih data (dipakai CLEAN.cfg & CLEAN.rep di app.js) ---------- */
const okBase = u => { u = String(u || '').trim().replace(/\/+$/, ''); return u.length <= 200 && /^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{2,5})?(\/[\w.\-/]*)?$/i.test(u) ? u : ''; };
const cleanAI = v => {
  v = v && typeof v === 'object' ? v : {};
  const models = arr(v.models, 12).map(m => ({id:withId(m), nama:txt(m.nama, 60).trim(), prov:own(AIPROV, m.prov) ? m.prov : 'gemini', model:txt(m.model, 120).trim(), key:txt(m.key, 300).replace(/\s+/g, ''), base:okBase(m.base), temp:m.temp === '' || m.temp == null || !Number.isFinite(+m.temp) ? '' : clamp(m.temp, 0, 1, ''), on:m.on !== false})).filter(m => m.nama && m.model);
  return {models, def:models.some(m => m.id === v.def) ? v.def : ''};
};
const cleanAP = o => { const r = {}; if (o && typeof o === 'object') for (const s of AIS) if (own(o, s.k)) { const v = txt(o[s.k], 1500).trim(); if (v) r[s.k] = v; } return r; };

/* restore dari backup: backup biasa tidak memuat kunci API & backup lama tidak memuat model → jangan hilangkan yang sedang dipakai */
const aiMergeRestore = (cfgNew, curAI) => {
  if (!cfgNew || !curAI || !Array.isArray(curAI.models)) return;
  if (!cfgNew.ai) { cfgNew.ai = curAI; return; }
  const cur = new Map(curAI.models.map(m => [m.id, m.key]));
  cfgNew.ai.models.forEach(m => { if (!m.key && cur.get(m.id)) m.key = cur.get(m.id); });
};
const aiCfg = () => D.cfg.ai && Array.isArray(D.cfg.ai.models) ? D.cfg.ai : {models:[], def:''};
const aiEnsure = () => { if (!D.cfg.ai || !Array.isArray(D.cfg.ai.models)) D.cfg.ai = {models:[], def:''}; return D.cfg.ai; };
const aiWire = m => ({prov:m.prov, model:m.model, key:m.key, base:m.base, temp:m.temp});
/* model yang dipakai Laporan: pilihan pengguna → bawaan → model aktif pertama; tanpa model di panel = konfigurasi server */
function aiPick() {
  const A = aiCfg(), on = A.models.filter(m => m.on); if (!on.length) return null;
  return aiWire(on.find(x => x.id === ST.lap.model) || on.find(x => x.id === A.def) || on[0]);
}

/* ---------- Panggilan ke /api/ai ---------- */
async function aiCall(body) {
  const code = (() => { try { return sessionStorage.getItem('sppd_aicode') || ''; } catch { return ''; } })();
  let r;
  try { r = await fetch('/api/ai', {method:'POST', headers:{'Content-Type':'application/json', ...(Cloud.on && Cloud.token ? {Authorization:'Bearer ' + Cloud.token} : {}), ...(code ? {'x-ai-code':code} : {})}, body:JSON.stringify(body)}); }
  catch { throw new Error('Tidak dapat menghubungi server. Periksa koneksi internet.'); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && j.needCode) throw Object.assign(new Error(j.error || 'Masukkan kode akses AI dari administrator.'), {code:'code'});
  if (!r.ok || !j.ok) throw new Error(j.error || 'Layanan AI tidak tersedia (kode ' + r.status + ')');
  return j;
}
/* mode lokal: server meminta kode akses (AI_ACCESS_CODE) — tanyakan sekali, simpan selama sesi tab */
function aiAskCode(msg) {
  return new Promise(res => {
    let sent = false;
    modal('Kode akses AI', `<p class="muted sm mb-2">${esc(msg || 'Masukkan kode akses AI dari administrator.')}</p><label class="fld"><span>Kode akses</span><input id="ai_c" type="password" class="in" maxlength="100" autocomplete="off"></label>`, async () => { const c = $('#ai_c').value.trim(); if (!c) return false; sent = true; res(c); return true; }, false, 'Lanjut');
    const iv = setInterval(() => { if (!$('#mod').innerHTML) { clearInterval(iv); if (!sent) res(null); } }, 300);
  });
}
async function aiExec(run, retry) {
  try { return await run(); }
  catch (e) {
    if (e.code !== 'code' || retry) throw e;
    const c = await aiAskCode(e.message);
    if (!c) throw Object.assign(new Error('Dibatalkan.'), {quiet:true});
    try { sessionStorage.setItem('sppd_aicode', c); } catch { /* penyimpanan sesi dinonaktifkan */ }
    return aiExec(run, true);
  }
}

/* ============================================================
   1) PENGATURAN → MODEL AI  (Administrator)
   ============================================================ */
const aiMask = m => m.key ? '••••' + esc(m.key.slice(-4)) : '<span class="muted">kunci server</span>';
pages.ai = () => {
  const A = aiCfg();
  const rows = A.models.map(m => [
    `<b>${esc(m.nama)}</b>${A.def === m.id ? ' <span class="chip">Bawaan</span>' : ''}`,
    esc(AIPROV[m.prov].n),
    `<code>${esc(m.model)}</code>`,
    aiMask(m),
    m.on ? badge('Aktif') : '<span class="badge b-warn">Nonaktif</span>',
    rowAct([iBtn('aiTest', {id:m.id}, 'zap', 'Uji koneksi'), m.on && A.def !== m.id ? iBtn('aiDef', {id:m.id}, 'star', 'Jadikan bawaan') : '', iBtn('aiEdit', {id:m.id}, 'edit', 'Ubah'), iBtn('aiDel', {id:m.id}, 'trash', 'Hapus', 'ib sm danger')])
  ]);
  return `<div class="card">${cardH('Model AI', 'sparkles', `<div class="stack"><span class="chip">${A.models.length} model</span>${b('Tambah Model', 'aiAdd', {}, 'btn', 'plus')}</div>`)}
  <div class="info mb-3">${I('info')}<span>Tambahkan model AI yang boleh dipakai di menu <b>Laporan Perjalanan</b>. Model berstatus <b>Aktif</b> muncul sebagai pilihan di halaman laporan; model <b>Bawaan</b> dipilih otomatis. Fitur AI berjalan lewat fungsi server <code>/api/ai</code>, jadi hanya tersedia bila aplikasi dipasang di Vercel. ${A.models.length ? '' : 'Selama belum ada model di sini, aplikasi memakai konfigurasi server (variabel lingkungan <code>AI_API_KEY</code> di Vercel) bila ada.'}</span></div>
  ${table(['Nama', 'Penyedia', 'ID Model', 'Kunci API', 'Status', ''], rows)}</div>
  <div class="card">${cardH('Keamanan kunci API', 'shield')}<div class="warn">${I('alert')}<span>Kunci API disimpan <b>terenkripsi bersama data aplikasi</b> (tidak ada di kode maupun GitHub) dan hanya <b>Administrator</b> yang dapat melihat/mengubahnya di sini. Namun akun yang bisa masuk memegang kunci data sesuai perannya, sehingga pengguna yang paham teknis secara prinsip dapat membacanya. Karena itu gunakan <b>kunci khusus aplikasi ini</b> dengan batas kuota/anggaran di sisi penyedia, dan ganti bila ada pengguna yang keluar.</span></div>
  <p class="muted sm">Alternatif yang lebih tertutup: kosongkan kolom kunci lalu simpan kuncinya di server (Vercel → Environment Variables → <code>AI_API_KEY_GEMINI</code>, <code>AI_API_KEY_ANTHROPIC</code>, <code>AI_API_KEY_OPENAI</code>, <code>AI_API_KEY_GROQ</code>, atau <code>AI_API_KEY_OPENROUTER</code>). Teks yang dikirim ke penyedia hanya data maksud, tujuan, tanggal, serta teks isian laporan dan arahan yang diketik; nama/NIP pegawai tidak dikirim. Hasil AI wajib diperiksa manusia.</p></div>`;
};
const aiModelOpts = (p, v) => `<datalist id="ai_ml">${AIPROV[p].m.map(m => `<option value="${esc(m)}"></option>`).join('')}</datalist>`;
function aiForm(m) {
  const nw = !m; m = m || {prov:'gemini', model:AIPROV.gemini.m[0], nama:'', key:'', base:'', temp:'', on:true};
  const P = AIPROV[m.prov];
  modal(nw ? 'Tambah Model AI' : 'Ubah Model AI', `<div class="fgrid g2">
   <label class="fld"><span>Nama tampilan</span><input id="ai_n" class="in" maxlength="60" value="${esc(m.nama)}" placeholder="Mis. Gemini Flash (cepat)" autocomplete="off"></label>
   <label class="fld"><span>Penyedia</span><select id="ai_pv" class="in" data-ch="aiProv">${Object.entries(AIPROV).map(([k, v]) => `<option value="${k}" ${k === m.prov ? 'selected' : ''}>${esc(v.n)}</option>`).join('')}</select></label>
   <label class="fld"><span>ID model</span><input id="ai_m" class="in" maxlength="120" list="ai_ml" value="${esc(m.model)}" placeholder="Salin persis dari dokumentasi penyedia" autocomplete="off" spellcheck="false" data-in="aiMTouch" ${nw ? 'data-auto="1"' : ''}></label>
   <label class="fld"><span>Kunci API</span><input id="ai_k" type="password" class="in" maxlength="300" autocomplete="new-password" spellcheck="false" placeholder="${m.key ? 'Tersimpan (••••' + esc(m.key.slice(-4)) + ') — kosongkan untuk tetap memakainya' : 'Tempel kunci API (kosong = pakai kunci server)'}"></label>
   <label class="fld" id="ai_bw" ${m.prov === 'custom' ? '' : 'hidden'}><span>Alamat dasar (Base URL)</span><input id="ai_b" class="in" maxlength="200" value="${esc(m.base)}" placeholder="https://api.contoh.id/v1" autocomplete="off" spellcheck="false"></label>
   <label class="fld"><span>Kreativitas (temperature)</span><select id="ai_t" class="in">${[['', 'Bawaan penyedia'], ['0.2', 'Rendah (0,2) — lebih baku'], ['0.5', 'Sedang (0,5)'], ['0.8', 'Tinggi (0,8) — lebih bervariasi']].map(([v, l]) => `<option value="${v}" ${String(m.temp) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
   <label class="fld"><span>Status</span><select id="ai_on" class="in"><option value="1" ${m.on ? 'selected' : ''}>Aktif (muncul di pilihan halaman Laporan)</option><option value="0" ${m.on ? '' : 'selected'}>Nonaktif</option></select></label>
   ${!nw && m.key ? `<label class="fld"><span>Kunci tersimpan</span><select id="ai_dk" class="in"><option value="0">Pertahankan (••••${esc(m.key.slice(-4))})</option><option value="1">Hapus — pakai kunci server</option></select></label>` : ''}
  </div>${aiModelOpts(m.prov)}
  <p class="muted sm mt-3" id="ai_ph">${esc(P.h)} ID model yang tersedia berbeda-beda per akun; periksa dokumentasi penyedia.</p>`,
  async () => {
    const A = aiEnsure(), old = nw ? null : A.models.find(x => x.id === m.id);
    const nama = txt($('#ai_n').value, 60).trim(), prov = $('#ai_pv').value, model = txt($('#ai_m').value, 120).trim(), base = prov === 'custom' ? okBase($('#ai_b').value) : '', t = $('#ai_t').value;
    if (!nama) { toast('Nama tampilan wajib diisi', 'err'); return false; }
    if (!own(AIPROV, prov)) { toast('Pilih penyedia', 'err'); return false; }
    if (!/^[\w.:\-/@+]{1,120}$/.test(model)) { toast('ID model wajib diisi (huruf, angka, titik, titik dua, garis, garis miring)', 'err'); return false; }
    if (prov === 'custom' && !base) { toast('Alamat dasar wajib berawalan https:// untuk penyedia kompatibel OpenAI', 'err'); return false; }
    let key = txt($('#ai_k').value, 300).replace(/\s+/g, ''); if (!key && old && $('#ai_dk')?.value !== '1') key = old.key;
    if (A.models.some(x => x.id !== (old && old.id) && x.nama.toLowerCase() === nama.toLowerCase())) { toast('Nama tampilan sudah dipakai model lain', 'err'); return false; }
    if (!old && A.models.length >= 12) { toast('Maksimal 12 model', 'err'); return false; }
    const rec = {id:old ? old.id : uid(), nama, prov, model, key, base, temp:t === '' ? '' : +t, on:$('#ai_on').value === '1'};
    A.models = old ? A.models.map(x => x.id === old.id ? rec : x) : [...A.models, rec];
    if (!A.models.some(x => x.id === A.def && x.on)) A.def = (A.models.find(x => x.on) || {}).id || '';
    if (!save('cfg')) return false;
    log('Model AI ' + (old ? 'diubah' : 'ditambah') + ': ' + nama); toast('Model AI disimpan' + (key ? '' : ' (memakai kunci server)')); render(); return true;
  }, true);
}
onCh('aiProv', el => {
  const P = AIPROV[el.value]; if (!P) return;
  const dl = $('#ai_ml'); if (dl) dl.outerHTML = aiModelOpts(el.value);
  const bw = $('#ai_bw'); if (bw) bw.hidden = el.value !== 'custom';
  const h = $('#ai_ph'); if (h) h.textContent = P.h + ' ID model yang tersedia berbeda-beda per akun; periksa dokumentasi penyedia.';
  const m = $('#ai_m'); if (m && (!m.value || m.dataset.auto === '1')) { m.value = P.m[0] || ''; m.dataset.auto = '1'; }
}, 'a');
onCh('aiMTouch', el => { delete el.dataset.auto; }, 'a');
act('aiAdd', () => aiForm(null), 'a');
act('aiEdit', el => { const m = aiCfg().models.find(x => x.id === el.dataset.id); if (m) aiForm(m); }, 'a');
act('aiDef', el => { const A = aiCfg(), m = A.models.find(x => x.id === el.dataset.id); if (!m || !m.on) return; A.def = m.id; if (save('cfg')) { log('Model AI bawaan: ' + m.nama); toast(m.nama + ' dijadikan bawaan'); render(); } }, 'a');
act('aiDel', async el => {
  const A = aiCfg(), m = A.models.find(x => x.id === el.dataset.id); if (!m) return;
  if (!(await ask(`Hapus model "${m.nama}"? Kunci API yang tersimpan ikut terhapus.`, 'Hapus'))) return;
  A.models = A.models.filter(x => x.id !== m.id); if (A.def === m.id) A.def = (A.models.find(x => x.on) || {}).id || '';
  if (save('cfg')) { log('Model AI dihapus: ' + m.nama); toast('Model dihapus'); render(); }
}, 'a');
act('aiTest', async el => {
  const m = aiCfg().models.find(x => x.id === el.dataset.id); if (!m || el.disabled) return;
  el.disabled = true; toast('Menguji ' + m.nama + '…');
  try { const j = await aiExec(() => aiCall({kind:'tes', model:aiWire(m)})); toast(m.nama + ': terhubung (' + (j.ms / 1000).toFixed(1).replace('.', ',') + ' dtk)'); }
  catch (e) { if (!e.quiet) toast(m.nama + ': ' + (e.message || 'gagal'), 'err'); }
  finally { if (el.isConnected) el.disabled = false; }
}, 'a');

/* ============================================================
   2) LAPORAN PERJALANAN — prompt per bagian
   ============================================================ */
const AIB = new Set(), AIUNDO = new Map();      // bagian yang sedang diproses ('*' = semua) · isi sebelum hasil AI (untuk Urungkan)
const aiUndoSync = () => $$('[data-act="aiUndo"]').forEach(x => { x.hidden = !AIUNDO.has(x.dataset.k); });

/* kotak arahan di bawah kolom bagian (dipanggil dari pages.lap) */
const aiBlock = (S, v) => `<div class="aisec"><div class="aisec-r"><input id="ai_p_${S.k}" class="in sm" maxlength="1500" placeholder="${esc(S.ph)}" value="${esc(v)}" aria-label="Arahan (prompt) AI untuk ${esc(S.l)}" autocomplete="off" data-aip="${S.k}">${b('Buat', 'aiGen', {k:S.k, m:'baru'}, 'btn2', 'sparkles')}${b('Revisi', 'aiGen', {k:S.k, m:'revisi'}, 'btn2', 'edit')}<button class="ib sm" data-act="aiUndo" data-k="${S.k}" title="Urungkan hasil AI (kembalikan isi sebelumnya)" aria-label="Urungkan hasil AI"${AIUNDO.has(S.k) ? '' : ' hidden'}>${I('refresh')}</button></div><div class="muted sm aisec-s" id="ai_s_${S.k}" role="status"></div></div>`;

/* kotak "Asisten AI": pilihan model + Buat Semua Bagian */
function aiBar() {
  const A = aiCfg(), on = A.models.filter(m => m.on), sid = (on.find(x => x.id === ST.lap.model) || on.find(x => x.id === A.def) || on[0] || {}).id;
  return `<div class="col-span-full aibox"><div class="aib-h">${I('sparkles')}<b>Asisten AI</b></div>
  <p class="muted sm">Setiap bagian laporan punya kotak <b>arahan (prompt)</b> sendiri: tulis apa yang diinginkan, klik <b>Buat</b>, lalu edit hasilnya langsung di kolomnya. <b>Revisi</b> memperbaiki teks yang sudah ada sesuai arahan, dan tombol <b>↻</b> mengembalikan isi sebelumnya. Kotak arahan boleh dikosongkan — AI menyusun dari data perjalanan. Periksa kembali hasilnya; AI bisa keliru. Yang dikirim hanya data maksud, tujuan, tanggal, serta teks isian laporan dan arahan; nama/NIP pegawai tidak dikirim.</p>
  <div class="stack mt-2 aibar">
   ${on.length ? `<label class="fld ai-model"><span>Model AI</span><select id="ai_model" class="in sm" data-ch="aiModel" aria-label="Model AI">${on.map(m => `<option value="${esc(m.id)}" ${m.id === sid ? 'selected' : ''}>${esc(m.nama)}</option>`).join('')}</select></label>` : '<span class="chip" title="Belum ada model aktif di Pengaturan → Model AI">Model: bawaan server</span>'}
   ${b('Buat Semua Bagian', 'aiLap', {}, 'btn', 'sparkles')}
   <label class="chk"><input type="checkbox" id="ai_over"><span>Timpa isian yang sudah ada</span></label>
   <span class="muted sm" id="ai_st" role="status"></span>
  </div>
  ${isA() ? `<div class="mt-2">${b('Kelola model AI', 'go', {r:'ai'}, 'btn2', 'settings')}</div>` : ''}</div>`;
}
onCh('aiModel', el => { ST.lap.model = el.value; }, 'w');

/* data perjalanan yang dikirim sebagai bahan; teks bagian itu sendiri tidak ikut (dikirim terpisah pada mode revisi) */
const aiCtx = (s, k) => { const v = id => id === k ? '' : ($('#l_' + id)?.value || '').trim(); return {instansi:D.cfg.instansi, maksud:maksud1(s), tujuan:s.tujuan, asal:s.asal, tb:dts(s.tb), tk:dts(s.tk), orang:orang(s).length, hasil:v('hasil'), keg:v('keg'), latar:v('latar'), dasar:v('dasar')}; };
const aiNote = (e, s) => { if (e) e.textContent = s; };
/* arahan (prompt) tiap bagian ikut tersimpan bersama laporan agar bisa dipakai/diubah lagi */
const aiPrompts = () => { const o = {}; for (const S of AIS) { const e = $('#ai_p_' + S.k), v = e ? e.value.trim() : ''; if (v) o[S.k] = txt(v, 1500); } return o; };

async function aiGenRun(k, mode) {
  const S = AIS.find(x => x.k === k), ta = S && $('#l_' + k); if (!ta || !canW() || AIB.has('*') || AIB.has(k)) return;
  const s = D.sppd.find(x => x.id === ST.lap.id); if (!s) return toast('Pilih SPPD', 'err');
  const pr = ($('#ai_p_' + k)?.value || '').trim(), cur = ta.value.trim(), rev = mode === 'revisi';
  if (rev && !cur) return toast('Kolom masih kosong — gunakan tombol Buat', 'err');
  if (rev && !pr) return toast('Tulis arahan revisi di kotak prompt, mis. "persingkat" atau "tambahkan koordinasi dengan Bappeda"', 'err');
  const sid = s.id, btns = () => $$(`[data-act="aiGen"][data-k="${k}"]`);
  AIB.add(k); btns().forEach(x => { x.disabled = true; }); aiNote($('#ai_s_' + k), 'AI sedang menyusun… (sekitar 5–30 detik)');
  try {
    const j = await aiExec(() => aiCall({kind:'bagian', sec:k, mode:rev ? 'revisi' : 'baru', prompt:pr, cur:rev ? cur : '', ctx:aiCtx(s, k), model:aiPick()}));
    const el = $('#l_' + k), v = String(j.text || '').trim();
    if (!el || ST.lap.id !== sid) { toast('Hasil AI untuk ' + S.l + ' dibuang karena Anda pindah laporan', 'err'); return; }
    if (!v) throw new Error('AI tidak menghasilkan teks, coba lagi dengan arahan lain.');
    AIUNDO.set(k, el.value); el.value = v; el.dataset.dirty = '1'; aiUndoSync();
    aiNote($('#ai_s_' + k), 'Selesai — periksa & edit di kolom di atas, lalu Simpan. ' + (S.warn || ''));
    toast(S.l + ' dibuat AI — periksa dan edit sebelum disimpan');
  } catch (e) { aiNote($('#ai_s_' + k), ''); if (!e.quiet) toast(e.message || 'Gagal menghubungi AI', 'err'); }
  finally { AIB.delete(k); btns().forEach(x => { x.disabled = false; }); }
}
act('aiGen', el => aiGenRun(el.dataset.k, el.dataset.m), 'w');
document.addEventListener('keydown', e => { const t = e.target; if (e.key === 'Enter' && !e.isComposing && t && t.matches && t.matches('input[data-aip]')) { e.preventDefault(); if (canW()) aiGenRun(t.dataset.aip, 'baru'); } });
act('aiUndo', el => {
  const k = el.dataset.k, t = $('#l_' + k); if (!t || !AIUNDO.has(k)) return;
  t.value = AIUNDO.get(k); t.dataset.dirty = '1'; AIUNDO.delete(k); el.hidden = true; aiNote($('#ai_s_' + k), 'Isi sebelumnya dikembalikan.');
}, 'w');

/* "Buat Semua Bagian": satu permintaan, mengisi Latar Belakang, Maksud, Kegiatan, Kesimpulan, Saran, Penutup */
async function aiAllRun() {
  if (AIB.size) return; const s = D.sppd.find(x => x.id === ST.lap.id), el = $('#l_hasil'); if (!s || !el) return;
  const hasil = el.value.trim(); if (hasil.length < 30) return toast('Isi "Hasil yang Dicapai" dulu (beberapa kalimat), lalu klik Buat Semua Bagian', 'err');
  const st = $('#ai_st'), btn = $('[data-act="aiLap"]'), over = !!$('#ai_over')?.checked, sid = s.id, hints = {};
  for (const k of AIALL) { const v = ($('#ai_p_' + k)?.value || '').trim(); if (v) hints[k] = v; }
  AIB.add('*'); if (btn) btn.disabled = true; aiNote(st, 'AI sedang menyusun… (sekitar 10–40 detik)');
  try {
    const j = await aiExec(() => aiCall({kind:'laporan', ctx:{...aiCtx(s, ''), hasil, hints}, model:aiPick()}));
    if (ST.lap.id !== sid) { toast('Hasil AI dibuang karena Anda pindah laporan', 'err'); return; }
    let n = 0; for (const k of AIALL) { const e = $('#l_' + k), v = String(j.data?.[k] || '').trim(); if (e && v && (over || !e.value.trim())) { AIUNDO.set(k, e.value); e.value = v; e.dataset.dirty = '1'; n++; } }
    aiUndoSync();
    aiNote($('#ai_st'), n ? n + ' bagian terisi — silakan periksa & edit, lalu Simpan.' : 'Semua bagian sudah terisi (centang "Timpa" untuk mengganti).');
    toast(n ? 'Isi laporan dibuat AI — periksa dan edit sebelum disimpan' : 'Tidak ada bagian kosong untuk diisi');
  } catch (e) { aiNote($('#ai_st'), ''); if (!e.quiet) toast(e.message || 'Gagal menghubungi AI', 'err'); }
  finally { AIB.delete('*'); const b2 = $('[data-act="aiLap"]'); if (b2) b2.disabled = false; }
}
act('aiLap', () => aiAllRun(), 'w');
