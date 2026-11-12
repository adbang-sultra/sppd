/* ============================================================
   TAMPILAN & TEMA — semua bisa diganti kapan saja (Administrator):
   logo, gambar latar, efek, skema warna, mode, ukuran, sudut, ikon menu.
   Perubahan langsung dipratinjau; tersimpan setelah klik "Simpan Tampilan".
   ============================================================ */
'use strict';
let TDraft = null;
const FXK = () => FX.list.map(f => f[0]);
function cleanIcon(v) {
  if (typeof v === 'string') return v.trim() ? {t:'txt', v:txt(v, 4)} : null;           /* format lama (emoji) */
  if (!v || typeof v !== 'object') return null;
  if (v.t === 'svg' && own(ICONS, v.v)) return {t:'svg', v:v.v};
  if (v.t === 'txt' && String(v.v || '').trim()) return {t:'txt', v:txt(v.v, 4)};
  if (v.t === 'img' && okImg(v.v) && v.v.length < 6e4) return {t:'img', v:v.v};
  return null;
}
function cleanUI(o) {
  const r = {};
  if (own(o, 'appName')) r.appName = txt(o.appName, 40).trim() || BRAND.appName;
  if (own(o, 'subtitle')) r.subtitle = txt(o.subtitle, 60);
  ['logo', 'bg'].forEach(k => { if (own(o, k) && okSrc(o[k])) r[k] = o[k]; });
  if (own(o, 'fx')) r.fx = FXK().includes(o.fx) ? o.fx : o.fx === 'particles' ? 'constellation' : 'none';
  if (own(o, 'preset') && own(PRESETS, o.preset)) r.preset = o.preset;
  if (own(o, 'mode')) r.mode = ['dark', 'light', 'auto'].includes(o.mode) ? o.mode : 'dark';
  ['accent', 'accent2', 'bg0'].forEach(k => { if (own(o, k)) r[k] = hex(o[k], BRAND[k] || '#06121f'); });
  [['fxPower', 10, 100], ['dim', 0, 80], ['blur', 0, 30], ['scale', 85, 120], ['radius', 6, 28]].forEach(([k, a, z]) => { if (own(o, k)) r[k] = clamp(o[k], a, z, BRAND[k]); });
  if (o.icons && typeof o.icons === 'object') { r.icons = {}; M.forEach(m => { const c = own(o.icons, m[0]) && cleanIcon(o.icons[m[0]]); if (c) r.icons[m[0]] = c; }); }
  return r;
}
const UI = () => TDraft || {...BRAND, bg0:PRESETS[BRAND.preset]?.[3] || '#06121f', ...(D.cfg.ui || {})};
const localMode = () => { try { return localStorage.getItem('sppd_mode') || ''; } catch { return ''; } };
const effMode = u => { const m = localMode() || u.mode; return m === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : (m === 'light' ? 'light' : 'dark'); };
function applyUI(u = UI()) {
  const s = document.documentElement.style, bg = okSrc(u.bg), lg = okSrc(u.logo), mode = effMode(u);
  document.documentElement.dataset.mode = mode;
  s.setProperty('--ac', hex(u.accent)); s.setProperty('--ac2', hex(u.accent2, '#6366f1')); s.setProperty('--bg0', hex(u.bg0, '#06121f'));
  s.setProperty('--dim', clamp(u.dim, 0, 80, 35) / 100); s.setProperty('--blur', clamp(u.blur, 0, 30, 16) + 'px');
  s.setProperty('--scale', clamp(u.scale, 85, 120, 100) / 100); s.setProperty('--rad', clamp(u.radius, 6, 28, 18) + 'px');
  $$('.brandName').forEach(e => e.textContent = u.appName); $$('.brandSub').forEach(e => e.textContent = u.subtitle || '');
  $$('.brandLogo').forEach(e => { if (lg) e.src = lg; });
  if (lg) $('#fav').href = lg;
  $('#bgimg').style.backgroundImage = bg ? `url("${bg}")` : 'none';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', mode === 'light' ? '#f1f5f9' : hex(u.bg0, '#06121f'));
  const mi = $('[data-act="togMode"]'); if (mi) mi.innerHTML = I(mode === 'light' ? 'moon' : 'sun');
  FX.set(u.fx, u.fxPower, u.accent, u.accent2);
}
act('togMode', () => { const n = document.documentElement.dataset.mode === 'light' ? 'dark' : 'light'; try { localStorage.setItem('sppd_mode', n); } catch {} applyUI(); });
matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => applyUI());

