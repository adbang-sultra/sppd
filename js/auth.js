/* ============================================================
   AUTENTIKASI & KEAMANAN
   - Seluruh data dienkripsi AES-256-GCM dengan Data Encryption Key (DEK) acak.
   - DEK dibungkus (wrap) dengan kunci turunan kata sandi tiap pengguna
     (PBKDF2-SHA256 600.000 iterasi). Tanpa kata sandi, data tidak dapat dibaca.
   - Peran & status pengguna disimpan DI DALAM brankas terenkripsi (ACL), sehingga
     mengubah localStorage tidak bisa menaikkan hak akses.
   - Sesi: kunci sesi non-extractable (IndexedDB) + sessionStorage, habis bila
     tidak aktif 20 menit atau maksimal 10 jam; keluar di satu tab = keluar semua tab.
   - Kunci bertahap setelah gagal masuk berulang.
   ============================================================ */
'use strict';
const AK = 'sppd_auth', VK = 'sppd_vault', FK = 'sppd_authfail', SK = 'sppd_sess', LEG = 'sppd_users';
const IDLE = 20 * 60e3, ABS = 10 * 3600e3, MAXF = 5, LOCK = 5 * 60e3;
const LV = {admin:3, operator:2, viewer:1}, RL = {admin:'Administrator', operator:'Operator', viewer:'Pembaca'};
const PG = {operator:['dash','emp','prog','sppd','form','cetak','lap','rekap'], viewer:['dash','sppd','cetak','rekap']};
const UNRE = /^[a-z0-9._-]{3,30}$/;
let cur = null, ACL = [], lastT = 0;
const getA = () => { try { const a = JSON.parse(localStorage.getItem(AK)); return Array.isArray(a) ? a : []; } catch { return []; } };
const putA = a => localStorage.setItem(AK, JSON.stringify(a));
const cleanACL = v => arr(v, 500).map(o => ({id:okId(o.id) ? o.id : '', u:UNRE.test(o.u) ? o.u : '', name:txt(o.name, 60), role:own(RL, o.role) ? o.role : 'viewer', on:o.on === true})).filter(o => o.id && o.u);
const saveACL = () => Cloud.on ? (Cloud.queue('acl'), Cloud.flush()) : Vault.key && seal(Vault.key, ACL, 'acl').then(s => localStorage.setItem(Vault.xk('acl'), s));
const cloudUser = me => ({id:me.id, u:me.u, name:ACL.find(x => x.id === me.id)?.name || me.u, role:me.role, on:true});
const loadACL = async () => { const s = localStorage.getItem(Vault.xk('acl')); ACL = s ? cleanACL(await unseal(Vault.key, s, 'acl')) : []; };
const COMMON = ['password', 'katasandi', 'qwerty', '123456', 'admin', 'bismillah', 'indonesia', 'sultra', 'kendari'];
function pwCheck(p, un = '') {
  if (p.length < 10) return 'Kata sandi minimal 10 karakter';
  if (!/[a-z]/i.test(p) || !/\d/.test(p)) return 'Kata sandi harus mengandung huruf dan angka';
  const l = p.toLowerCase(); if (un && l.includes(un.toLowerCase())) return 'Kata sandi tidak boleh memuat username';
  if (COMMON.some(c => l.includes(c)) && p.length < 14) return 'Kata sandi terlalu umum, tambahkan kata/angka lain';
  if (/^(.)\1+$/.test(p)) return 'Kata sandi terlalu sederhana';
  return '';
}
const pwScore = p => { let s = 0; if (p.length >= 10) s++; if (p.length >= 14) s++; if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^\w]/.test(p)) s++; return Math.min(4, s); };
CH.pwMeter = el => { const m = el.parentElement.querySelector('.pwm') || el.closest('form,.dlg-b')?.querySelector('.pwm'); if (m) { const s = el.value ? pwScore(el.value) : 0; m.dataset.s = s; m.querySelector('span').textContent = ['', 'Lemah', 'Cukup', 'Kuat', 'Sangat kuat'][s]; } };
const pwMeter = () => `<div class="pwm" data-s="0"><i></i><i></i><i></i><i></i><span></span></div>`;

