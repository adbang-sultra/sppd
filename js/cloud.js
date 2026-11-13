/* ============================================================
   PENYIMPANAN CLOUD (Supabase) — data bisa dibuka lintas peramban/perangkat.
   - Aktif bila SYNC.url & SYNC.anonKey diisi di js/config.js.
   - Enkripsi ujung-ke-ujung: setiap baris dienkripsi AES-256-GCM di browser;
     server hanya menyimpan ciphertext.
   - Sinkron per baris dengan NOMOR VERSI. Tiap kiriman membawa versi yang terakhir
     dilihat; bila baris di server sudah diubah orang lain, kiriman itu tidak menimpa —
     kedua perubahan digabung per kolom (lihat merge3 di core.js).
   - Cache terenkripsi di IndexedDB ('rows') → cepat & bisa dibaca saat sinyal putus.
   - Antrean keluar terenkripsi di IndexedDB ('out') → perubahan yang belum terkirim
     TIDAK hilang walau tab ditutup / dimuat ulang; dikirim saat masuk lagi & online.
   ============================================================ */
'use strict';
const Cloud = (() => {
  const C = (typeof SYNC === 'object' && SYNC) || {};
  const url = String(C.url || '').replace(/\/+$/, ''), API = 2;
  const on = (/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || (C.dev === true && /^http:\/\/localhost:\d+$/.test(url))) && /^[\w.-]{20,}$/.test(C.anonKey || '');
  let TOK = null, ME = null, VER = 0, ready = null, last = 0, state = 'idle', errMsg = '', timer = 0;
  const snap = new Map(), kv = new Map(), dirty = new Set(), late = new Map(), Q = new Set(), logB = new Map(), logDirty = new Set(), stale = new Set();
  const COLS = [...KEYS, 'acl', 'ph', 'img'];
  const pj = s => { try { return JSON.parse(s); } catch { return null; } };
  const changed = () => { if (typeof softRender === 'function') softRender(); };

  /* ---------- RPC (batas waktu 30 detik agar tidak menggantung saat sinyal buruk) ---------- */
  async function rpc(fn, args = {}, ms = 30000) {
    let r; const ac = new AbortController(), tm = setTimeout(() => ac.abort(), ms);
    try { r = await fetch(url + '/rest/v1/rpc/' + fn, {method:'POST', headers:{apikey:C.anonKey, Authorization:'Bearer ' + C.anonKey, 'Content-Type':'application/json', Accept:'application/json'}, body:JSON.stringify(args), cache:'no-store', credentials:'omit', referrerPolicy:'no-referrer', signal:ac.signal}); }
    catch { const e = new Error('Tidak dapat terhubung ke server cloud. Periksa koneksi internet.'); e.net = 1; throw e; }
    finally { clearTimeout(tm); }
    const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch {}
    if (!r.ok) {
      const m = String(j?.message || t || r.status); const e = new Error(m);
      if (/SESI/.test(m)) e.sess = 1; if (/AKSES/.test(m)) e.akses = 1;
      if (r.status === 404 || /VERSI|PGRST202|Could not find the function/.test(m + (j?.code || ''))) { e.message = 'Skema server belum diperbarui ke v1.2 — jalankan ulang supabase/schema-sppd.sql di SQL Editor.'; e.skema = 1; }
      if (r.status >= 502 && r.status <= 504) e.net = 1;
      throw e;
    }
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

  /* ---------- IndexedDB: 'rows' = cache baris server, 'out' = antrean keluar ---------- */
  const db = (store, mode, fn) => new Promise((ok, no) => {
    const q = indexedDB.open('sppd-cloud', 2);
    q.onupgradeneeded = () => { const d = q.result; ['rows', 'out'].forEach(s => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s); }); };
    q.onerror = () => no(q.error);
    q.onsuccess = () => { const d = q.result; let r; const tx = d.transaction(store, mode); try { r = fn(tx.objectStore(store)); } catch (e) { d.close(); return no(e); } tx.oncomplete = () => { d.close(); ok(r?.result); }; tx.onerror = tx.onabort = () => { d.close(); no(tx.error); }; };
  });
  const cacheAll = () => db('rows', 'readonly', s => s.getAll()).catch(() => []);
  const cachePut = rows => db('rows', 'readwrite', s => { rows.forEach(r => s.put(r, r.k)); s.put({k:'__ver', ver:VER}, '__ver'); }).catch(() => {});
  const cacheClear = () => db('rows', 'readwrite', s => s.clear()).catch(() => {});
  const outAll = () => db('out', 'readonly', s => s.getAll()).catch(() => []);
  const outPut = es => es.length ? db('out', 'readwrite', s => { es.forEach(e => s.put(e, e.id)); }).catch(() => {}) : Promise.resolve();
  const outDel = ids => ids.length ? db('out', 'readwrite', s => { ids.forEach(i => s.delete(i)); }).catch(() => {}) : Promise.resolve();
  const oid = k => ME.id + '|' + k;

  /* ---------- Terapkan baris dari server ke data lokal ---------- */
  const rebuildLog = () => { D.log = [...logB.values()].flat().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 300); };
  async function apply(rows, skip) {
    let ch = false, lg = false, legacyCfg = false; const cols = new Set(), keys = [];
    rows = rows.filter(r => r && r.k && r.k !== '__ver').sort((a, b) => isBlob(b.k) - isBlob(a.k) || (a.ver || 0) - (b.ver || 0));   /* gambar dulu, baru induknya */
    for (const r of rows) {
      const col = r.k.split(':')[0];
      if (!COLS.includes(col) || skip?.has(r.k)) continue;
      if (r.ver && (kv.get(r.k) || 0) >= r.ver) continue;                       /* sudah dimiliki (mis. gema dari kiriman sendiri) */
      if (dirty.has(r.k)) { late.set(r.k, r); continue; }                       /* sedang dikirim: tunda, diproses setelah kiriman selesai */
      if (r.ver) kv.set(r.k, r.ver);
      if (col === 'log') { if (r.d) logB.delete(r.k); else { try { logB.set(r.k, CLEAN.log(await unseal(Vault.key, r.v, r.k))); } catch {} } lg = true; continue; }
      if (r.d) { absorb(r.k, undefined); snap.delete(r.k); if (!isBlob(r.k)) ch = true; continue; }
      let val; try { val = await unseal(Vault.key, r.v, r.k); } catch { continue; }
      absorb(r.k, val);
      if (isBlob(r.k)) snap.set(r.k, '1'); else { cols.add(col); keys.push(r.k); ch = true; if (col === 'cfg' && val && (CIMG.some(f => okImg(val[f])) || (val.ui && UIMG.some(f => okImg(val.ui[f]))))) legacyCfg = true; }
    }
    for (const col of cols) { sortD(col); const m = await rowsOf(col); for (const k of keys) if (m.has(k)) snap.set(k, JSON.stringify(m.get(k))); }
    if (legacyCfg) snap.set('cfg', 'format-lama');                           /* gambar masih menyatu (v1.1): dipisah saat pengaturan disimpan berikutnya */
    if (lg) { rebuildLog(); ch = true; }
    return ch;
  }
  /* ---------- Hitung perubahan lokal (diff terhadap versi tersinkron) ---------- */
  async function diff(col) {
    const m = await rowsOf(col), out = [];
    for (const [k, val] of m) { const j = isBlob(k) ? '1' : JSON.stringify(val); if (snap.get(k) !== j) out.push({k, val, j}); }
    for (const k of snap.keys()) if (owns(col, k) && !m.has(k)) out.push({k, d:true});
    return out;
  }
  const setState = (s, m = '') => { state = s; errMsg = m; if (s === 'ok') last = Date.now(); const el = $('#sync'); if (el) { el.dataset.s = s; el.title = s === 'ok' ? 'Tersimpan di cloud' : s === 'sync' ? 'Menyimpan ke cloud…' : s === 'off' ? 'Offline — perubahan disimpan di perangkat ini dan dikirim saat online' : 'Gagal sinkron: ' + m; el.innerHTML = I(s === 'err' || s === 'off' ? 'cloudOff' : 'cloud'); } };

  /* ---------- Bentrok: baris sudah diubah pihak lain sejak terakhir dilihat ---------- */
  const NMR = {emp:'pegawai', prog:'program', sppd:'SPPD', rep:'laporan', cfg:'pengaturan', acl:'pengguna'};
  const label = (k, v) => { const col = k.split(':')[0]; return (NMR[col] || col) + (v && (v.nama || v.no || v.kegiatan) ? ' "' + txt(v.nama || v.no || v.kegiatan, 40) + '"' : ''); };
  /* Menggabung satu baris; mengembalikan catatan untuk pengguna ('' bila tergabung mulus). */
  function combine(k, base, loc, rem) {
    const cb = base ? canonRow(k, base) : null;
    if (loc === undefined && !rem) return '';
    if (loc === undefined) { absorb(k, rem); return label(k, rem) + ' batal dihapus karena baru saja diubah pengguna lain'; }
    if (!rem) { absorb(k, loc); return label(k, loc) + ' dihapus pengguna lain, dipulihkan dengan perubahan Anda'; }
    const {val, clash} = k === 'acl' ? mergeList(cb, canonRow(k, loc), rem) : merge3(cb, canonRow(k, loc), rem);
    absorb(k, val);
    return clash.length ? label(k, val) + ': Anda dan pengguna lain mengubah isian yang sama — isian Anda yang dipakai' : '';
  }
  async function resolve(conf) {
    await pullPages(conf);                                                     /* baris lain (termasuk foto) masuk dulu */
    const j = await rpc('sppd_get', {p_t:TOK, p_keys:[...conf]}), notes = [], by = {};
    for (const r of j.rows || []) {
      const col = r.k.split(':')[0]; by[col] = by[col] || await rowsOf(col);
      let rem = null; if (!r.d) { try { rem = canonRow(r.k, await unseal(Vault.key, r.v, r.k)); } catch { continue; } }
      const n = combine(r.k, snap.has(r.k) ? pj(snap.get(r.k)) : null, by[col].get(r.k), rem); if (n) notes.push(n);
      if (rem) snap.set(r.k, JSON.stringify(rem)); else snap.delete(r.k);
      kv.set(r.k, r.ver); Q.add(col);
    }
    if (notes.length) toast(notes.slice(0, 2).join(' · ') + (notes.length > 2 ? ` (+${notes.length - 2} lainnya)` : ''), 'err');
    else if (j.rows?.length) toast('Data juga diubah pengguna lain — kedua perubahan digabung otomatis');
  }

  /* ---------- Kirim ---------- */
  let qT = 0, busy = null;
  function queue(col) { if (!TOK) return; Q.add(col); setState('sync'); clearTimeout(qT); qT = setTimeout(flush, 120); }
  async function flush() {
    if (busy) return busy;
    if (!TOK || (!Q.size && !logDirty.size)) { if (state === 'sync') setState('ok'); return; }
    busy = (async () => {
      const cols = [...Q]; Q.clear(); const lk = [...logDirty]; logDirty.clear(); let ch = false; const outs = [];
      try {
        const marks = [], rows = [], key = Vault.key;
        for (const col of cols) {
          if (col === 'log') continue;
          for (const x of await diff(col)) {
            const b = isBlob(x.k) ? null : (kv.get(x.k) || 0); dirty.add(x.k); marks.push(x);
            rows.push(x.d ? {k:x.k, d:true, b} : {k:x.k, v:await seal(key, x.val, x.k), b});
            outs.push({id:oid(x.k), uid:ME.id, k:x.k, b, d:!!x.d, box:await seal(key, {val:x.d ? null : x.val, base:!isBlob(x.k) && snap.has(x.k) ? pj(snap.get(x.k)) : null}, 'out:' + x.k)});
          }
        }
        for (const k of lk) { const a = logB.get(k) || []; rows.push({k, v:await seal(key, a, k)}); outs.push({id:oid(k), uid:ME.id, k, b:null, d:false, box:await seal(key, {val:a}, 'out:' + k)}); }
        await outPut(outs);                                                    /* tercatat di perangkat SEBELUM dikirim */
        if (stale.size) { outs.forEach(o => stale.delete(o.id)); await outDel([...stale]); stale.clear(); }   /* sisa antrean lama yang ternyata sudah sampai */
        const vers = {}, conf = new Set(); let chunk = [], size = 0;
        const send = async () => { if (chunk.length) { const r = await rpc('sppd_push', {p_t:TOK, p_rows:chunk, p_api:API}, 120000); Object.assign(vers, r.vers || {}); (r.conflicts || []).forEach(k => conf.add(k)); chunk = []; size = 0; } };
        for (const r of rows) { const n = (r.v || '').length + 80; if (size + n > 1.5e6 || chunk.length >= 500) await send(); chunk.push(r); size += n; }
        await send();
        const done = lk.map(oid); lk.forEach(k => { if (vers[k]) kv.set(k, vers[k]); });
        for (const x of marks) {
          dirty.delete(x.k); if (conf.has(x.k)) continue;
          if (x.d) snap.delete(x.k); else snap.set(x.k, x.j);
          if (vers[x.k]) kv.set(x.k, vers[x.k]); done.push(oid(x.k));
        }
        await outDel(done);
        if (conf.size) { await resolve(conf); ch = true; }
        if (late.size) { const rs = [...late.values()]; late.clear(); ch = await apply(rs) || ch; }
        setState('ok');
      } catch (e) {
        cols.forEach(c => Q.add(c)); lk.forEach(k => logDirty.add(k)); dirty.clear();
        if (e.sess) { setState('err', 'sesi'); TOK = null; Auth.logout('Sesi cloud berakhir, silakan masuk lagi'); return; }
        if (e.akses) { setState('err', 'akses'); cols.forEach(c => Q.delete(c)); await outDel(outs.map(o => o.id)); toast('Server menolak: akses tidak diizinkan untuk peran Anda', 'err'); return; }
        setState(e.net ? 'off' : 'err', e.message); clearTimeout(qT); qT = setTimeout(flush, e.net ? 8000 : e.skema ? 60000 : 15000);
        if (e.skema) toast(e.message, 'err');
        return 'gagal';
      }
      if (ch) changed();
    })();
    let res; try { res = await busy; } finally { busy = null; if (res !== 'gagal' && TOK && (Q.size || logDirty.size)) { clearTimeout(qT); qT = setTimeout(flush, 400); } }
  }
  /* ---------- Ambil (berhalaman) ---------- */
  async function pullPages(skip) {
    let ch = false;
    for (let i = 0; i < 400; i++) {
      const j = await rpc('sppd_pull', {p_t:TOK, p_since:VER, p_lim:500}, 120000);
      if (j.ver < VER) { await cacheClear(); VER = 0; await reload(); return true; }          /* server direset */
      ch = await apply(j.rows || [], skip) || ch; VER = j.ver; if (j.rows?.length) await cachePut(j.rows);
      if (j.role && cur && j.role !== cur.role) { cur.role = j.role; document.body.dataset.role = j.role; ch = true; }
      if (!j.more) break;
    }
    return ch;
  }
  /* satu pengambilan pada satu waktu: panggilan bersamaan (timer, pindah menu, fokus) memakai hasil yang sama */
  let pulling = null;
  async function pull(force) {
    if (!TOK || (!force && (busy || Q.size))) return false;
    if (pulling) return pulling;
    pulling = (async () => { try { const ch = await pullPages(); if (!Q.size && !busy) setState('ok'); return ch; } finally { pulling = null; } })();
    return pulling;
  }
  async function reload() {
    Store.wipeMemory(); snap.clear(); kv.clear(); logB.clear(); late.clear(); ACL = []; VER = 0;
    const cached = await cacheAll(), meta = cached.find(r => r && r.k === '__ver');
    if (meta) { await apply(cached); VER = meta.ver || 0; }
    try { await pullPages(); setState('ok'); } catch (e) { if (e.sess || e.skema) throw e; setState('off', e.message); if (!meta) throw e; }
    return true;
  }
  /* ---------- Perubahan yang belum terkirim dari sesi sebelumnya (offline / tab tertutup) ---------- */
  async function replay() {
    const es = (await outAll()).filter(e => e && e.uid === ME.id && e.k).sort((a, b) => isBlob(b.k) - isBlob(a.k));
    if (!es.length) return 0; const notes = []; let n = 0, lg = false;
    for (const e of es) {
      let o; try { o = await unseal(Vault.key, e.box, 'out:' + e.k); } catch { await outDel([e.id]); continue; }
      const col = e.k.split(':')[0];
      if (col === 'log') { const a = logB.get(e.k) || [], ids = new Set(a.map(x => x.id)), add = CLEAN.log(o.val).filter(x => !ids.has(x.id)); if (add.length) { logB.set(e.k, [...a, ...add]); logDirty.add(e.k); lg = true; } else await outDel([e.id]); continue; }
      stale.add(e.id);
      if (isBlob(e.k)) { if (!e.d && !PH.has(e.k)) absorb(e.k, o.val); Q.add(col === 'ph' ? 'rep' : 'cfg'); continue; }
      const rem = snap.has(e.k) ? pj(snap.get(e.k)) : null, loc = e.d ? undefined : o.val;
      if ((kv.get(e.k) || 0) === (e.b || 0)) absorb(e.k, loc);                  /* server belum berubah sejak itu */
      else { const nt = combine(e.k, o.base, loc, rem); if (nt) notes.push(nt); }
      Q.add(col); n++;
    }
    if (lg) rebuildLog();
    if (notes.length) toast(notes.slice(0, 2).join(' · '), 'err');
    return n;
  }
  /* Selalu terhubung: perubahan sendiri dikirim seketika (queue → flush), perubahan dari perangkat lain
     diambil tiap ${LIVE} ms selama aplikasi terbuka, dan seketika saat pindah menu / kembali ke tab / online lagi.
     Bila gagal (sinyal putus), jeda bertahap lalu otomatis mencoba lagi — tidak perlu tombol sinkron. */
  const LIVE = 3000; let skip = 0;
  async function tick() {
    if (!TOK || document.hidden) return;
    try { if (Q.size || logDirty.size) await flush(); else if (await pull()) changed(); skip = 0; }
    catch (e) { if (e.sess) return Auth.logout('Sesi cloud berakhir, silakan masuk lagi'); setState(e.net ? 'off' : 'err', e.message); skip = Math.min(10, skip ? skip * 2 : 2); }
  }
  function loop() {
    clearInterval(timer); let n = 0;
    timer = setInterval(() => { if (skip && ++n < skip) return; n = 0; tick(); }, LIVE);
  }
  const now = () => { if (TOK && !document.hidden) { skip = 0; tick(); } };
  document.addEventListener('visibilitychange', now);
  addEventListener('focus', now);
  addEventListener('hashchange', now);
  /* Jangan sampai ada perubahan yang tertinggal saat tab disembunyikan/ditutup: kirim segera, dan beri peringatan bila belum selesai */
  document.addEventListener('visibilitychange', () => { if (document.hidden && TOK && (Q.size || logDirty.size)) flush().catch(() => {}); });
  addEventListener('pagehide', () => { if (TOK && (Q.size || logDirty.size || busy)) flush().catch(() => {}); });
  addEventListener('beforeunload', e => { if (TOK && (Q.size || logDirty.size || busy || state === 'sync')) { e.preventDefault(); e.returnValue = ''; } });
  addEventListener('online', now);
  const noHash = s => sha256hex('sppd-no:' + String(s).trim().toLowerCase().replace(/\s+/g, ' '));

  return {
    on, url, rpc, kdf3, entry,
    get token() { return TOK; }, get me() { return ME; }, get ready() { return ready; }, get state() { return state; }, get last() { return last; }, get err() { return errMsg; }, get pending() { return Q.size + logDirty.size; },
    async status() { const j = await rpc('sppd_status'); if (!(j.api >= API)) { const e = new Error('Skema server belum diperbarui ke v1.2 — jalankan ulang supabase/schema-sppd.sql di SQL Editor.'); e.skema = 1; throw e; } ready = !!j.ready; return ready; },
    async begin(token, me) { TOK = token; ME = me; await reload(); const n = await replay(); loop(); if (Q.size || logDirty.size) { if (n) toast(`${n} perubahan yang belum terkirim dipulihkan dari perangkat ini`); flush(); } },
    setMe(me) { ME = me; },
    queue, flush, pull, setState,
    queueAll() { [...KEYS, 'acl'].forEach(k => Q.add(k)); return flush(); },
    logAdd(e) { if (!TOK || !ME) return; const k = 'log:' + ME.id.slice(0, 20) + today().replace(/-/g, ''); const a = logB.get(k) || []; a.push(e); logB.set(k, a); logDirty.add(k); clearTimeout(qT); qT = setTimeout(flush, 800); },
    /* Nomor SPPD: klaim nomor baru (& lepas nomor lama). false = sudah dipakai perangkat lain. */
    async claim(no, old) { const r = await rpc('sppd_no_claim', {p_t:TOK, p_new:no ? await noHash(no) : null, p_old:old ? await noHash(old) : null}); return !!r.ok; },
    async claimAll(list) { return rpc('sppd_no_reset', {p_t:TOK, p_h:await Promise.all(list.filter(Boolean).map(noHash))}); },
    audit: (n = 200) => rpc('sppd_audit_list', {p_t:TOK, p_lim:n}),
    async end() { clearInterval(timer); clearTimeout(qT); try { await flush(); } catch {} const sisa = Q.size + logDirty.size; if (TOK) { try { await rpc('sppd_logout', {p_t:TOK}, 8000); } catch {} } TOK = null; ME = null; snap.clear(); kv.clear(); logB.clear(); dirty.clear(); late.clear(); stale.clear(); Q.clear(); logDirty.clear(); VER = 0; setState('idle'); return sisa; }
  };
})();
