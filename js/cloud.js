/* ============================================================
   PENYIMPANAN CLOUD (Supabase) — data bisa dibuka lintas peramban/perangkat.
   - Aktif bila SYNC.url & SYNC.anonKey diisi di js/config.js.
   - Enkripsi ujung-ke-ujung: setiap item dienkripsi AES-256-GCM di browser;
     server hanya menyimpan ciphertext.
   - Sinkron per item (pegawai, program, SPPD, laporan) → beberapa pengguna
     dapat bekerja bersamaan tanpa saling menimpa seluruh data.
   - Cache terenkripsi di IndexedDB → cepat & tetap bisa dibaca saat sinyal putus;
     perubahan saat offline diantrikan dan dikirim otomatis ketika online.
   ============================================================ */
'use strict';
const Cloud = (() => {
  const C = (typeof SYNC === 'object' && SYNC) || {};
  const url = String(C.url || '').replace(/\/+$/, '');
  const on = (/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || (C.dev === true && /^http:\/\/localhost:\d+$/.test(url))) && /^[\w.-]{20,}$/.test(C.anonKey || '');
  let TOK = null, ME = null, VER = 0, ready = null, last = 0, state = 'idle', errMsg = '', timer = 0;
  const snap = new Map(), dirty = new Set(), Q = new Set(), logB = new Map(), logDirty = new Set();

  /* ---------- RPC ---------- */
  async function rpc(fn, args = {}) {
    let r;
    try { r = await fetch(url + '/rest/v1/rpc/' + fn, {method:'POST', headers:{apikey:C.anonKey, Authorization:'Bearer ' + C.anonKey, 'Content-Type':'application/json', Accept:'application/json'}, body:JSON.stringify(args), cache:'no-store', credentials:'omit', referrerPolicy:'no-referrer'}); }
    catch { const e = new Error('Tidak dapat terhubung ke server cloud. Periksa koneksi internet.'); e.net = 1; throw e; }
    const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch {}
    if (!r.ok) { const m = String(j?.message || t || r.status); const e = new Error(m); if (/SESI/.test(m)) e.sess = 1; if (/AKSES/.test(m)) e.akses = 1; throw e; }
    return j;
  }
  /* ---------- Turunan kunci v3: 1 kata sandi → kunci pembungkus + kunci otentikasi ---------- */
  async function kdf3(pw, salt, it) {
    const k = await crypto.subtle.importKey('raw', TE.encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt:ub(salt), iterations:clamp(it, 1e5, 5e6, ITER)}, k, 512));
    const kek = await crypto.subtle.importKey('raw', bits.slice(0, 32), {name:'AES-GCM'}, false, ['wrapKey', 'unwrapKey']);
    const ah = b64(await crypto.subtle.digest('SHA-256', bits.slice(32))); bits.fill(0);
    return {kek, ah};
  }
  async function entry(id, u, pw) { const salt = newSalt(), {kek, ah} = await kdf3(pw, salt, ITER); return {id, u, salt, it:ITER, ...(await wrapDEK(Vault.key, kek)), ah, kv:3}; }

  /* ---------- Cache terenkripsi (IndexedDB) ---------- */
  const db = (mode, fn) => new Promise((ok, no) => { const q = indexedDB.open('sppd-cloud', 1); q.onupgradeneeded = () => q.result.createObjectStore('rows'); q.onerror = () => no(q.error); q.onsuccess = () => { const d = q.result, tx = d.transaction('rows', mode), r = fn(tx.objectStore('rows')); tx.oncomplete = () => { d.close(); ok(r?.result); }; tx.onerror = () => { d.close(); no(tx.error); }; }; });
  const cacheAll = () => db('readonly', s => s.getAll()).catch(() => []);
  const cachePut = rows => db('readwrite', s => { rows.forEach(r => s.put(r, r.k)); s.put({k:'__ver', ver:VER}, '__ver'); }).catch(() => {});
  const cacheClear = () => db('readwrite', s => s.clear()).catch(() => {});

  /* ---------- Terapkan baris dari server ke data lokal ---------- */
  const rebuildLog = () => { D.log = [...logB.values()].flat().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 300); };
  async function apply(rows) {
    let ch = false, lg = false;
    for (const r of rows) {
      if (!r || !r.k || r.k === '__ver') continue;
      const [col, id] = r.k.split(':');
      if (!(KEYS.includes(col) || col === 'acl') || dirty.has(r.k)) continue;
      if (col === 'log') { if (r.d) logB.delete(r.k); else { try { logB.set(r.k, CLEAN.log(await unseal(Vault.key, r.v, r.k))); } catch {} } lg = true; continue; }
      if (r.d) { if (id) { const i = D[col].findIndex(x => x.id === id); if (i >= 0) { D[col].splice(i, 1); ch = true; } } snap.delete(r.k); continue; }
      let val; try { val = await unseal(Vault.key, r.v, r.k); } catch { continue; }
      if (col === 'acl') { ACL = cleanACL(val); snap.set(r.k, JSON.stringify(ACL)); ch = true; continue; }
      if (!id) { D[col] = CLEAN[col](val); snap.set(r.k, JSON.stringify(D[col])); ch = true; continue; }
      const it = CLEAN[col]([val])[0]; if (!it) continue; it.id = id;
      const i = D[col].findIndex(x => x.id === id); if (i >= 0) D[col][i] = it; else D[col].push(it);
      snap.set(r.k, JSON.stringify(it)); ch = true;
    }
    if (lg) { rebuildLog(); ch = true; }
    return ch;
  }
  /* ---------- Hitung perubahan lokal (diff terhadap versi tersinkron) ---------- */
  function diff(col) {
    if (col === 'cfg' || col === 'acl') { const v = col === 'cfg' ? D.cfg : ACL, j = JSON.stringify(v); return snap.get(col) === j ? [] : [{k:col, val:v, j}]; }
    const out = [], pre = col + ':', seen = new Set();
    for (const it of D[col]) { if (!okId(it.id)) it.id = uid(); const k = pre + it.id, j = JSON.stringify(it); seen.add(k); if (snap.get(k) !== j) out.push({k, val:it, j}); }
    for (const k of snap.keys()) if (k.startsWith(pre) && !seen.has(k)) out.push({k, d:true});
    return out;
  }
  const setState = (s, m = '') => { state = s; errMsg = m; if (s === 'ok') last = Date.now(); const el = $('#sync'); if (el) { el.dataset.s = s; el.title = s === 'ok' ? 'Tersimpan di cloud' : s === 'sync' ? 'Menyimpan ke cloud…' : s === 'off' ? 'Offline — perubahan akan dikirim saat online' : 'Gagal sinkron: ' + m; el.innerHTML = I(s === 'err' || s === 'off' ? 'cloudOff' : 'cloud'); } };

  /* ---------- Kirim ---------- */
  let qT = 0, busy = null;
  function queue(col) { if (!TOK) return; Q.add(col); setState('sync'); clearTimeout(qT); qT = setTimeout(flush, 350); }
  async function flush() {
    if (busy) return busy;
    if (!TOK || (!Q.size && !logDirty.size)) { if (state === 'sync') setState('ok'); return; }
    busy = (async () => {
      const cols = [...Q]; Q.clear(); const lk = [...logDirty]; logDirty.clear();
      try {
        const marks = [], rows = [];
        for (const col of cols) { if (col === 'log') continue; for (const x of diff(col)) { dirty.add(x.k); marks.push(x); rows.push(x.d ? {k:x.k, d:true} : {k:x.k, v:await seal(Vault.key, x.val, x.k)}); } }
        for (const k of lk) rows.push({k, v:await seal(Vault.key, logB.get(k) || [], k)});
        let chunk = [], size = 0;
        const send = async () => { if (chunk.length) { await rpc('sppd_push', {p_t:TOK, p_rows:chunk}); chunk = []; size = 0; } };
        for (const r of rows) { const n = (r.v || '').length + 80; if (size + n > 1.5e6 || chunk.length >= 500) await send(); chunk.push(r); size += n; }
        await send();
        marks.forEach(x => { if (x.d) snap.delete(x.k); else snap.set(x.k, x.j); dirty.delete(x.k); });
        setState('ok');
      } catch (e) {
        cols.forEach(c => Q.add(c)); lk.forEach(k => logDirty.add(k)); dirty.clear();
        if (e.sess) { setState('err', 'sesi'); Auth.logout('Sesi cloud berakhir, silakan masuk lagi'); return; }
        if (e.akses) { setState('err', 'akses'); toast('Server menolak: akses tidak diizinkan untuk peran Anda', 'err'); return; }
        setState(e.net ? 'off' : 'err', e.message); clearTimeout(qT); qT = setTimeout(flush, e.net ? 8000 : 15000);
      }
    })();
    try { await busy; } finally { busy = null; if (Q.size || logDirty.size) { clearTimeout(qT); qT = setTimeout(flush, 400); } }
  }
  /* ---------- Ambil ---------- */
  async function pull(force) {
    if (!TOK || (!force && (busy || Q.size))) return false;
    const j = await rpc('sppd_pull', {p_t:TOK, p_since:VER});
    if (j.ver < VER) { await cacheClear(); VER = 0; return reload(); }          /* server direset */
    const ch = await apply(j.rows || []); VER = j.ver; if (j.rows?.length) cachePut(j.rows);
    if (j.role && cur && j.role !== cur.role) { cur.role = j.role; document.body.dataset.role = j.role; render(); }
    setState('ok'); return ch;
  }
  async function reload() {
    Store.wipeMemory(); snap.clear(); logB.clear(); ACL = []; VER = 0;
    const cached = await cacheAll(), meta = cached.find(r => r && r.k === '__ver');
    if (meta) { await apply(cached.filter(r => r.k !== '__ver').sort((a, b) => a.ver - b.ver)); VER = meta.ver || 0; }
    try { await pull(true); } catch (e) { if (e.sess) throw e; setState('off', e.message); if (!meta) throw e; }
    return true;
  }
  function loop() {
    clearInterval(timer);
    timer = setInterval(async () => { if (!TOK || document.hidden) return; try { if (await pull()) { if (!$('#mod').innerHTML && !document.querySelector('.ov.ask')) render(); } } catch (e) { if (e.sess) Auth.logout('Sesi cloud berakhir, silakan masuk lagi'); else setState(e.net ? 'off' : 'err', e.message); } }, 15000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && TOK) pull().then(c => { if (c && !$('#mod').innerHTML) render(); }).catch(() => {}); });
  addEventListener('online', () => { if (TOK) { flush(); pull().catch(() => {}); } });

  return {
    on, url, rpc, kdf3, entry,
    get token() { return TOK; }, get me() { return ME; }, get ready() { return ready; }, get state() { return state; }, get last() { return last; }, get err() { return errMsg; }, get pending() { return Q.size + logDirty.size; },
    async status() { const j = await rpc('sppd_status'); ready = !!j.ready; return ready; },
    async begin(token, me) { TOK = token; ME = me; await reload(); loop(); },
    setMe(me) { ME = me; },
    queue, flush, pull, setState,
    queueAll() { [...KEYS, 'acl'].forEach(k => Q.add(k)); return flush(); },
    logAdd(e) { if (!TOK || !ME) return; const k = 'log:' + ME.id.slice(0, 20) + today().replace(/-/g, ''); const a = logB.get(k) || []; a.push(e); logB.set(k, a); logDirty.add(k); clearTimeout(qT); qT = setTimeout(flush, 800); },
    async end() { clearInterval(timer); try { await flush(); } catch {} if (TOK) { try { await rpc('sppd_logout', {p_t:TOK}); } catch {} } TOK = null; ME = null; snap.clear(); logB.clear(); dirty.clear(); Q.clear(); VER = 0; setState('idle'); }
  };
})();
