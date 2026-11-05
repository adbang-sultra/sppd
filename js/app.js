/* ============================================================
   APLIKASI: data pegawai, program, SPPD, cetak, rekap, pengaturan, backup.
   ============================================================ */
'use strict';
const log = m => { D.log.unshift({t:new Date().toLocaleString('id-ID'), u:Auth.user()?.u || '-', m:txt(m, 200)}); D.log = D.log.slice(0, 300); save('log'); };
const emp = id => D.emp.find(e => e.id === id);
const stRep = id => { const r = D.rep.find(x => x.sppdId === id); return r ? (r.status === 'selesai' ? 'Selesai' : 'Draft') : 'Belum dibuat'; };
const uniq = (a, k) => [...new Set(a.map(x => x[k]).filter(Boolean))].sort();
const canW = () => Auth.can('w'), isA = () => Auth.can('a');

/* ---------- Definisi field ---------- */
const F = {
  emp:[['nama','Nama Lengkap','text',1],['nip','NIP','text',1],['pangkat','Pangkat','text',1],['gol','Golongan','text',1],['jabatan','Jabatan','text',1],['jk','Jenis Kelamin',['Laki-laki','Perempuan'],1],['telp','Nomor Telepon','text',1],['unit','Unit Kerja','text',1],['status','Status Pegawai',['PNS','PPPK','Honorer','Lainnya'],1]],
  prog:[['ta','Tahun Anggaran','number',1],['program','Program','text',1],['kdProgram','Kode Program','text'],['kegiatan','Kegiatan','text',1],['kdKegiatan','Kode Kegiatan','text'],['sub','Subkegiatan','text'],['kdSub','Kode Subkegiatan','text'],['rek','Kode Rekening','text',1],['sumber','Sumber Dana','text'],['pagu','Pagu Anggaran','number'],['unit','Unit Kerja','text']]
};
const SF = ['no','tgl','stNo','stTgl','dasar','pejabat','empId','maksud','alat','asal','tujuan','inst','tingkat','tb','tk','progId','mata','ket'];
const RF = ['no','latar','dasar','mt','wkt','keg','hasil','kes','tl','penutup','tgl','h1','h2','h3'];
const CF = [['instansi','Nama Instansi'],['prov','Provinsi'],['kab','Kabupaten/Kota'],['kec','Kecamatan'],['desa','Desa/Kelurahan'],['alamat','Alamat'],['telp','Nomor Telepon'],['pejabat','Nama Pejabat'],['nip','NIP Pejabat'],['jabatan','Jabatan Penandatangan'],['ta','Tahun Anggaran'],['prefix','Awalan Nomor SPPD']];

/* ---------- Pembersih data per koleksi ---------- */
const withId = o => okId(o.id) ? o.id : uid();
CLEAN.emp = v => arr(v).map(o => ({id:withId(o), ...pick(o, F.emp.map(f => f[0]))}));
CLEAN.prog = v => arr(v).map(o => ({id:withId(o), ...pick(o, F.prog.map(f => f[0]))}));
CLEAN.sppd = v => arr(v).map(o => { const r = {id:withId(o), ...pick(o, SF, 1000)}; ['tgl','stTgl','tb','tk'].forEach(k => r[k] = okDate(r[k])); ['empId','progId'].forEach(k => r[k] = okId(r[k]) ? r[k] : ''); r.fol = arr(o.fol, 50).map(f => pick(f, ['nama','nip','gol','jabatan'])); r.bud = o.bud && typeof o.bud === 'object' ? pick(o.bud, ['ta','program','kegiatan','sub','rek','sumber']) : null; return r; });
CLEAN.rep = v => arr(v).map(o => ({id:withId(o), sppdId:okId(o.sppdId) ? o.sppdId : '', status:o.status === 'selesai' ? 'selesai' : 'draft', ...pick(o, RF, 8000), tgl:okDate(o.tgl), foto:(Array.isArray(o.foto) ? o.foto : []).map(okImg).filter(Boolean).slice(0, 6)}));
CLEAN.log = v => arr(v, 300).map(o => pick(o, ['t','u','m'], 300));
CLEAN.cfg = v => { v = v && typeof v === 'object' ? v : {}; const r = {...structuredClone(DEF.cfg), ...pick(v, CF.map(c => c[0]), 200), logo:okImg(v.logo)}; if (v.ui && typeof v.ui === 'object') r.ui = cleanUI(v.ui); return r; };