/* ---------- Penyimpanan kunci sesi (IndexedDB, non-extractable) ---------- */
const IDB = (() => {
  const op = (mode, fn) => new Promise((ok, no) => { const r = indexedDB.open('sppd-sess', 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onerror = () => no(r.error); r.onsuccess = () => { const db = r.result, tx = db.transaction('k', mode), q = fn(tx.objectStore('k')); tx.oncomplete = () => { db.close(); ok(q?.result); }; tx.onerror = () => { db.close(); no(tx.error); }; }; });
  return {get:k => op('readonly', s => s.get(k)), put:(k, v) => op('readwrite', s => s.put(v, k)), del:k => op('readwrite', s => s.delete(k)).catch(() => {})};
})();
const Sess = {
  async save() {
    const sid = uid(), sk = await crypto.subtle.generateKey({name:'AES-GCM', length:256}, false, ['wrapKey', 'unwrapKey']);
    const w = await wrapDEK(Vault.key, sk); await IDB.put(sid, sk);
    sessionStorage.setItem(SK, JSON.stringify({sid, uid:cur.id, exp:Date.now() + IDLE, abs:Date.now() + ABS, ...w, ...(Cloud.on ? {tok:Cloud.token, me:Cloud.me} : {})}));
  },
  get() { try { return JSON.parse(sessionStorage.getItem(SK)); } catch { return null; } },
  patch(o) { const s = this.get(); if (s) sessionStorage.setItem(SK, JSON.stringify({...s, ...o})); },
  touch() { const s = this.get(); if (s) { s.exp = Math.min(s.abs, Date.now() + IDLE); sessionStorage.setItem(SK, JSON.stringify(s)); } },
  async clear() { const s = this.get(); sessionStorage.removeItem(SK); if (s?.sid) await IDB.del(s.sid); },
  async restore() {
    const s = this.get(); if (!s || !okId(s.sid) || s.exp < Date.now() || s.abs < Date.now()) { await this.clear(); return null; }
    const sk = await IDB.get(s.sid); if (!sk) { await this.clear(); return null; }
    Vault.key = await unwrapDEK(s, sk);
    if (Cloud.on) {
      let me; try { me = (await Cloud.rpc('sppd_me', {p_t:s.tok})).user; } catch (e) { if (!e.net || !s.me?.id) throw e; me = s.me; }   /* offline: lanjut dari cache perangkat */
      await Cloud.begin(s.tok, me); return cloudUser(me);
    }
    await loadACL();
    const u = ACL.find(x => x.id === s.uid && x.on); if (!u) { Vault.key = null; await this.clear(); return null; }
    return u;
  }
};

/* ---------- Pembatasan percobaan masuk ---------- */
const fails = () => { try { return JSON.parse(localStorage.getItem(FK)) || {n:0, until:0, lv:0}; } catch { return {n:0, until:0, lv:0}; } };
function addFail() { const f = fails(); f.n++; if (f.n >= MAXF) { f.lv = Math.min((f.lv || 0) + 1, 6); f.until = Date.now() + LOCK * Math.pow(2, f.lv - 1); f.n = 0; } localStorage.setItem(FK, JSON.stringify(f)); }

/* ---------- API peran ---------- */
const Auth = {
  logged:() => !!cur, role:() => cur?.role, user:() => cur,
  can:l => (LV[cur?.role] || 0) >= (l === 'a' ? 3 : 2),
  allow:p => !!cur && (cur.role === 'admin' || (PG[cur.role] || []).includes(p)),
  canWrite(k) { const r = cur?.role; if (!r) return false; if (r === 'admin' || k === 'log') return true; return r === 'operator' && ['emp', 'prog', 'sppd', 'rep'].includes(k); },
  async logout(msg = '', fromOther) {
    try { await flush(); } catch {}
    if (cur) { try { log('Keluar'); await flush(); } catch {} }
    if (Cloud.on) { const sisa = await Cloud.end(); if (sisa && !msg) msg = 'Ada perubahan yang belum terkirim (offline). Perubahan tersimpan di perangkat ini dan dikirim otomatis saat Anda masuk lagi.'; }
    cur = null; Vault.key = null; ACL = []; Store.wipeMemory(); TDraft = null; await Sess.clear();
    if (!fromOther) BC?.postMessage({t:'logout'});
    $('#main').innerHTML = $('#pa').innerHTML = $('#nav').innerHTML = $('#bnav').innerHTML = $('#rp').innerHTML = ''; closeM(); closeDrawers();
    $$('.ov.ask').forEach(x => x.remove()); delete document.body.dataset.role; history.replaceState(null, '', location.pathname);
    applyUI(); view(msg);
  }
};
act('logout', async () => { if (await ask('Keluar dari aplikasi?', 'Keluar', false)) Auth.logout(); });
async function start(u, fresh) {
  cur = u; if (fresh) await Sess.save(); else Sess.touch();
  document.body.dataset.role = u.role; $('#login').hidden = true; $('#login').innerHTML = ''; $('#app').hidden = false;
  $('#uchip').innerHTML = `<span class="av">${esc(u.name.charAt(0).toUpperCase())}</span><span class="un"><b>${esc(u.name)}</b><small>${RL[u.role]}</small></span>`;
  $('#sideUser').textContent = u.name + ' · ' + RL[u.role] + ' · v' + APP_VER; try { navigator.storage?.persist?.(); } catch {} $('#sync').hidden = !Cloud.on; if (Cloud.on) Cloud.setState(Cloud.state === 'idle' ? 'ok' : Cloud.state);
  try { if (localStorage.getItem('sppd_mini') && wide()) $('#side').classList.add('mini'); } catch {}
  if (fresh) log('Masuk'); applyUI(); post($('#app')); render();
}

/* ---------- Migrasi dari versi lama (data polos + akun lama) ---------- */
const legacyUsers = () => { try { const a = JSON.parse(localStorage.getItem(LEG)); return Array.isArray(a) ? a : []; } catch { return []; } };
function legacyData() { const o = {}; KEYS.forEach(k => { const s = localStorage.getItem('sppd_' + k); if (s) { try { o[k] = CLEAN[k](JSON.parse(s)); if (ITEMS.includes(k)) stampOrder(o[k]); } catch {} } }); return o; }
async function createVault(owner, others, data) {
  KEYS.forEach(k => D[k] = data[k] ?? structuredClone(DEF[k]));
  ACL = cleanACL([owner.acl, ...others.map(o => o.acl)]);
  putA([owner.auth, ...others.map(o => o.auth)]);
  await saveACL(); cur = owner.acl; await Promise.all(KEYS.map(persist)); await flush();
  localStorage.setItem(VK, JSON.stringify({v:2, at:new Date().toISOString()}));
  KEYS.forEach(k => localStorage.removeItem('sppd_' + k)); localStorage.removeItem(LEG);   /* hapus salinan polos */
}
async function authEntry(id, un, pw) { const salt = newSalt(); return {id, u:un, salt, it:ITER, ...(await wrapDEK(Vault.key, await kdf(pw, salt)))}; }

/* ---------- Layar masuk ---------- */
function view(msg = '') {
  if (Cloud.on && Cloud.ready === null) {
    $('#app').hidden = true; $('#login').hidden = false;
    $('#login').innerHTML = `<div class="lg lgload">${I('cloud', 'big')}<p class="muted">Menghubungkan ke server…</p><p class="muted sm" id="a_m"></p><div class="err" id="a_e" role="alert"></div><button class="btn2" data-act="retryCloud" hidden id="a_r">${I('refresh')}<span>Coba lagi</span></button></div>`;
    $('#a_m').textContent = msg; applyUI(); post($('#login'));
    Cloud.status().then(() => view(msg)).catch(e => { if ($('#a_e')) { $('#a_e').textContent = e.message; $('#a_r').hidden = false; } });
    return;
  }
  const leg = !Cloud.on && !Vault.ready() && legacyUsers().length, setup = Cloud.on ? !Cloud.ready : !Vault.ready() && !leg, u = UI();
  $('#app').hidden = true; $('#login').hidden = false;
  $('#login').innerHTML = `<div class="lgw"><div class="lg-art" aria-hidden="true"><div class="lg-art-in"><img class="brandLogo" alt=""><h2 class="brandName"></h2><p class="brandSub"></p><ul><li>${I('shield')}Data terenkripsi AES-256</li><li>${I('printer')}Cetak SPPD, Surat Tugas & Laporan</li><li>${I('chart')}Rekap & dashboard interaktif</li></ul></div></div>
  <form id="lf" class="lg" autocomplete="on" method="post" action="about:blank" novalidate><img class="brandLogo lg-logo" alt=""><h1>${setup ? 'Buat Akun Administrator' : 'Selamat datang'}</h1><p class="muted">${setup && Cloud.on ? 'Server cloud masih kosong. Buat Administrator pertama dengan kode setup dari file SQL.' + (Vault.ready() ? ' <b>Browser ini berisi data lokal</b> — pakai username & kata sandi admin lokal agar seluruh data ikut diunggah.' : '') : setup ? 'Pertama kali dipakai. Akun ini memegang kunci enkripsi data.' : leg ? 'Pembaruan keamanan: Administrator masuk untuk mengaktifkan enkripsi data.' : 'Masuk untuk melanjutkan'}</p>
  ${setup && Cloud.on ? `<label class="fld"><span>Kode setup</span><div class="iw">${I('key')}<input id="a_c" type="password" class="in" autocomplete="off" maxlength="200" required></div></label>` : ''}${setup ? `<label class="fld"><span>Nama lengkap</span><input id="a_n" class="in" maxlength="60" required></label>` : ''}<label class="fld"><span>Username</span><div class="iw">${I('user')}<input id="a_u" class="in" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="30" required></div></label>
  <label class="fld"><span>Kata sandi</span><div class="iw">${I('lock')}<input id="a_p" type="password" class="in" autocomplete="${setup ? 'new-password' : 'current-password'}" maxlength="128" required ${setup ? 'data-in="pwMeter"' : ''}><button type="button" class="ib sm eye" data-act="peek" aria-label="Tampilkan kata sandi">${I('eye')}</button></div>${setup ? pwMeter() : ''}</label>
  ${setup ? `<label class="fld"><span>Ulangi kata sandi</span><div class="iw">${I('lock')}<input id="a_p2" type="password" class="in" autocomplete="new-password" maxlength="128" required></div></label>` : ''}
  <div class="err" id="a_e" role="alert"></div><button class="btn big" id="a_b" type="submit">${I(setup ? 'check' : 'key')}<span>${setup ? 'Buat Akun & Masuk' : 'Masuk'}</span></button><p class="lg-foot">${I(Cloud.on ? 'cloud' : 'lock')} ${Cloud.on ? 'Data tersimpan terenkripsi di cloud · bisa dibuka dari browser mana pun' : 'Mode lokal · data hanya di browser ini'} · v${esc(APP_VER)}</p></form></div>`;
  $('#a_e').textContent = msg; applyUI(); post($('#login'));
  setTimeout(() => $(setup ? '#a_n' : '#a_u')?.focus(), 50);
  $('#lf').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#a_b'), err = m => { $('#a_e').textContent = m; btn.disabled = false; btn.classList.remove('busy'); };
    const un = $('#a_u').value.trim().toLowerCase(), pw = $('#a_p').value;
    btn.disabled = true; btn.classList.add('busy'); $('#a_e').textContent = '';
    try {
      if (!UNRE.test(un)) return err('Username 3-30 karakter: huruf kecil, angka, . _ -');
      if (Cloud.on) return await (setup ? cloudSetup(un, pw, err) : cloudLogin(un, pw, err));
      const f = fails(); if (f.until > Date.now()) return err('Terlalu banyak percobaan. Coba lagi dalam ' + Math.ceil((f.until - Date.now()) / 6e4) + ' menit.');
      if (setup) {
        const pe = pwCheck(pw, un); if (pe) return err(pe); if (pw !== $('#a_p2').value) return err('Ulangi kata sandi tidak sama');
        const id = uid(); Vault.key = await newDEK();
        const owner = {acl:{id, u:un, name:txt($('#a_n').value.trim(), 60) || un, role:'admin', on:true}, auth:await authEntry(id, un, pw)};
        await createVault(owner, [], legacyData());
        localStorage.removeItem(FK); return await start(ACL[0], true);
      }
      if (leg) return await legacyLogin(un, pw, err);
      const a = getA().find(x => x.u === un);
      if (!a) { await kdf(pw, newSalt()); addFail(); return err('Username atau kata sandi salah'); }
      if (!a.wk) {
        if (a.h && sameH(await legacyHash(pw, a.lsalt, a.lit || 310000), a.h)) return err('Akun Anda perlu diaktifkan ulang. Minta Administrator mengatur ulang kata sandi Anda.');
        addFail(); return err('Username atau kata sandi salah');
      }
      let dek; try { dek = await unwrapDEK(a, await kdf(pw, a.salt, clamp(a.it, 1e5, 5e6, ITER))); } catch { addFail(); return err('Username atau kata sandi salah'); }
      Vault.key = dek; await loadACL();
      const u = ACL.find(x => x.id === a.id);
      if (!u || !u.on) { Vault.key = null; ACL = []; return err('Akun tidak aktif. Hubungi Administrator.'); }
      localStorage.removeItem(FK);
      if ((a.it || 0) < ITER) { const A = getA(), i = A.findIndex(x => x.id === a.id); A[i] = await authEntry(a.id, a.u, pw); putA(A); }
      await Store.loadAll(); return await start(u, true);
    } catch (x) { if (!x?.net) console.error(x); err(x?.net || x?.skema ? x.message : 'Terjadi kesalahan: ' + (x?.message || x)); }
  });
}
act('retryCloud', () => view($('#a_m')?.textContent || ''));
async function cloudLogin(un, pw, err) {
  const sl = await Cloud.rpc('sppd_salt', {p_u:un}), {kek, ah} = await Cloud.kdf3(pw, sl.salt, sl.it);
  const r = await Cloud.rpc('sppd_login', {p_u:un, p_ah:ah});
  if (!r.ok) return err(r.err === 'lock' ? `Terlalu banyak percobaan. Akun terkunci ${r.menit} menit.` : r.err === 'off' ? 'Akun tidak aktif. Hubungi Administrator.' : 'Username atau kata sandi salah (atau akun perlu diatur ulang oleh Administrator).');
  try { Vault.key = await unwrapDEK(r.user, kek); } catch { return err('Kunci data akun ini rusak. Minta Administrator mengatur ulang kata sandi Anda.'); }
  await Cloud.begin(r.token, r.user); return start(cloudUser(r.user), true);
}
async function cloudSetup(un, pw, err) {
  const code = $('#a_c').value, pe = pwCheck(pw, un); if (pe) return err(pe); if (pw !== $('#a_p2').value) return err('Ulangi kata sandi tidak sama'); if (code.length < 8) return err('Isi kode setup');
  let id = uid(), name = txt($('#a_n').value.trim(), 60) || un, others = [];
  const la = Vault.ready() ? getA().find(x => x.u === un && x.wk) : null;
  if (la) { try { Vault.key = await unwrapDEK(la, await kdf(pw, la.salt, la.it)); } catch { return err('Kata sandi tidak cocok dengan akun admin lokal di browser ini.'); } await loadACL(); await Store.loadAll(); id = la.id; name = ACL.find(x => x.id === id)?.name || name; others = ACL.filter(x => x.id !== id); }
  else { Vault.key = await newDEK(); Store.wipeMemory(); Object.assign(D, legacyData()); }
  const local = Object.fromEntries(KEYS.map(k => [k, D[k]]));
  const ent = await Cloud.entry(id, un, pw), r = await Cloud.rpc('sppd_setup', {p_code:code, p_user:ent});
  if (!r.ok) { Vault.key = null; Store.wipeMemory(); return err({kode:'Kode setup salah.', sudah:'Server sudah memiliki Administrator. Muat ulang halaman lalu masuk.', kunci:'Terlalu banyak percobaan kode setup. Reset lewat SQL Editor.', meta:'Skema SQL belum dijalankan dengan benar.'}[r.err] || 'Setup gagal'); }
  const me = {id, u:un, role:'admin', salt:ent.salt, it:ent.it, wiv:ent.wiv, wk:ent.wk, kv:3};
  await Cloud.begin(r.token, me); Object.assign(D, local);
  ACL = cleanACL([{id, u:un, name, role:'admin', on:true}, ...others.map(o => ({...o, on:o.on}))]);
  await Cloud.queueAll(); try { await Cloud.claimAll(D.sppd.map(s => s.no)); } catch {} toast(la ? 'Data lokal berhasil diunggah ke cloud' : 'Server cloud siap digunakan');
  return start(cloudUser(me), true);
}
act('peek', el => { const i = el.parentElement.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; el.innerHTML = I(i.type === 'password' ? 'eye' : 'lock'); });
async function legacyLogin(un, pw, err) {
  const L = legacyUsers(), us = L.find(x => x.u === un && x.on);
  const ok = us && sameH(await legacyHash(pw, us.salt, us.it || 310000), us.h);
  if (!ok) { addFail(); return err('Username atau kata sandi salah'); }
  if (us.role !== 'admin') return err('Pembaruan keamanan: Administrator harus masuk terlebih dahulu untuk mengaktifkan enkripsi data.');
  const data = legacyData(); Vault.key = await newDEK();
  const oid = okId(us.id) ? us.id : uid(), owner = {acl:{id:oid, u:us.u, name:txt(us.name, 60) || us.u, role:'admin', on:true}, auth:await authEntry(oid, us.u, pw)};
  const others = L.filter(x => x.id !== us.id && okId(x.id) && UNRE.test(x.u)).map(x => ({acl:{id:x.id, u:x.u, name:x.name, role:x.role, on:!!x.on}, auth:{id:x.id, u:x.u, h:x.h, lsalt:x.salt, lit:x.it || 310000}}));
  await createVault(owner, others, data);
  localStorage.removeItem(FK); toast('Enkripsi data aktif. Akun lain perlu diatur ulang kata sandinya.');
  return start(ACL.find(x => x.id === oid), true);
}