/* ---------- Halaman Tampilan & Tema ---------- */
const draft = () => TDraft || (TDraft = structuredClone(UI()));
const prev = () => { applyUI(TDraft); };
const rng = (k, l, a, z, unit = '') => `<label class="fld"><span>${l} <b class="rv" id="rv_${k}">${draft()[k]}${unit}</b></span><input type="range" min="${a}" max="${z}" value="${draft()[k]}" data-in="uiRange" data-k="${k}" data-u="${unit}" class="range"></label>`;
pages.tampil = () => {
  const u = draft();
  return `<div class="dgrid g2 tm">
  <div class="card">${cardH('Identitas Aplikasi', 'sparkles')}<div class="fgrid"><label class="fld"><span>Nama aplikasi</span><input class="in" maxlength="40" value="${esc(u.appName)}" data-in="uiTxt" data-k="appName"></label><label class="fld"><span>Subjudul (layar masuk)</span><input class="in" maxlength="60" value="${esc(u.subtitle || '')}" data-in="uiTxt" data-k="subtitle"></label></div>
    <div class="upl mt-3"><div class="upl-p"><img data-src="${esc(u.logo)}" alt="Logo"></div><div><b>Logo aplikasi</b><p class="muted sm">PNG/JPG/WebP — dipakai di menu, layar masuk & ikon tab.</p><div class="stack"><label class="btn2 file">${I('upload')}<span>Ganti logo</span><input type="file" accept="image/png,image/jpeg,image/webp" data-ch="uiImg" data-k="logo" hidden></label>${b('Bawaan', 'uiResetImg', {k:'logo'}, 'btn2', 'refresh')}</div><label class="chk mt-2"><input type="checkbox" id="u_kop" checked> Pakai juga sebagai logo kop surat</label></div></div></div>
  <div class="card">${cardH('Skema Warna', 'palette')}<div class="swatches">${Object.entries(PRESETS).map(([k, p]) => `<button class="sw ${u.preset === k ? 'on' : ''}" data-act="uiPreset" data-k="${k}" title="${esc(p[0])}"><i class="sw-c" data-c1="${p[1]}" data-c2="${p[2]}"></i><span>${esc(p[0])}</span></button>`).join('')}</div>
    <div class="fgrid g3 mt-3"><label class="fld"><span>Warna utama</span><input type="color" class="in clr" value="${hex(u.accent)}" data-in="uiClr" data-k="accent"></label><label class="fld"><span>Warna sekunder</span><input type="color" class="in clr" value="${hex(u.accent2)}" data-in="uiClr" data-k="accent2"></label><label class="fld"><span>Warna dasar latar</span><input type="color" class="in clr" value="${hex(u.bg0, '#06121f')}" data-in="uiClr" data-k="bg0"></label></div>
    <div class="fld mt-3"><span>Mode tampilan bawaan</span><div class="segs">${[['dark', 'Gelap', 'moon'], ['light', 'Terang', 'sun'], ['auto', 'Ikuti perangkat', 'refresh']].map(([k, l, ic]) => `<button class="seg ${u.mode === k ? 'on' : ''}" data-act="uiMode" data-k="${k}">${I(ic)}<span>${l}</span></button>`).join('')}</div><small class="muted">Setiap pengguna tetap bisa beralih mode lewat tombol ${I('moon')} di atas.</small></div></div>
  <div class="card span2">${cardH('Latar & Efek Interaktif', 'image')}<div class="bgrow"><div class="upl"><div class="upl-p wide"><img data-src="${esc(u.bg)}" alt="Latar"></div><div><b>Gambar latar</b><p class="muted sm">PNG/JPG/WebP hingga 8 MB (otomatis diperkecil ke 1920 px). Gerakkan kursor/ponsel: latar bergerak (parallax).</p><div class="stack"><label class="btn2 file">${I('upload')}<span>Ganti latar</span><input type="file" accept="image/png,image/jpeg,image/webp" data-ch="uiImg" data-k="bg" hidden></label>${b('Bawaan', 'uiResetImg', {k:'bg'}, 'btn2', 'refresh')}${b('Tanpa gambar', 'uiNoBg', {}, 'btn2', 'x')}</div></div></div></div>
    <div class="fxs mt-3">${FX.list.map(([k, l, d]) => `<button class="fxo ${u.fx === k ? 'on' : ''}" data-act="uiFx" data-k="${k}"><span class="fxp fx-${k}"></span><b>${l}</b><small>${d}</small></button>`).join('')}</div>
    ${FX.low ? `<div class="warn mt-3">${I('alert')}<span>Efek bergerak dijeda otomatis di perangkat ini karena terasa berat (latar tetap tampil diam). Pengaturan ini hanya berlaku untuk perangkat ini. ${b('Aktifkan lagi', 'fxWake', {}, 'lnk', 'refresh')}</span></div>` : ''}<div class="fgrid g3 mt-3">${rng('fxPower', 'Intensitas efek', 10, 100, '%')}${rng('dim', 'Gelapkan latar', 0, 80, '%')}${rng('blur', 'Efek kaca (blur)', 0, 30, 'px')}</div></div>
  <div class="card">${cardH('Ukuran & Bentuk', 'grid')}<div class="fgrid">${rng('scale', 'Ukuran tampilan', 85, 120, '%')}${rng('radius', 'Kelengkungan sudut', 6, 28, 'px')}</div><p class="muted sm mt-2">Ukuran menyesuaikan lebar layar secara otomatis (proporsional), nilai ini adalah pengali tambahan.</p></div>
  <div class="card">${cardH('Ikon Menu', 'star')}<p class="muted sm mb-2">Klik ikon untuk mengganti: ikon garis bawaan, emoji/teks, atau gambar sendiri.</p><div class="icgrid">${M.map(m => `<button class="icb" data-act="uiIcon" data-k="${m[0]}"><span class="nvi">${menuIco(m[0])}</span><small>${esc(m[1])}</small></button>`).join('')}</div></div>
  <div class="card span2 sticky-act"><div class="actions">${b('Simpan Tampilan', 'saveUI', {}, 'btn', 'check')}${b('Batalkan perubahan', 'cancelUI', {}, 'btn2', 'x')}${b('Ekspor tema', 'expUI', {}, 'btn2', 'download')}<label class="btn2 file">${I('upload')}<span>Impor tema</span><input type="file" accept=".json,application/json" data-ch="impUI" hidden></label><span class="grow"></span>${b('Reset ke bawaan', 'resetUI', {}, 'btnd', 'refresh')}</div></div></div>`;
};
AFTER.tampil = () => { $$('.sw-c').forEach(e => { e.style.setProperty('--c1', e.dataset.c1); e.style.setProperty('--c2', e.dataset.c2); }); };
const rerenderKeep = () => { const y = $('#main').scrollTop; render(); $('#main').scrollTop = y; };
CH.uiTxt = el => { draft()[el.dataset.k] = txt(el.value, 60); prev(); };
CH.uiClr = el => { const d = draft(); d[el.dataset.k] = hex(el.value); d.preset = ''; prev(); $$('.sw').forEach(x => x.classList.remove('on')); };
CH.uiRange = el => { draft()[el.dataset.k] = +el.value; const v = $('#rv_' + el.dataset.k); if (v) v.textContent = el.value + el.dataset.u; prev(); };
act('uiPreset', el => { const p = PRESETS[el.dataset.k]; if (!p) return; Object.assign(draft(), {preset:el.dataset.k, accent:p[1], accent2:p[2], bg0:p[3]}); prev(); rerenderKeep(); }, 'a');
act('uiMode', el => { draft().mode = el.dataset.k; try { localStorage.removeItem('sppd_mode'); } catch {} prev(); rerenderKeep(); }, 'a');
act('fxWake', () => { FX.wake(); rerenderKeep(); });
act('uiFx', el => { draft().fx = el.dataset.k; prev(); rerenderKeep(); }, 'a');
act('uiResetImg', el => { draft()[el.dataset.k] = BRAND[el.dataset.k]; prev(); rerenderKeep(); }, 'a');
act('uiNoBg', () => { draft().bg = ''; prev(); rerenderKeep(); }, 'a');
onCh('uiImg', async el => {
  const k = el.dataset.k, f = el.files[0]; if (!f || !['logo', 'bg'].includes(k)) return;
  try {
    let v = k === 'bg' ? await reencode(f, 1920, 'image/jpeg', .8) : await reencode(f, 256, 'image/png');
    if (k === 'bg' && v.length > 9e5) v = await reencode(f, 1440, 'image/jpeg', .72);
    if (k === 'logo' && v.length > 2e5) v = await reencode(f, 192, 'image/webp', .9);
    draft()[k] = v; if (k === 'logo' && $('#u_kop')?.checked) TDraft._kop = v;
    prev(); rerenderKeep(); toast('Pratinjau diperbarui — klik Simpan Tampilan untuk menyimpan');
  } catch (e) { toast(e.message, 'err'); }
}, 'a');
act('saveUI', () => {
  const d = draft(), kop = d._kop; delete d._kop;
  D.cfg.ui = cleanUI(d); if (kop) D.cfg.logo = okImg(kop);
  if (save('cfg')) { TDraft = null; log('Memperbarui tampilan'); toast('Tampilan disimpan'); applyUI(); render(); }
}, 'a');
act('cancelUI', () => { TDraft = null; applyUI(); render(); toast('Perubahan dibatalkan'); });
act('resetUI', async () => { if (!(await ask('Kembalikan seluruh tampilan (warna, logo, latar, efek, ikon) ke bawaan?', 'Reset'))) return; delete D.cfg.ui; TDraft = null; save('cfg'); log('Reset tampilan'); applyUI(); render(); }, 'a');
act('expUI', () => { const d = cleanUI(draft()); dl('tema_sppd.json', JSON.stringify({app:'sim-sppd-theme', v:1, ui:d}, null, 1), 'application/json'); });
onCh('impUI', async el => {
  const f = el.files[0]; el.value = ''; if (!f) return; if (f.size > 3e6) return toast('File tema terlalu besar', 'err');
  try { const j = JSON.parse(await f.text()); if (j.app !== 'sim-sppd-theme' || !j.ui) throw 0; TDraft = {...UI(), ...cleanUI(j.ui)}; prev(); rerenderKeep(); toast('Tema dimuat — klik Simpan Tampilan'); }
  catch { toast('File tema tidak valid', 'err'); }
}, 'a');