/* ---------- Status & filter ---------- */
const ST = {emp:{q:'', pg:1, jk:'', gol:'', jab:''}, prog:{q:'', pg:1, ta:''}, sppd:{q:'', pg:1, st:'', a:'', b:'', e:''}, rekap:{a:'', b:'', e:'', t:''}, cetak:{id:'', v:'all'}, lap:{id:''}};
const setST = (k, f, v) => { if (own(ST, k) && own(ST[k], f) && f !== 'pg') { ST[k][f] = txt(v, 100); if (own(ST[k], 'pg')) ST[k].pg = 1; } };
const pager = (k, n) => { const p = Math.max(1, Math.ceil(n / PS)); ST[k].pg = Math.min(ST[k].pg, p); return `<div class="pager"><span>${n} data</span><span class="pg">${b('', 'pg', {k, d:-1}, 'ib sm', 'chevl')}<b>${ST[k].pg} / ${p}</b>${b('', 'pg', {k, d:1}, 'ib sm', 'chevr')}</span></div>`; };
act('pg', el => { const k = el.dataset.k; if (own(ST, k)) { ST[k].pg = Math.max(1, ST[k].pg + (el.dataset.d === '1' ? 1 : -1)); render(); } });
const sl = (k, a) => a.slice((ST[k].pg - 1) * PS, ST[k].pg * PS);
const sel = (k, f, opts, lb) => `<select class="in sm" data-ch="filt" data-k="${k}" data-f="${f}" aria-label="${esc(lb)}"><option value="">${esc(lb)}</option>${opts.map(o => `<option ${ST[k][f] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
const selE = (k, f) => `<select class="in sm" data-ch="filt" data-k="${k}" data-f="${f}" aria-label="Pegawai"><option value="">Semua Pegawai</option>${D.emp.map(e => `<option value="${esc(e.id)}" ${ST[k][f] === e.id ? 'selected' : ''}>${esc(e.nama)}</option>`).join('')}</select>`;
const inp = (k, f, ph, t = 'text') => t === 'date'
  ? `<input type="date" class="in sm" value="${esc(ST[k][f])}" data-ch="filt" data-k="${k}" data-f="${f}" aria-label="${esc(ph || 'Tanggal')}">`
  : `<div class="srch">${I('search')}<input type="search" class="in sm" value="${esc(ST[k][f])}" placeholder="${esc(ph)}" data-in="filtLive" data-k="${k}" data-f="${f}" aria-label="${esc(ph)}"></div>`;
onCh('filt', el => { setST(el.dataset.k, el.dataset.f, el.value); render(); });
let liveT; CH.filtLive = el => { clearTimeout(liveT); liveT = setTimeout(() => { const {k, f} = el.dataset; setST(k, f, el.value); render(); const n = $(`[data-in="filtLive"][data-k="${k}"][data-f="${f}"]`); if (n) { n.focus(); const l = n.value.length; try { n.setSelectionRange(l, l); } catch {} } }, 260); };

/* ---------- Komponen form ---------- */
const fld = (f, v) => { const [k, l, t, r] = f; return `<label class="fld"><span>${esc(l)}${r ? ' <i class="req">*</i>' : ''}</span>${Array.isArray(t) ? `<select id="f_${k}" class="in">${t.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>` : `<input id="f_${k}" type="${t}" value="${esc(v)}" class="in" maxlength="300" ${t === 'number' ? 'inputmode="numeric"' : ''}>`}</label>`; };
const secH = (t, ic) => `<div class="sec col-span-full">${I(ic)}<span>${t}</span></div>`;
const cardH = (t, ic, right = '') => `<div class="card-h"><div class="card-t">${ic ? `<span class="ci">${I(ic)}</span>` : ''}<b>${t}</b></div>${right}</div>`;
const rowAct = (items) => `<div class="ra">${items.filter(Boolean).join('')}</div>`;
const iBtn = (a, data, ic, tip, cls = 'ib sm') => `<button class="${cls}" data-act="${a}"${Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('')} title="${esc(tip)}" aria-label="${esc(tip)}">${I(ic)}</button>`;

/* ---------- CRUD umum ---------- */
const NM = {emp:'pegawai', prog:'program/kegiatan', sppd:'SPPD'};
function upsert(k, id, o) { if (id) Object.assign(D[k].find(x => x.id === id), o); else D[k].push({id:uid(), ...o}); if (save(k)) { log((id ? 'Memperbarui ' : 'Menambah ') + NM[k] + ': ' + (o.nama || o.kegiatan || o.no)); toast('Data tersimpan'); } render(); }
function edit(k, id) {
  if (!own(F, k)) return; const d = id ? D[k].find(x => x.id === id) : {}; if (id && !d) return;
  modal((id ? 'Ubah ' : 'Tambah ') + NM[k], `<div class="fgrid">${F[k].map(f => fld(f, d[f[0]] ?? (f[0] === 'ta' ? D.cfg.ta : ''))).join('')}</div>`, () => {
    const o = {}; for (const f of F[k]) { o[f[0]] = txt($('#f_' + f[0]).value.trim()); if (f[3] && !o[f[0]]) { toast(f[1] + ' wajib diisi', 'err'); return false; } }
    if (k === 'emp') { if (o.telp !== '-' && !/^[0-9+\-\s()]{6,20}$/.test(o.telp)) { toast('Nomor telepon tidak valid (isi "-" bila tidak ada)', 'err'); return false; } if (D.emp.some(e => e.nip === o.nip && e.id !== id)) { toast('NIP sudah terdaftar', 'err'); return false; } }
    if (o.pagu && !/^\d{0,15}(\.\d+)?$/.test(o.pagu)) { toast('Pagu harus berupa angka', 'err'); return false; }
    upsert(k, id, o); return true;
  });
}
async function del(k, id) {
  if (!own(NM, k)) return;
  if (k === 'emp' && D.sppd.some(s => s.empId === id)) return toast('Pegawai dipakai pada SPPD, tidak dapat dihapus', 'err');
  if (k === 'prog' && D.sppd.some(s => s.progId === id) && !(await ask('Program dipakai SPPD (data SPPD tetap menyimpan salinan). Lanjutkan hapus?'))) return;
  if (!(await ask('Yakin menghapus data ' + NM[k] + ' ini?', 'Hapus'))) return;
  if (k === 'sppd') { D.rep = D.rep.filter(r => r.sppdId !== id); save('rep'); }
  D[k] = D[k].filter(x => x.id !== id); save(k); log('Menghapus data ' + NM[k]); toast('Data dihapus'); render();
}
function detail(k, id) { const d = D[k].find(x => x.id === id); if (!d) return; modal('Detail ' + NM[k], `<div class="kv">${F[k].map(f => `<div><span>${esc(f[1])}</span><b>${esc(d[f[0]]) || '-'}</b></div>`).join('')}</div>`); }
act('edit', el => edit(el.dataset.k, el.dataset.id), 'w');
act('del', el => del(el.dataset.k, el.dataset.id), 'w');
act('detail', el => detail(el.dataset.k, el.dataset.id));

/* ---------- Impor / ekspor CSV ---------- */
let impK = '';
act('impCSV', el => { if (!own(F, el.dataset.k)) return; impK = el.dataset.k; $('#fcsv').value = ''; $('#fcsv').click(); }, 'w');
$('#fcsv').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f || !canW() || !own(F, impK)) return;
  if (f.size > 2e6) return toast('File terlalu besar (maks 2 MB)', 'err');
  const rows = parseCSV(await f.text()); if (rows.length < 2) return toast('File kosong', 'err');
  const fs = F[impK], h = rows[0].map(x => x.trim().replace(/^﻿/, '').toLowerCase());
  const idx = fs.map(x => h.findIndex(y => y === x[0].toLowerCase() || y === x[1].toLowerCase()));
  let ok = 0, skip = 0;
  rows.slice(1, 5001).forEach(r => {
    const o = {}; fs.forEach((x, i) => o[x[0]] = idx[i] >= 0 ? txt((r[idx[i]] || '').trim().replace(/^'(?=[=+\-@])/, '')) : '');
    if (fs.some(x => x[3] && !o[x[0]]) || (impK === 'emp' && D.emp.some(e => e.nip === o.nip))) { skip++; return; }
    D[impK].push({id:uid(), ...o}); ok++;
  });
  if (save(impK)) { log(`Impor CSV ${NM[impK]}: ${ok} data`); toast(`Berhasil ${ok}, dilewati ${skip}`); } render();
});
const expCSV = k => dl(k + '.csv', toCSV([F[k].map(f => f[1]), ...D[k].map(d => F[k].map(f => d[f[0]]))]));
act('expCSV', el => own(F, el.dataset.k) && expCSV(el.dataset.k));

/* ---------- Halaman ---------- */
const pages = {};
const bars = e => { const mx = Math.max(1, ...e.map(x => x[1])); return e.length ? `<div class="bars">${e.map(([k, v]) => `<div class="bar"><span class="bl" title="${esc(k)}">${esc(k)}</span><span class="bt"><i data-w="${v / mx * 100}"></i></span><b>${v}</b></div>`).join('')}</div>` : '<p class="muted sm">Belum ada data</p>'; };
const grp = (a, fn) => { const m = {}; a.forEach(s => { const k = fn(s) || '-'; m[k] = m[k] || {n:0, d:0}; m[k].n++; m[k].d += lama(s.tb, s.tk); }); return Object.entries(m).sort((x, y) => y[1].n - x[1].n); };
const kpi = (l, v, ic, sub, tone = 0) => `<div class="kpi t${tone}"><span class="kpi-i">${I(ic)}</span><div><div class="kpi-v" data-count="${v}">0</div><div class="kpi-l">${esc(l)}</div>${sub ? `<div class="kpi-s">${sub}</div>` : ''}</div></div>`;

pages.dash = () => {
  const y = new Date().getFullYear(), m = today().slice(0, 7), S = D.sppd, t = today(), u = Auth.user(), hr = new Date().getHours();
  const L = D.emp.filter(e => e.jk === 'Laki-laki').length, P = D.emp.filter(e => e.jk === 'Perempuan').length, tot = D.emp.length;
  const bln = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'].map((n, i) => [n, S.filter(s => s.tb.slice(0, 4) == y && +s.tb.slice(5, 7) === i + 1).length]);
  const mx = Math.max(1, ...bln.map(x => x[1])), cm = new Date().getMonth();
  const run = S.filter(s => s.tb <= t && s.tk >= t), noRep = S.filter(s => stRep(s.id) !== 'Selesai').length;
  return `<section class="hero">
    <div class="hero-txt"><div class="hello">${hr < 11 ? 'Selamat pagi' : hr < 15 ? 'Selamat siang' : hr < 18 ? 'Selamat sore' : 'Selamat malam'},</div><h2>${esc(u?.name)}</h2><p>${esc(dt(t))} · ${esc(D.cfg.instansi)}</p>
      <div class="hero-act">${canW() ? b('SPPD Baru', 'go', {r:'form'}, 'btn', 'plus') : ''}${b('Cetak Dokumen', 'go', {r:'cetak'}, 'btn2 glass', 'printer')}${b('Rekapitulasi', 'go', {r:'rekap'}, 'btn2 glass', 'chart')}</div></div>
    <div class="hero-art" aria-hidden="true">${I('plane', 'hp')}<svg class="hero-path" viewBox="0 0 300 120"><path d="M5 110 C 80 100, 120 20, 295 12"/></svg></div>
  </section>
  <div class="kpis">${kpi('Total Pegawai', tot, 'users', `${L} laki-laki · ${P} perempuan`, 0)}${kpi('SPPD Diterbitkan', S.length, 'receipt', `${S.filter(s => s.tgl.slice(0, 7) === m).length} bulan ini`, 1)}${kpi('Sedang Bertugas', run.length, 'plane', run.length ? esc(run.slice(0, 2).map(s => emp(s.empId)?.nama || '').join(', ')) : 'Tidak ada perjalanan hari ini', 2)}${kpi('Laporan Belum Selesai', noRep, 'file', noRep ? 'Perlu dilengkapi' : 'Semua lengkap', 3)}</div>
  <div class="dgrid">
    <div class="card span2">${cardH('Perjalanan per Bulan ' + y, 'calendar', `<span class="chip">${S.filter(s => s.tb.slice(0, 4) == y).length} perjalanan</span>`)}<div class="cols">${bln.map(([n, v], i) => `<div class="colw ${i === cm ? 'now' : ''}" title="${n}: ${v}"><span class="cv">${v || ''}</span><span class="ct"><i data-w="${v / mx * 100}"></i></span><span class="cl">${n}</span></div>`).join('')}</div></div>
    <div class="card">${cardH('Komposisi Pegawai', 'users')}<div class="donutw"><div class="donut" data-p="${tot ? L / tot * 100 : 0}"><div><b data-count="${tot}">0</b><span>pegawai</span></div></div><ul class="lg2"><li><i class="d1"></i>Laki-laki <b>${L}</b></li><li><i class="d2"></i>Perempuan <b>${P}</b></li></ul></div></div>
    <div class="card">${cardH('Tujuan Terbanyak', 'pin')}${bars(grp(S, s => s.tujuan).slice(0, 5).map(x => [x[0], x[1].n]))}</div>
    <div class="card">${cardH('Per Tahun', 'chart')}${bars(grp(S, s => s.tb.slice(0, 4)).map(x => [x[0], x[1].n]))}</div>
    <div class="card">${cardH('Aktivitas Terbaru', 'clock')}<ul class="tl">${D.log.slice(0, 7).map(l => `<li><b>${esc(l.m)}</b><span>${esc(l.t)}${l.u ? ' · ' + esc(l.u) : ''}</span></li>`).join('') || '<li class="muted">Belum ada aktivitas</li>'}</ul></div>
    <div class="card span2">${cardH('SPPD Terbaru', 'receipt', b('Lihat semua', 'go', {r:'sppd'}, 'lnk', 'chevr'))}${table(['Nomor', 'Pegawai', 'Tujuan', 'Berangkat', 'Kembali', 'Laporan'], S.slice(-5).reverse().map(s => [esc(s.no), esc(emp(s.empId)?.nama), esc(s.tujuan), dts(s.tb), dts(s.tk), badge(stRep(s.id))]))}</div>
    <div class="card">${cardH('Pegawai Terbaru', 'user', b('Semua', 'go', {r:'emp'}, 'lnk', 'chevr'))}<ul class="plist">${D.emp.slice(-5).reverse().map(e => `<li><span class="av">${esc((e.nama || '?').replace(/^(H|DR|Dr|Ir)\.?\s+/i, '').trim().charAt(0))}</span><div><b>${esc(e.nama)}</b><span>${esc(e.jabatan)} · ${esc(e.gol)}</span></div></li>`).join('') || '<li class="muted">Belum ada data</li>'}</ul></div>
  </div>`;
};

pages.emp = () => {
  const s = ST.emp, q = s.q.toLowerCase();
  const a = D.emp.filter(e => (!q || (e.nama + e.nip).toLowerCase().includes(q)) && (!s.jk || e.jk === s.jk) && (!s.gol || e.gol === s.gol) && (!s.jab || e.jabatan === s.jab)).sort((x, y) => x.nama.localeCompare(y.nama));
  return `<div class="card"><div class="toolbar">${inp('emp', 'q', 'Cari nama / NIP')}${sel('emp', 'gol', uniq(D.emp, 'gol'), 'Semua Golongan')}${sel('emp', 'jab', uniq(D.emp, 'jabatan'), 'Semua Jabatan')}${sel('emp', 'jk', ['Laki-laki', 'Perempuan'], 'Semua JK')}<span class="grow"></span>${canW() ? b('Impor', 'impCSV', {k:'emp'}, 'btn2', 'upload') : ''}${b('Ekspor', 'expCSV', {k:'emp'}, 'btn2', 'download')}${canW() ? b('Tambah Pegawai', 'edit', {k:'emp'}, 'btn', 'plus') : ''}</div>
  ${table(['No', 'Nama', 'NIP', 'Pangkat/Gol', 'Jabatan', 'JK', 'Telp', 'Aksi'], sl('emp', a).map((e, i) => [(s.pg - 1) * PS + i + 1, `<b>${esc(e.nama)}</b>`, esc(e.nip), esc(e.pangkat + ' / ' + e.gol), esc(e.jabatan), esc(e.jk), esc(e.telp), rowAct([iBtn('detail', {k:'emp', id:e.id}, 'eye', 'Detail'), canW() && iBtn('edit', {k:'emp', id:e.id}, 'edit', 'Ubah'), canW() && iBtn('del', {k:'emp', id:e.id}, 'trash', 'Hapus', 'ib sm danger')])]))}${pager('emp', a.length)}</div>`;
};
pages.prog = () => {
  const s = ST.prog, q = s.q.toLowerCase();
  const a = D.prog.filter(p => (!q || (p.program + p.kegiatan + p.sub + p.rek).toLowerCase().includes(q)) && (!s.ta || String(p.ta) === s.ta));
  return `<div class="card"><div class="toolbar">${inp('prog', 'q', 'Cari program / kegiatan')}${sel('prog', 'ta', uniq(D.prog, 'ta').map(String), 'Semua Tahun')}<span class="grow"></span>${canW() ? b('Impor', 'impCSV', {k:'prog'}, 'btn2', 'upload') : ''}${b('Ekspor', 'expCSV', {k:'prog'}, 'btn2', 'download')}${canW() ? b('Tambah', 'edit', {k:'prog'}, 'btn', 'plus') : ''}</div>
  ${table(['TA', 'Program', 'Kegiatan', 'Subkegiatan', 'Rekening', 'Sumber Dana', 'Pagu', 'Aksi'], sl('prog', a).map(p => [esc(p.ta), esc(p.kdProgram + ' ' + p.program), esc(p.kdKegiatan + ' ' + p.kegiatan), esc(p.kdSub + ' ' + p.sub), esc(p.rek), esc(p.sumber), Number(p.pagu || 0).toLocaleString('id-ID'), rowAct([canW() && iBtn('edit', {k:'prog', id:p.id}, 'edit', 'Ubah'), canW() && iBtn('del', {k:'prog', id:p.id}, 'trash', 'Hapus', 'ib sm danger')])]))}${pager('prog', a.length)}</div>`;
};

/* ---------- SPPD ---------- */
let FOL = [], SID = null;
const numAuto = () => { let n = D.sppd.length + 1, x; do { x = String(n++).padStart(3, '0') + '/' + (D.cfg.prefix || 'SPPD') + '/' + new Date().getFullYear(); } while (D.sppd.some(s => s.no === x)); return x; };
function openSppd(id) {
  const s = id ? D.sppd.find(x => x.id === id) : {tgl:today(), pejabat:D.cfg.jabatan, asal:D.cfg.instansi, alat:'Kendaraan Dinas'}; if (!s) return;
  SID = id || null; FOL = structuredClone(s.fol || []);
  const eo = D.emp.map(e => `<option value="${esc(e.id)}" ${e.id === s.empId ? 'selected' : ''}>${esc(e.nama)}</option>`).join('');
  const po = D.prog.map(p => `<option value="${esc(p.id)}" ${p.id === s.progId ? 'selected' : ''}>${esc(p.ta + ' | ' + p.kegiatan + (p.sub ? ' - ' + p.sub : ''))}</option>`).join('');
  const i = (k, l, t = 'text', v = s[k] ?? '', x = '') => `<label class="fld ${x}"><span>${l}</span><input id="s_${k}" type="${t}" value="${esc(v)}" class="in" maxlength="500" ${t === 'date' ? `data-ch="calcL"` : ''}></label>`;
  modal(id ? 'Ubah SPPD' : 'Form SPPD Baru', `<div class="fgrid">
  ${secH('A. Identitas Surat', 'receipt')}<div class="fld"><span>Nomor SPPD <i class="req">*</i></span><div class="ig"><input id="s_no" class="in" value="${esc(s.no ?? '')}" maxlength="100">${b('Auto', 'numAuto', {}, 'btn2', 'zap')}</div></div>${i('tgl', 'Tanggal SPPD <i class="req">*</i>', 'date')}${i('stNo', 'Nomor Surat Tugas')}${i('stTgl', 'Tanggal Surat Tugas', 'date')}${i('dasar', 'Dasar Perjalanan Dinas')}${i('pejabat', 'Pejabat yang Berwenang')}
  ${secH('B. Identitas Pegawai', 'user')}<label class="fld col-span-full"><span>Nama Pegawai <i class="req">*</i></span><select id="s_emp" data-ch="fillEmp" class="in"><option value="">-- pilih --</option>${eo}</select></label><div id="empInfo" class="info col-span-full"></div>
  ${secH('C. Informasi Perjalanan', 'plane')}${i('maksud', 'Maksud Perjalanan <i class="req">*</i>')}${i('alat', 'Alat Angkut')}${i('asal', 'Tempat Berangkat')}${i('tujuan', 'Tempat Tujuan <i class="req">*</i>')}${i('inst', 'Instansi/Pihak yang Dituju')}${i('tingkat', 'Tingkat Biaya')}${i('tb', 'Tanggal Berangkat <i class="req">*</i>', 'date')}${i('tk', 'Tanggal Kembali <i class="req">*</i>', 'date')}<div class="info col-span-full">${I('clock')} Lama perjalanan: <b id="lm">-</b></div>
  ${secH('D. Pengikut', 'users')}<div class="col-span-full"><div id="folBox"></div><div class="ig mt-2"><select id="folSel" class="in"><option value="">-- pilih pegawai --</option>${eo}</select>${b('Dari pegawai', 'addFol', {e:1}, 'btn2', 'plus')}${b('Manual', 'addFol', {}, 'btn2', 'edit')}</div></div>
  ${secH('E. Pembebanan Anggaran', 'wallet')}<label class="fld col-span-full"><span>Program/Kegiatan/Subkegiatan</span><select id="s_prog" data-ch="fillProg" class="in"><option value="">-- pilih --</option>${po}</select></label><div id="progInfo" class="info col-span-full"></div>${i('mata', 'Mata Anggaran')}${i('ket', 'Keterangan Lain')}</div>`, () => {
    const g = k => txt($('#s_' + k).value.trim(), 500), o = {no:g('no'), tgl:okDate(g('tgl')), stNo:g('stNo'), stTgl:okDate(g('stTgl')), dasar:g('dasar'), pejabat:g('pejabat'), empId:g('emp'), maksud:g('maksud'), alat:g('alat'), asal:g('asal'), tujuan:g('tujuan'), inst:g('inst'), tingkat:g('tingkat'), tb:okDate(g('tb')), tk:okDate(g('tk')), progId:g('prog'), mata:g('mata'), ket:g('ket'), fol:FOL.map(f => pick(f, ['nama','nip','gol','jabatan'])).filter(f => f.nama.trim())};
    if (!o.no || !o.tgl || !o.empId || !o.maksud || !o.tujuan || !o.tb || !o.tk) { toast('Field bertanda * wajib diisi', 'err'); return false; }
    if (!emp(o.empId)) { toast('Pegawai tidak ditemukan', 'err'); return false; }
    if (o.tk < o.tb) { toast('Tanggal kembali tidak boleh lebih awal dari tanggal berangkat', 'err'); return false; }
    if (D.sppd.some(x => x.no === o.no && x.id !== SID)) { toast('Nomor SPPD sudah digunakan', 'err'); return false; }
    const p = D.prog.find(x => x.id === o.progId); o.bud = p ? {ta:p.ta, program:p.program, kegiatan:p.kegiatan, sub:p.sub, rek:p.rek, sumber:p.sumber} : (s.bud || null);
    upsert('sppd', SID, o); return true;
  }, true);
  fillEmp(); fillProg(); folRender(); calcL();
}
const calcL = () => { const a = $('#s_tb')?.value, c = $('#s_tk')?.value; if ($('#lm')) $('#lm').textContent = a && c ? (c < a ? 'Tanggal tidak valid' : lama(a, c) + ' hari') : '-'; };
function fillEmp() { const e = emp($('#s_emp').value); $('#empInfo').innerHTML = e ? `${I('user')} NIP: ${esc(e.nip)} · ${esc(e.pangkat)} (${esc(e.gol)}) · ${esc(e.jabatan)} · ${esc(e.unit)}` : `${I('info')} Pilih pegawai untuk mengisi data otomatis`; }
function fillProg() { const p = D.prog.find(x => x.id === $('#s_prog').value); $('#progInfo').innerHTML = p ? `${I('wallet')} Rekening: ${esc(p.rek)} · Sumber dana: ${esc(p.sumber)} · TA ${esc(p.ta)}` : `${I('info')} Belum dipilih`; }
function folRender() { $('#folBox').innerHTML = FOL.map((f, i) => `<div class="folr">${['nama', 'nip', 'gol', 'jabatan'].map(k => `<input class="in sm" placeholder="${k}" aria-label="${k}" value="${esc(f[k])}" maxlength="200" data-in="folSet" data-i="${i}" data-f="${k}">`).join('')}${iBtn('folDel', {i}, 'x', 'Hapus pengikut', 'ib sm danger')}</div>`).join('') || '<p class="muted sm">Tidak ada pengikut</p>'; }
onCh('calcL', calcL); onCh('fillEmp', fillEmp); onCh('fillProg', fillProg);
CH.folSet = el => { const i = +el.dataset.i, f = el.dataset.f; if (FOL[i] && ['nama', 'nip', 'gol', 'jabatan'].includes(f)) FOL[i][f] = txt(el.value, 200); };
act('folDel', el => { FOL.splice(+el.dataset.i, 1); folRender(); });
act('addFol', el => { let f = {nama:'', nip:'', gol:'', jabatan:''}; if (el.dataset.e) { const e = emp($('#folSel').value); if (!e) return toast('Pilih pegawai', 'err'); f = {nama:e.nama, nip:e.nip, gol:e.pangkat + ' / ' + e.gol, jabatan:e.jabatan}; } if (FOL.length >= 50) return; FOL.push(f); folRender(); });
act('numAuto', () => { $('#s_no').value = numAuto(); });
act('openSppd', el => openSppd(el.dataset.id), 'w');
pages.sppd = () => {
  const s = ST.sppd, q = s.q.toLowerCase();
  const a = D.sppd.filter(x => (!q || (x.no + x.tujuan + x.maksud + (emp(x.empId)?.nama || '')).toLowerCase().includes(q)) && (!s.st || stRep(x.id) === s.st) && (!s.a || x.tb >= s.a) && (!s.b || x.tb <= s.b) && (!s.e || x.empId === s.e)).sort((x, y) => y.tb.localeCompare(x.tb));
  return `<div class="card"><div class="toolbar">${inp('sppd', 'q', 'Cari nomor / pegawai / tujuan')}${selE('sppd', 'e')}${sel('sppd', 'st', ['Belum dibuat', 'Draft', 'Selesai'], 'Semua Status Laporan')}<span class="rng">${inp('sppd', 'a', 'Dari tanggal', 'date')}<span>s/d</span>${inp('sppd', 'b', 'Sampai tanggal', 'date')}</span>${b('Reset', 'sppdReset', {}, 'btn2', 'refresh')}<span class="grow"></span>${canW() ? b('Tambah SPPD', 'openSppd', {}, 'btn', 'plus') : ''}</div>
  ${table(['No', 'Nomor SPPD', 'Pegawai', 'Tujuan', 'Maksud', 'Berangkat', 'Kembali', 'Lama', 'Laporan', 'Aksi'], sl('sppd', a).map((x, i) => [(s.pg - 1) * PS + i + 1, `<b>${esc(x.no)}</b>`, esc(emp(x.empId)?.nama), esc(x.tujuan), esc(x.maksud), dts(x.tb), dts(x.tk), lama(x.tb, x.tk) + ' hr', badge(stRep(x.id)), rowAct([iBtn('sDet', {id:x.id}, 'eye', 'Detail'), canW() && iBtn('openSppd', {id:x.id}, 'edit', 'Ubah'), iBtn('toCetak', {id:x.id}, 'printer', 'Cetak'), canW() && iBtn('del', {k:'sppd', id:x.id}, 'trash', 'Hapus', 'ib sm danger')])]))}${pager('sppd', a.length)}</div>`;
};
act('sppdReset', () => { ST.sppd = {q:'', pg:1, st:'', a:'', b:'', e:''}; render(); });
act('toCetak', el => { ST.cetak.id = el.dataset.id; go('cetak'); });
act('sDet', el => {
  const s = D.sppd.find(x => x.id === el.dataset.id); if (!s) return; const e = emp(s.empId) || {}, bd = s.bud || {};
  modal('Detail SPPD ' + esc(s.no), `<div class="kv">${[['Nomor / Tanggal', s.no + ' / ' + dts(s.tgl)], ['Surat Tugas', (s.stNo || '-') + ' / ' + dts(s.stTgl)], ['Pegawai', (e.nama || '-') + ' (' + (e.nip || '-') + ')'], ['Pangkat/Jabatan', (e.pangkat || '') + ' ' + (e.gol || '') + ' / ' + (e.jabatan || '')], ['Maksud', s.maksud], ['Tujuan', s.tujuan + ' (' + (s.inst || '-') + ')'], ['Waktu', dts(s.tb) + ' s/d ' + dts(s.tk) + ' (' + lama(s.tb, s.tk) + ' hari)'], ['Pengikut', (s.fol || []).map(f => f.nama).join(', ') || '-'], ['Anggaran', (bd.kegiatan || '-') + ' / ' + (bd.rek || '-') + ' / ' + (bd.sumber || '-')], ['Laporan', stRep(s.id)]].map(r => `<div><span>${r[0]}</span><b>${esc(r[1])}</b></div>`).join('')}</div>`);
});

/* ---------- Dokumen (kelas CSS di css/doc.css) ---------- */
const kop = () => { const c = D.cfg; return `<div class="kop">${okImg(c.logo) ? `<img src="${okImg(c.logo)}" class="kop-l" alt="">` : ''}<div class="kop-t"><div>PEMERINTAH ${esc((c.kab || c.prov || '').toUpperCase())}</div><div class="kop-i">${esc(c.instansi.toUpperCase())}</div><div class="kop-a">${esc([c.alamat, c.desa, c.kec].filter(Boolean).join(', '))}${c.telp ? ' Telp. ' + esc(c.telp) : ''}</div></div></div>`; };
const sig = (j, n, nip) => `<div class="sig">${esc(j)}<br><br><br><br><b><u>${esc(n || '...............')}</u></b>${nip ? '<br>NIP. ' + esc(nip) : ''}</div>`;
const R = (a, bb, c) => `<tr><td class="c-no">${a}</td><td class="c-lb">${bb}</td><td>${c}</td></tr>`;
function dSPPD(s) { const e = emp(s.empId) || {}, bd = s.bud || {}, c = D.cfg; return `<div class="paper">${kop()}<div class="d-r">Tanggal : ${dts(s.tgl)}<br>Nomor : ${esc(s.no)}<br>Lembar Ke : 1</div><h3 class="d-h"><u>SURAT PERJALANAN DINAS (SPD)</u></h3><table class="dt">${R(1, 'Pejabat Pembuat Komitmen', esc(s.pejabat || c.jabatan))}${R(2, 'Nama/NIP Pegawai yang diperintahkan', esc(e.nama) + ' / ' + esc(e.nip))}${R(3, 'a. Pangkat dan golongan ruang gaji<br>b. Jabatan/Instansi<br>c. Tingkat Biaya Perjalanan Dinas', `${esc(e.pangkat)} (${esc(e.gol)})<br>${esc(e.jabatan)} / ${esc(e.unit)}<br>${esc(s.tingkat || '-')}`)}${R(4, 'Maksud Perjalanan Dinas', esc(s.maksud))}${R(5, 'Alat angkutan yang dipergunakan', esc(s.alat || '-'))}${R(6, 'a. Tempat berangkat<br>b. Tempat tujuan', `${esc(s.asal || '-')}<br>${esc(s.tujuan)}${s.inst ? ' (' + esc(s.inst) + ')' : ''}`)}${R(7, 'a. Lamanya Perjalanan Dinas<br>b. Tanggal berangkat<br>c. Tanggal harus kembali', `${lama(s.tb, s.tk)} hari<br>${dt(s.tb)}<br>${dt(s.tk)}`)}${R(8, 'Pengikut', (s.fol || []).map((f, i) => `${i + 1}. ${esc(f.nama)} ${f.nip ? '/ ' + esc(f.nip) : ''}`).join('<br>') || '-')}${R(9, 'Pembebanan Anggaran<br>a. Instansi<br>b. Mata Anggaran', `${esc(bd.sumber || '-')} TA ${esc(bd.ta || D.cfg.ta)}<br>${esc(c.instansi)}<br>${esc(s.mata || bd.rek || '-')}`)}${R(10, 'Keterangan lain-lain', esc(s.ket || '-'))}</table><div class="d-iss">Dikeluarkan di : ${esc(c.kab || c.instansi)}<br>Tanggal : ${dts(s.tgl)}</div>${sig(s.pejabat || c.jabatan, c.pejabat, c.nip)}</div>`; }
function dLamp(s) {
  const e = emp(s.empId) || {}, c = D.cfg, K = c.jabatan;
  const box = (n, a, bb, d) => `<tr><td class="c-n6">${n}</td><td class="c-47"><table class="w100"><tr><td class="w36">Tiba di</td><td>: ${esc(a)}</td></tr><tr><td>Pada Tanggal</td><td>: ${esc(d)}</td></tr><tr><td>Kepala</td><td>:</td></tr></table><div class="ctr">${a ? esc(K) : ''}<br><br><br>${a ? '<b>' + esc(e.nama) + '</b>' : '&nbsp;'}</div></td><td><table class="w100"><tr><td class="w36">Berangkat Dari</td><td>: ${esc(a)}</td></tr><tr><td>Ke</td><td>: ${esc(bb)}</td></tr><tr><td>Pada Tanggal</td><td>: ${esc(d)}</td></tr><tr><td>Kepala</td><td>:</td></tr></table><div class="ctr">${a ? esc(K) : ''}<br><br><br>${a ? '<b>' + esc(e.nama) + '</b>' : '&nbsp;'}</div></td></tr>`;
  return `<div class="paper">${kop()}<table class="lamp-h"><tr><td class="w130">SPPD Nomor</td><td>: <b>${esc(s.no)}</b></td></tr><tr><td>Berangkat dari</td><td>: <b>${esc(s.asal)}</b></td></tr><tr><td>Pada tanggal</td><td>: ${dts(s.tb)}</td></tr><tr><td>Ke</td><td>: <b>${esc(s.tujuan)}</b></td></tr><tr><td>Kegiatan</td><td>: ${esc(s.maksud)}</td></tr></table><table class="dt">${box('II.', s.tujuan, s.asal, dt(s.tb))}${box('III.', s.tujuan, s.asal, dt(s.tk))}${box('IV.', '', '', '')}<tr><td>V.</td><td colspan="2">Telah diperiksa dengan keterangan bahwa perjalanan tersebut atas perintahnya dan semata-mata untuk kepentingan jabatan dalam waktu sesingkat-singkatnya.${sig(s.pejabat || K, c.pejabat, c.nip)}</td></tr></table></div>`;
}
const sppdSel = (k, ch) => `<select class="in" data-ch="${ch}" aria-label="Pilih SPPD"><option value="">-- pilih nomor SPPD --</option>${D.sppd.map(s => `<option value="${esc(s.id)}" ${ST[k].id === s.id ? 'selected' : ''}>${esc(s.no + ' - ' + (emp(s.empId)?.nama || ''))}</option>`).join('')}</select>`;
function printHtml(h) { $('#pa').innerHTML = h; setTimeout(() => window.print(), 60); }
act('printNow', () => { const s = D.sppd.find(x => x.id === ST.cetak.id); if (!s) return toast('Pilih SPPD terlebih dahulu', 'err'); log('Mencetak dokumen SPPD ' + s.no); printHtml(docs(s, ST.cetak.v)); });
act('cetakTab', el => { if (['st', 'sppd', 'lamp', 'lap', 'all'].includes(el.dataset.v)) { ST.cetak.v = el.dataset.v; render(); } });
onCh('cetakSel', el => { ST.cetak.id = el.value; render(); });
pages.cetak = () => {
  const s = D.sppd.find(x => x.id === ST.cetak.id), v = ST.cetak.v;
  const tab = (k, l, ic) => `<button class="seg ${v === k ? 'on' : ''}" data-act="cetakTab" data-v="${k}">${I(ic)}<span>${l}</span></button>`;
  return `<div class="card mb-3"><div class="toolbar">${sppdSel('cetak', 'cetakSel')}<div class="segs">${tab('st', 'Surat Tugas', 'file')}${tab('sppd', 'Lembar SPD', 'receipt')}${tab('lamp', 'Lampiran', 'layers')}${tab('lap', 'Laporan', 'clipboard')}${tab('all', 'Paket Lengkap', 'folder')}</div><span class="grow"></span>${b('Cetak / Simpan PDF', 'printNow', {}, 'btn', 'printer')}</div><p class="muted sm mt-2">${I('info')} Untuk PDF, pilih "Simpan sebagai PDF" pada dialog cetak (ukuran A4).</p></div>${s ? `<div class="paperw">${docs(s, v)}</div>` : `<div class="card empty-st">${I('printer', 'big')}<p>Pilih nomor SPPD untuk pratinjau dokumen</p></div>`}`;
};

/* ---------- Rekap ---------- */
const rekapData = () => { const s = ST.rekap; return D.sppd.filter(x => (!s.a || x.tb >= s.a) && (!s.b || x.tb <= s.b) && (!s.e || x.empId === s.e) && (!s.t || x.tujuan.toLowerCase().includes(s.t.toLowerCase()))); };
const rekapHtml = pr => {
  const A = rekapData(), G = [['Bulan', s => s.tb.slice(0, 7)], ['Tahun', s => s.tb.slice(0, 4)], ['Pegawai', s => emp(s.empId)?.nama], ['Jabatan', s => emp(s.empId)?.jabatan], ['Tujuan', s => s.tujuan], ['Program', s => s.bud?.program], ['Kegiatan', s => s.bud?.kegiatan], ['Sumber Dana', s => s.bud?.sumber]];
  const k = [['Total perjalanan', A.length, 'plane'], ['Total hari', A.reduce((n, x) => n + lama(x.tb, x.tk), 0), 'calendar'], ['Pegawai bepergian', new Set(A.map(x => x.empId)).size, 'users'], ['Belum ada laporan', A.filter(x => stRep(x.id) !== 'Selesai').length, 'file']];
  return `<div class="kpis">${k.map((x, i) => pr ? `<div class="kpi"><div><div class="kpi-v">${x[1]}</div><div class="kpi-l">${x[0]}</div></div></div>` : kpi(x[0], x[1], x[2], '', i)).join('')}</div><div class="dgrid g2">${G.map(g => `<div class="card">${cardH('Berdasarkan ' + g[0])}${table([g[0], 'Frekuensi', 'Hari'], grp(A, g[1]).map(([kk, v]) => [esc(kk), v.n, v.d]), 'keep')}</div>`).join('')}</div><div class="card mt-3">${cardH('SPPD Belum Memiliki Laporan Selesai', 'alert')}${table(['Nomor', 'Pegawai', 'Tujuan', 'Status'], A.filter(x => stRep(x.id) !== 'Selesai').map(x => [esc(x.no), esc(emp(x.empId)?.nama), esc(x.tujuan), badge(stRep(x.id))]))}</div>`;
};
pages.rekap = () => `<div class="card mb-3"><div class="toolbar"><span class="rng">${inp('rekap', 'a', 'Dari tanggal', 'date')}<span>s/d</span>${inp('rekap', 'b', 'Sampai tanggal', 'date')}</span>${selE('rekap', 'e')}${inp('rekap', 't', 'Filter tujuan')}<span class="grow"></span>${b('Ekspor CSV', 'expRekap', {}, 'btn2', 'download')}${b('Cetak / PDF', 'printRekap', {}, 'btn', 'printer')}</div></div>${rekapHtml()}`;
act('printRekap', () => printHtml(`<div class="paper rk"><h3 class="d-h">REKAPITULASI PERJALANAN DINAS</h3>${rekapHtml(true)}</div>`));
act('expRekap', () => dl('rekap_sppd.csv', toCSV([['Nomor', 'Pegawai', 'NIP', 'Jabatan', 'Tujuan', 'Berangkat', 'Kembali', 'Hari', 'Program', 'Kegiatan', 'Sumber Dana', 'Laporan'], ...rekapData().map(x => { const e = emp(x.empId) || {}, bd = x.bud || {}; return [x.no, e.nama, e.nip, e.jabatan, x.tujuan, x.tb, x.tk, lama(x.tb, x.tk), bd.program, bd.kegiatan, bd.sumber, stRep(x.id)]; })])));

/* ---------- Pengaturan instansi ---------- */
pages.set = () => `<div class="card">${cardH('Identitas Instansi & Kop Surat', 'building')}<div class="fgrid g3">${CF.map(([k, l]) => `<label class="fld"><span>${l}</span><input id="c_${k}" value="${esc(D.cfg[k])}" class="in" maxlength="200"></label>`).join('')}</div>
  <div class="upl mt-4"><div class="upl-p">${okImg(D.cfg.logo) ? `<img src="${okImg(D.cfg.logo)}" alt="Logo kop">` : I('image', 'big')}</div><div><b>Logo kop surat</b><p class="muted sm">PNG/JPG/WebP, otomatis diperkecil & dibersihkan metadata.</p><label class="btn2 file">${I('upload')}<span>Pilih logo</span><input type="file" accept="image/png,image/jpeg,image/webp" data-ch="cfgLogo" hidden></label></div></div>
  <div class="actions">${b('Simpan Pengaturan', 'saveCfg', {}, 'btn', 'check')}${b('Reset Identitas', 'resetCfg', {}, 'btnd', 'refresh')}</div></div>`;
act('saveCfg', () => { CF.forEach(([k]) => D.cfg[k] = txt($('#c_' + k).value.trim(), 200)); if (save('cfg')) { log('Memperbarui pengaturan instansi'); toast('Pengaturan disimpan'); render(); } }, 'a');
act('resetCfg', async () => { if (!(await ask('Reset identitas instansi ke bawaan? Data pegawai dan SPPD tidak dihapus.', 'Reset'))) return; const ui = D.cfg.ui; D.cfg = structuredClone(DEF.cfg); if (ui) D.cfg.ui = ui; save('cfg'); log('Reset identitas instansi'); render(); }, 'a');
onCh('cfgLogo', async el => { const f = el.files[0]; if (!f) return; try { D.cfg.logo = await reencode(f, 400, 'image/png'); if (D.cfg.logo.length > 4e5) D.cfg.logo = await reencode(f, 300, 'image/jpeg', .85); if (save('cfg')) { toast('Logo kop diperbarui'); render(); } } catch (e) { toast(e.message, 'err'); } }, 'a');

/* ---------- Backup & restore ---------- */
pages.bak = () => `<div class="dgrid g2"><div class="card">${cardH('Backup Data', 'download')}<div class="warn">${I('alert')}<span>Data tersimpan terenkripsi di browser perangkat ini dan belum tersinkron ke perangkat lain. Lakukan backup berkala.</span></div>
  <div class="stack">${b('Backup Terenkripsi (disarankan)', 'bakEnc', {}, 'btn', 'lock')}${b('Backup JSON biasa', 'bakJSON', {}, 'btn2', 'download')}</div><p class="muted sm mt-2">Backup terenkripsi dilindungi kata sandi backup (AES-256-GCM). Backup biasa dapat dibaca siapa saja yang memegang file-nya.</p>
  <div class="sec mt-4">${I('csv')}<span>Ekspor CSV</span></div><div class="stack">${b('Pegawai', 'expCSV', {k:'emp'}, 'btn2', 'csv')}${b('SPPD', 'expSppd', {}, 'btn2', 'csv')}${b('Laporan', 'expRep', {}, 'btn2', 'csv')}</div></div>
  <div class="card">${cardH('Restore Data', 'upload')}<p class="muted sm">Impor berkas backup (.json biasa atau terenkripsi). Data diperiksa & dibersihkan terlebih dahulu; data lama diganti setelah konfirmasi dan verifikasi kata sandi Anda.</p><div class="stack mt-3">${b('Pilih File Backup', 'pickRestore', {}, 'btn2', 'folder')}</div></div></div>`;
const bakData = () => ({app:'sim-sppd', v:1, data:Object.fromEntries(KEYS.map(k => [k, D[k]]))});
act('bakJSON', async () => { if (!(await ask('Backup biasa TIDAK terenkripsi. Simpan file di tempat aman. Lanjutkan?', 'Unduh', false))) return; dl('backup_sppd_' + today() + '.json', JSON.stringify(bakData(), null, 1), 'application/json'); log('Ekspor backup JSON'); }, 'a');
act('bakEnc', () => modal('Backup Terenkripsi', `<p class="muted sm mb-3">Buat kata sandi khusus backup. Tanpa kata sandi ini file tidak dapat dipulihkan.</p><div class="fgrid"><label class="fld"><span>Kata sandi backup</span><input id="bk1" type="password" class="in" autocomplete="new-password"></label><label class="fld"><span>Ulangi</span><input id="bk2" type="password" class="in" autocomplete="new-password"></label></div>`, async () => {
  const p = $('#bk1').value; if (p.length < 8) { toast('Kata sandi backup minimal 8 karakter', 'err'); return false; } if (p !== $('#bk2').value) { toast('Ulangi kata sandi tidak sama', 'err'); return false; }
  const salt = newSalt(), ct = await seal(await kdf(p, salt), bakData(), 'backup');
  dl('backup_sppd_' + today() + '_terenkripsi.json', JSON.stringify({app:'sim-sppd', v:2, enc:{salt, it:ITER, box:ct}}), 'application/json'); log('Ekspor backup terenkripsi'); return true;
}, false, 'Buat & Unduh'), 'a');
act('expSppd', () => dl('sppd.csv', toCSV([['Nomor', 'Tanggal', 'Pegawai', 'Tujuan', 'Maksud', 'Berangkat', 'Kembali'], ...D.sppd.map(x => [x.no, x.tgl, emp(x.empId)?.nama, x.tujuan, x.maksud, x.tb, x.tk])])));
act('expRep', () => dl('laporan.csv', toCSV([['SPPD', 'Status', 'Hasil', 'Kesimpulan', 'Rekomendasi'], ...D.rep.map(r => [D.sppd.find(s => s.id === r.sppdId)?.no, r.status, r.hasil || [r.h1, r.h2, r.h3].filter(Boolean).join(' | '), r.kes, r.tl])])));
act('pickRestore', () => { $('#fjson').value = ''; $('#fjson').click(); }, 'a');
$('#fjson').addEventListener('change', async e => {
  if (!isA()) return toast('Hanya administrator yang dapat restore', 'err');
  const f = e.target.files[0]; if (!f) return; if (f.size > 8e6) return toast('File terlalu besar (maks 8 MB)', 'err');
  let j; try { j = JSON.parse(await f.text()); } catch { return toast('Berkas backup tidak valid', 'err'); }
  if (!j || j.app !== 'sim-sppd') return toast('Berkas bukan backup SIM-SPPD', 'err');
  const apply = async data => {
    try { for (const k of ['emp', 'prog', 'sppd', 'rep']) if (!Array.isArray(data[k])) throw 0; if (typeof data.cfg !== 'object') throw 0; } catch { return toast('Isi backup tidak lengkap/rusak', 'err'); }
    const clean = {}; try { KEYS.forEach(k => { if (data[k] !== undefined) clean[k] = CLEAN[k](data[k]); }); } catch { return toast('Isi backup tidak valid', 'err'); }
    if (!(await ask(`Ganti seluruh data saat ini dengan isi backup? (${clean.emp.length} pegawai, ${clean.sppd.length} SPPD)`, 'Ganti Data'))) return;
    reauth('Konfirmasi kata sandi Anda untuk restore', async () => {
      const old = Object.fromEntries(KEYS.map(k => [k, D[k]]));
      try { Object.assign(D, clean); await Promise.all(Object.keys(clean).map(persist)); await flush(); }
      catch { Object.assign(D, old); KEYS.forEach(persist); return toast('Restore gagal, data lama dipertahankan', 'err'); }
      log('Restore data dari backup'); toast('Restore berhasil'); applyUI(); render();
    });
  };
  if (j.enc) {
    modal('Backup Terenkripsi', `<label class="fld"><span>Kata sandi backup</span><input id="bkp" type="password" class="in" autocomplete="off"></label>`, async () => {
      try { const data = await unseal(await kdf($('#bkp').value, j.enc.salt, clamp(j.enc.it, 1e5, 5e6, ITER)), j.enc.box, 'backup'); closeM(); apply(data?.data || {}); }
      catch { toast('Kata sandi backup salah atau file rusak', 'err'); } return false;
    }, false, 'Buka');
  } else apply(j.data || {});
});

/* ---------- Kerangka (shell) ---------- */
const M = [['dash','Dashboard','home','Utama'],['emp','Data Pegawai','users','Data'],['prog','Program & Kegiatan','clipboard','Data'],['sppd','Data SPPD','receipt','Perjalanan Dinas'],['form','Form SPPD','pen','Perjalanan Dinas'],['cetak','Cetak Dokumen','printer','Perjalanan Dinas'],['lap','Laporan Perjalanan','file','Perjalanan Dinas'],['rekap','Rekapitulasi','chart','Perjalanan Dinas'],['set','Pengaturan Instansi','building','Sistem'],['tampil','Tampilan & Tema','palette','Sistem'],['user','Pengguna & Peran','shield','Sistem'],['bak','Backup & Restore','database','Sistem']];
const menuIco = k => { const m = M.find(x => x[0] === k), v = UI().icons?.[k]; if (v && v.t === 'img' && okImg(v.v)) return `<img class="mico" src="${okImg(v.v)}" alt="">`; if (v && v.t === 'txt' && v.v) return `<span class="emo">${esc(v.v)}</span>`; return I(v && v.t === 'svg' && ICONS[v.v] ? v.v : m ? m[2] : 'dots'); };
const go = r => { closeDrawers(); if (r === 'form') { if (!canW()) return; if (location.hash !== '#sppd') location.hash = 'sppd'; setTimeout(() => openSppd(), 40); } else location.hash = r; };
act('go', el => go(el.dataset.r));
function closeDrawers() { $('#side').classList.remove('open'); $('#rp').classList.remove('open'); document.body.classList.remove('drawer'); }
act('closeDrawers', closeDrawers);
const wide = () => matchMedia('(min-width:1024px)').matches;
act('togSide', () => { if (wide()) { $('#side').classList.toggle('mini'); try { localStorage.setItem('sppd_mini', $('#side').classList.contains('mini') ? '1' : ''); } catch {} } else { $('#side').classList.toggle('open'); document.body.classList.toggle('drawer', $('#side').classList.contains('open')); } });
act('togRP', () => { if (wide()) $('#rp').classList.toggle('hide'); else { $('#rp').classList.toggle('open'); document.body.classList.toggle('drawer', $('#rp').classList.contains('open')); } });
act('palette', () => {
  const it = M.filter(m => Auth.allow(m[0]) && (m[0] !== 'form' || canW()));
  modal('Cari menu', `<div class="srch big">${I('search')}<input id="palQ" class="in" placeholder="Ketik nama menu…" data-in="palQ" autocomplete="off"></div><div class="pal">${it.map(m => `<button class="pal-i" data-act="go" data-r="${m[0]}" data-n="${esc(m[1].toLowerCase())}">${menuIco(m[0])}<span>${esc(m[1])}</span><small>${esc(m[3])}</small></button>`).join('')}</div>`);
});
CH.palQ = el => { const q = el.value.toLowerCase(); $$('.pal-i').forEach(x => x.hidden = !x.dataset.n.includes(q)); };
document.addEventListener('keydown', e => { if (e.target.id === 'palQ' && e.key === 'Enter') { const x = $$('.pal-i').find(x => !x.hidden); if (x) { closeM(); go(x.dataset.r); } } });
function rp() {
  const c = D.cfg;
  $('#rp').innerHTML = `<div class="rp-h"><b>Profil Instansi</b>${iBtn('togRP', {}, 'x', 'Tutup')}</div><div class="rp-logo">${okImg(c.logo) ? `<img src="${okImg(c.logo)}" alt="">` : I('building', 'big')}</div><div class="rp-n">${esc(c.instansi)}</div><div class="kv sm">${[['Provinsi', c.prov], ['Kab/Kota', c.kab], ['Kecamatan', c.kec], ['Desa/Kel.', c.desa], ['Alamat', c.alamat], ['Telepon', c.telp], ['Pejabat', c.pejabat], ['NIP', c.nip], ['Jabatan', c.jabatan], ['Tahun Anggaran', c.ta]].map(r => `<div><span>${r[0]}</span><b>${esc(r[1]) || '-'}</b></div>`).join('')}</div>${isA() ? `<div class="actions">${b('Ubah', 'go', {r:'set'}, 'btn', 'edit')}${b('Reset', 'resetCfg', {}, 'btnd', 'refresh')}</div>` : ''}`;
}
let RT = 'dash', lastRT = '';
const AFTER = {};
function render() {
  if (!Auth.logged()) return;
  const r = location.hash.slice(1) || 'dash';
  RT = (own(pages, r) && Auth.allow(r)) ? r : 'dash';
  if (RT !== 'tampil' && TDraft) { TDraft = null; applyUI(); }
  let grp0 = '';
  $('#nav').innerHTML = M.filter(m => Auth.allow(m[0]) && (m[0] !== 'form' || canW())).map(m => { const g = m[3] !== grp0 ? `<div class="ng lb">${esc(m[3])}</div>` : ''; grp0 = m[3]; return `${g}<button class="nv ${m[0] === RT ? 'on' : ''}" data-act="go" data-r="${m[0]}" title="${esc(m[1])}"><span class="nvi">${menuIco(m[0])}</span><span class="lb">${esc(m[1])}</span></button>`; }).join('');
  const bn = [['dash', 'Beranda'], ['sppd', 'SPPD'], canW() ? ['form', 'Baru'] : ['cetak', 'Cetak'], ['lap', 'Laporan']].filter(x => Auth.allow(x[0]));
  $('#bnav').innerHTML = bn.map(([k, l]) => `<button class="bn ${k === RT ? 'on' : ''} ${k === 'form' ? 'fab' : ''}" data-act="go" data-r="${k}"><span class="nvi">${k === 'form' ? I('plus') : menuIco(k)}</span><span>${l}</span></button>`).join('') + `<button class="bn" data-act="togSide"><span class="nvi">${I('grid')}</span><span>Menu</span></button>`;
  const mm = M.find(m => m[0] === RT);
  $('#bc').textContent = mm[3]; $('#pgTitle').textContent = mm[1]; document.title = mm[1] + ' · ' + UI().appName;
  const main = $('#main'); main.innerHTML = pages[RT]();
  if (lastRT !== RT) { main.classList.remove('enter'); void main.offsetWidth; main.classList.add('enter'); main.scrollTop = 0; lastRT = RT; }
  rp(); post(main); post($('#nav')); post($('#bnav')); fitPaper(); AFTER[RT]?.();
}
window.addEventListener('hashchange', () => Auth.logged() && render());