/* ---------- Verifikasi ulang kata sandi untuk aksi sensitif ---------- */
function reauth(title, fn) {
  modal(title, `<label class="fld"><span>Kata sandi Anda</span><input id="ra_p" type="password" class="in" autocomplete="current-password"></label>`, async () => {
    const a = Cloud.on ? Cloud.me : getA().find(x => x.id === cur.id);
    try { await unwrapDEK(a, Cloud.on ? (await Cloud.kdf3($('#ra_p').value, a.salt, a.it)).kek : await kdf($('#ra_p').value, a.salt, a.it)); } catch { addFail(); toast('Kata sandi salah', 'err'); return false; }
    closeM(); await fn(); return false;
  }, false, 'Konfirmasi');
}

/* ---------- Aktivitas & batas waktu sesi ---------- */
['click', 'keydown', 'pointerdown', 'touchstart'].forEach(ev => addEventListener(ev, () => { if (cur && Date.now() - lastT > 5e3) { lastT = Date.now(); Sess.touch(); } }, {passive:true}));
setInterval(() => { if (!cur) return; const s = Sess.get(); if (!s || s.exp < Date.now() || s.abs < Date.now()) Auth.logout(s && s.abs < Date.now() ? 'Sesi maksimal 10 jam berakhir, silakan masuk lagi' : 'Sesi berakhir karena tidak aktif'); }, 15e3);
addEventListener('pagehide', () => { flush(); });