/* Pemilih ikon menu */
let ICK = '';
act('uiIcon', el => {
  ICK = el.dataset.k; const m = M.find(x => x[0] === ICK); if (!m) return; const cur = draft().icons?.[ICK];
  modal('Ikon: ' + esc(m[1]), `<div class="sec">${I('star')}<span>Ikon garis bawaan</span></div><div class="icpick">${Object.keys(ICONS).map(n => `<button class="icb sm ${cur?.t === 'svg' && cur.v === n || (!cur && m[2] === n) ? 'on' : ''}" data-act="icSet" data-t="svg" data-v="${n}" title="${n}">${I(n)}</button>`).join('')}</div>
  <div class="sec mt-3">${I('sparkles')}<span>Emoji / teks (maks 4 karakter)</span></div><div class="ig"><input id="icTxt" class="in" maxlength="4" value="${esc(cur?.t === 'txt' ? cur.v : '')}" placeholder="mis. 🧾">${b('Pakai', 'icTxt', {}, 'btn2', 'check')}</div>
  <div class="sec mt-3">${I('image')}<span>Gambar sendiri (PNG/JPG/WebP)</span></div><div class="stack"><label class="btn2 file">${I('upload')}<span>Unggah ikon</span><input type="file" accept="image/png,image/jpeg,image/webp" data-ch="icImg" hidden></label>${b('Kembalikan bawaan', 'icSet', {t:'def'}, 'btn2', 'refresh')}</div>`);
}, 'a');
const setIcon = v => { const d = draft(); d.icons = {...(d.icons || {})}; if (v) d.icons[ICK] = v; else delete d.icons[ICK]; closeM(); prev(); rerenderKeep(); };
act('icSet', el => setIcon(el.dataset.t === 'def' ? null : cleanIcon({t:el.dataset.t, v:el.dataset.v})), 'a');
act('icTxt', () => { const v = $('#icTxt').value.trim(); if (!v) return toast('Isi emoji/teks', 'err'); setIcon(cleanIcon({t:'txt', v})); }, 'a');
onCh('icImg', async el => { const f = el.files[0]; if (!f) return; try { setIcon(cleanIcon({t:'img', v:await reencode(f, 96, 'image/png')})); } catch (e) { toast(e.message, 'err'); } }, 'a');