/* ---------- Akun sendiri ---------- */
act('pwEdit', () => {
  const f = (i, l, ac, m) => `<label class="fld"><span>${l}</span><input id="${i}" type="password" class="in" autocomplete="${ac}" maxlength="128" ${m ? 'data-in="pwMeter"' : ''}>${m ? pwMeter() : ''}</label>`;
  modal('Akun: ' + esc(cur.name) + ' (' + RL[cur.role] + ')', `<div class="fgrid">${f('pw_o', 'Kata sandi lama', 'current-password')}${f('pw_n', 'Kata sandi baru', 'new-password', 1)}${f('pw_n2', 'Ulangi kata sandi baru', 'new-password')}</div>`, async () => {
    const n = $('#pw_n').value;
    if (Cloud.on) {
      const me = Cloud.me; let old; try { old = await Cloud.kdf3($('#pw_o').value, me.salt, me.it); await unwrapDEK(me, old.kek); } catch { toast('Kata sandi lama salah', 'err'); return false; }
      const pe = pwCheck(n, cur.u); if (pe) { toast(pe, 'err'); return false; } if (n !== $('#pw_n2').value) { toast('Ulangi kata sandi tidak sama', 'err'); return false; }
      const e = await Cloud.entry(cur.id, cur.u, n), r = await Cloud.rpc('sppd_pw', {p_t:Cloud.token, p_old:old.ah, p:e});
      if (!r.ok) { toast('Kata sandi lama salah', 'err'); return false; }
      Cloud.setMe({...me, salt:e.salt, it:e.it, wiv:e.wiv, wk:e.wk}); Sess.patch({me:Cloud.me}); log('Mengganti kata sandi'); toast('Kata sandi diganti di semua perangkat'); return true;
    }
    const A = getA(), i = A.findIndex(x => x.id === cur.id);
    try { await unwrapDEK(A[i], await kdf($('#pw_o').value, A[i].salt, A[i].it)); } catch { addFail(); toast('Kata sandi lama salah', 'err'); return false; }
    const pe = pwCheck(n, cur.u); if (pe) { toast(pe, 'err'); return false; } if (n !== $('#pw_n2').value) { toast('Ulangi kata sandi tidak sama', 'err'); return false; }
    A[i] = await authEntry(cur.id, cur.u, n); putA(A); log('Mengganti kata sandi'); toast('Kata sandi diganti'); return true;
  }, false, 'Ganti Kata Sandi');
});

/* ---------- Manajemen pengguna (Administrator) ---------- */
const admins = a => a.filter(x => x.role === 'admin' && x.on).length;
let CUL = null;
AFTER.user = () => { if (!Cloud.on) return; Cloud.rpc('sppd_user_list', {p_t:Cloud.token}).then(l => { const j = JSON.stringify(l); if (j !== JSON.stringify(CUL)) { CUL = l; if (RT === 'user') render(); } }).catch(e => toast(e.message, 'err')); };
const cloudRows = () => { const ids = new Set([...(CUL || []).map(x => x.id), ...ACL.map(x => x.id)]); return [...ids].map(id => { const s = (CUL || []).find(x => x.id === id), a = ACL.find(x => x.id === id) || {}; return {id, u:s?.u || a.u, name:a.name || s?.u || a.u, role:s?.role || a.role, on:s ? s.aktif : !!a.on, need:!s || !s.auth, lock:s?.lock}; }); };
pages.user = () => {
  const A = getA();
  if (Cloud.on) { const L = cloudRows(); return `<div class="card">${cardH('Pengguna & Peran', 'shield', b('Jejak Audit', 'audit', {}, 'btn2', 'clock') + b('Tambah Pengguna', 'uEdit', {}, 'btn', 'plus'))}${CUL === null ? '<p class="muted sm">Memuat daftar pengguna dari server…</p>' : ''}${table(['Username', 'Nama', 'Peran', 'Status', 'Aksi'], L.map(u => [`<b>${esc(u.u)}</b>`, esc(u.name), RL[u.role] || '-', !u.on ? '<span class="badge b-bad">Nonaktif</span>' : u.need ? '<span class="badge b-warn">Perlu atur ulang sandi</span>' : u.lock ? '<span class="badge b-warn">Terkunci sementara</span>' : badge('Aktif'), rowAct([iBtn('uEdit', {id:u.id}, 'edit', 'Ubah'), u.id === cur.id ? '' : iBtn('uDel', {id:u.id}, 'trash', 'Hapus', 'ib sm danger')])]))}<div class="info mt-3">${I('cloud')}<span>Peran & status diperiksa di server. Kata sandi tidak pernah dikirim — server hanya menyimpan hash kunci otentikasi & kunci data terbungkus. Mengganti kata sandi pengguna lain langsung mengeluarkan sesinya di semua perangkat.</span></div></div>`; }
  return `<div class="card">${cardH('Pengguna & Peran', 'shield', b('Tambah Pengguna', 'uEdit', {}, 'btn', 'plus'))}<div class="roles"><div><b>${I('shield')}Administrator</b><span>Semua menu, tampilan, pengguna, backup</span></div><div><b>${I('edit')}Operator</b><span>Kelola pegawai, program, SPPD, laporan</span></div><div><b>${I('eye')}Pembaca</b><span>Hanya melihat & mencetak</span></div></div>
  ${table(['Username', 'Nama', 'Peran', 'Status', 'Aksi'], ACL.map(u => { const a = A.find(x => x.id === u.id), need = !a?.wk; return [`<b>${esc(u.u)}</b>`, esc(u.name), RL[u.role], u.on ? (need ? '<span class="badge b-warn">Perlu atur ulang sandi</span>' : badge('Aktif')) : '<span class="badge b-bad">Nonaktif</span>', rowAct([iBtn('uEdit', {id:u.id}, 'edit', 'Ubah'), u.id === cur.id ? '' : iBtn('uDel', {id:u.id}, 'trash', 'Hapus', 'ib sm danger')])]; }))}
  <div class="info mt-3">${I('lock')}<span>Kata sandi tidak pernah disimpan. Setiap akun memegang salinan kunci data yang terbungkus kata sandinya sendiri. Akun bertanda "Perlu atur ulang sandi" berasal dari versi lama — klik Ubah dan isi kata sandi baru.</span></div>
  <div class="warn mt-3">${I('alert')}<span><b>Batas mode lokal:</b> semua akun di browser ini memegang kunci data yang sama dan peran hanya diperiksa oleh aplikasi di browser — bukan pengaman terhadap pengguna yang paham teknis. Bila perlu pembatasan peran yang sungguh-sungguh (Pembaca tidak bisa mengubah data), aktifkan Penyimpanan Cloud: di sana peran diperiksa server.</span></div></div>`;
};
act('uEdit', el => {
  const id = el.dataset.id, u = id ? (Cloud.on ? cloudRows().find(x => x.id === id) : ACL.find(x => x.id === id)) : {role:'operator', on:true}; if (id && !u) return;
  modal(id ? 'Ubah Pengguna' : 'Tambah Pengguna', `<div class="fgrid"><label class="fld"><span>Username</span><input id="x_u" class="in" value="${esc(u.u)}" ${id ? 'readonly' : ''} maxlength="30" autocapitalize="none"></label><label class="fld"><span>Nama</span><input id="x_n" class="in" value="${esc(u.name)}" maxlength="60"></label><label class="fld"><span>Peran</span><select id="x_r" class="in">${Object.keys(RL).map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${RL[r]}</option>`).join('')}</select></label><label class="fld"><span>Status</span><select id="x_a" class="in"><option value="1" ${u.on ? 'selected' : ''}>Aktif</option><option value="0" ${u.on ? '' : 'selected'}>Nonaktif</option></select></label><label class="fld col-span-full"><span>${id ? 'Kata sandi baru (kosongkan jika tidak diubah)' : 'Kata sandi'}</span><input id="x_p" type="password" class="in" autocomplete="new-password" maxlength="128" data-in="pwMeter">${pwMeter()}</label></div>`, async () => {
    const un = id ? u.u : $('#x_u').value.trim().toLowerCase(), pw = $('#x_p').value, role = $('#x_r').value, on = $('#x_a').value === '1', A = getA();
    if (!UNRE.test(un)) { toast('Username 3-30 karakter: huruf kecil, angka, . _ -', 'err'); return false; }
    if (!own(RL, role)) return false;
    if (!id && (ACL.some(x => x.u === un) || A.some(x => x.u === un))) { toast('Username sudah dipakai', 'err'); return false; }
    if (!id || pw) { const pe = pwCheck(pw, un); if (pe) { toast(pe, 'err'); return false; } }
    if (Cloud.on) {
      const ex = (CUL || []).find(x => x.id === id);
      if (!ex && !pw) { toast('Isi kata sandi untuk mengaktifkan akun ini di server', 'err'); return false; }
      if (!id && (CUL || []).some(x => x.u === un)) { toast('Username sudah dipakai', 'err'); return false; }
      const nid = id || uid(), p = {id:nid, u:un, role, aktif:on, ...(pw ? await Cloud.entry(nid, un, pw) : {})};
      try { await Cloud.rpc('sppd_user_put', {p_t:Cloud.token, p}); } catch (e) { toast(/ADMIN/.test(e.message) ? 'Harus ada minimal satu administrator aktif' : 'Gagal menyimpan: ' + e.message, 'err'); return false; }
      const rec = {id:nid, u:un, name:txt($('#x_n').value.trim(), 60) || un, role, on}; const i = ACL.findIndex(x => x.id === nid); if (i >= 0) ACL[i] = rec; else ACL.push(rec);
      await saveACL(); CUL = null; if (nid === cur.id) { cur = {...cur, role, name:rec.name}; document.body.dataset.role = role; }
      log((id ? 'Mengubah' : 'Menambah') + ' pengguna ' + un + ' (' + RL[role] + ')'); toast('Pengguna disimpan'); render(); return true;
    }
    const rest = ACL.filter(x => x.id !== id).concat(role === 'admin' && on ? [{role:'admin', on:true}] : []); if (!admins(rest)) { toast('Harus ada minimal satu administrator aktif', 'err'); return false; }
    const nid = id || uid(), rec = {id:nid, u:un, name:txt($('#x_n').value.trim(), 60) || un, role, on};
    if (id) Object.assign(ACL.find(x => x.id === id), rec); else ACL.push(rec);
    if (pw) { const e = await authEntry(nid, un, pw), i = A.findIndex(x => x.id === nid); if (i >= 0) A[i] = e; else A.push(e); putA(A); }
    await saveACL(); if (id === cur.id) { cur = ACL.find(x => x.id === id); document.body.dataset.role = cur.role; }
    log((id ? 'Mengubah' : 'Menambah') + ' pengguna ' + un + ' (' + RL[role] + ')'); toast('Pengguna disimpan'); render(); return true;
  });
}, 'a');
act('uDel', async el => {
  const id = el.dataset.id; if (id === cur.id) return; const u = Cloud.on ? cloudRows().find(x => x.id === id) : ACL.find(x => x.id === id); if (!u) return;
  if (Cloud.on) {
    if (!(await ask('Hapus pengguna ' + u.u + '? Aksesnya di semua perangkat langsung dicabut.', 'Hapus'))) return;
    try { if ((CUL || []).some(x => x.id === id)) await Cloud.rpc('sppd_user_del', {p_t:Cloud.token, p_id:id}); } catch (e) { return toast(/ADMIN/.test(e.message) ? 'Harus ada minimal satu administrator aktif' : 'Gagal: ' + e.message, 'err'); }
    ACL = ACL.filter(x => x.id !== id); await saveACL(); CUL = null; log('Menghapus pengguna ' + u.u); return render();
  }
  if (!admins(ACL.filter(x => x.id !== id))) return toast('Harus ada minimal satu administrator aktif', 'err');
  if (!(await ask('Hapus pengguna ' + u.u + '? Salinan kunci datanya juga dihapus.', 'Hapus'))) return;
  ACL = ACL.filter(x => x.id !== id); putA(getA().filter(x => x.id !== id)); await saveACL(); log('Menghapus pengguna ' + u.u); render();
}, 'a');

/* Jejak audit server: login, login gagal, perubahan pengguna, ganti sandi (tidak bisa diubah dari browser) */
const AUD = {setup:'Membuat administrator pertama', login:'Masuk', 'login-gagal':'Gagal masuk', 'user-put':'Menambah/mengubah pengguna', 'user-del':'Menghapus pengguna', 'ganti-sandi':'Mengganti kata sandi'};
act('audit', async () => {
  if (!Cloud.on) return;
  try { const L = await Cloud.audit(300); modal('Jejak Audit Server', `<p class="muted sm mb-3">Dicatat oleh server, tidak dapat diubah atau dihapus dari aplikasi. Disimpan 400 hari.</p>${table(['Waktu', 'Pengguna', 'Kejadian', 'Keterangan'], L.map(x => [esc(new Date(x.at).toLocaleString('id-ID')), `<b>${esc(x.u || '-')}</b>`, x.act === 'login-gagal' ? `<span class="badge b-bad">${esc(AUD[x.act])}</span>` : esc(AUD[x.act] || x.act), esc(x.info || '')]), 'keep')}`, null, true); }
  catch (e) { toast(e.message, 'err'); }
}, 'a');

/* ---------- Boot ---------- */
(async () => {
  try { const rm = localStorage.getItem('sppd_mode'); if (rm) document.documentElement.dataset.mode = rm; } catch {}
  if (!window.crypto?.subtle) { document.body.innerHTML = '<div class="nojs">Aplikasi harus dibuka melalui HTTPS (atau localhost) pada browser modern.</div>'; return; }
  applyUI(); post(document.body);
  let u = null; try { u = await Sess.restore(); if (u && !Cloud.on) await Store.loadAll(); } catch (e) { console.warn(e); Vault.key = null; await Sess.clear(); u = null; }
  u ? start(u, false) : view();
})();
