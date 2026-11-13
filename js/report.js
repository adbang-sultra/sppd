/* ============================================================
   LAPORAN PERJALANAN DINAS + SURAT TUGAS + ekspor Word
   ============================================================ */
'use strict';
let LF = [], LFid = '';
const lines = t => String(t || '').split('\n').map(x => x.trim()).filter(Boolean);
const ol = t => { const a = lines(t); return a.length ? `<ol class="lo">${a.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : '<div class="blank"></div>'; };
const pj = t => String(t || '').trim() ? `<div class="just">${esc(t)}</div>` : '<div class="blank"></div>';
const h4 = t => `<h4>${t}</h4>`, h5 = (l, t) => `<h5>${l}. ${t}</h5>`;
const pgk = (p, g) => [p, g ? 'Gol. ' + g : ''].filter(Boolean).join(', ');
/* daftar petugas (pegawai + pengikut) dengan pangkat/golongan; pangkat pengikut diambil dari data pegawai lewat NIP */
const petugas = s => { const e = pegOf(s), byNip = n => (n && D.emp.find(x => x.nip === n)) || {};
  return [{nama:e.nama, nip:e.nip, jabatan:e.jabatan, pg:pgk(e.pangkat, e.gol)}, ...(s.fol || []).map(f => { const m = byNip(f.nip); return {nama:f.nama, nip:f.nip, jabatan:f.jabatan || m.jabatan, pg:pgk(m.pangkat, f.gol || m.gol)}; })].filter(p => p.nama); };
/* NIP 18 digit ditulis berkelompok seperti surat resmi: 19940702 202504 2 006 */
const fmtNip = n => { const d = String(n || '').replace(/\s+/g, ''); return /^\d{18}$/.test(d) ? `${d.slice(0, 8)} ${d.slice(8, 14)} ${d.slice(14, 15)} ${d.slice(15)}` : String(n || ''); };
/* "Untuk" pada Surat Tugas: baris pertama Maksud = uraian; baris berikutnya = daftar bernomor (mis. OPD yang dikunjungi) */
const untuk = s => { const L = String(s.maksud || '').split('\n').map(x => x.trim()).filter(Boolean), head = L[0] || '';
  return {head:L.length > 1 ? head : head + (s.tujuan && !/\bdi\s/i.test(head) ? ' di ' + s.tujuan : '') + (/[.:]$/.test(head) ? '' : '.'), items:L.slice(1).map(x => x.replace(/^\d+[.)]\s*/, ''))}; };
/* Maksud dalam satu paragraf (untuk SPD & laporan): "uraian: A, B, C" */
const maksud1 = s => { const L = String(s.maksud || '').split('\n').map(x => x.trim().replace(/^\d+[.)]\s*/, '')).filter(Boolean); return L.length > 1 ? L[0] + (/:$/.test(L[0]) ? ' ' : ': ') + L.slice(1).join(', ') : L[0] || ''; };
const perST = s => s.tb && s.tk && s.tb.slice(0, 7) === s.tk.slice(0, 7) ? (+s.tb.slice(8)) + ' s/d ' + dts(s.tk) : dts(s.tb) + ' s/d ' + dts(s.tk);
function fitPaper() { const w = ($('#main')?.clientWidth || innerWidth) - (innerWidth < 640 ? 20 : 48); document.documentElement.style.setProperty('--pz', Math.max(.3, Math.min(1, w / 800)).toFixed(3)); }
addEventListener('resize', fitPaper);

function dLap(s) {
  const c = D.cfg, r = D.rep.find(x => x.sppdId === s.id) || {}, P = petugas(s), ttl = '<div class="lt">LAPORAN HASIL PERJALANAN DINAS<br>' + esc(maksud1(s).toUpperCase()) + '</div>';
  const wkt = r.wkt || `Kegiatan dilaksanakan pada tanggal ${dts(s.tb)} s.d ${dts(s.tk)} di ${s.tujuan || '-'}${s.inst ? ' (' + s.inst + ')' : ''}.`;
  const dasar = [...(s.stNo ? [`Surat Tugas ${signerOf(s, 'stS').jabatan || c.jabatan} Nomor ${s.stNo}${s.stTgl ? ' tanggal ' + dts(s.stTgl) : ''}`] : []), `Surat Perintah Perjalanan Dinas Nomor ${s.no}`, ...lines(r.dasar)].join('\n');
  const keg = r.keg || `${dt(s.tb)} berangkat dari ${s.asal || '-'} ke ${s.tujuan}\n${dt(s.tk)} kembali ke ${s.asal || '-'}`;
  const hasil = r.hasil || [r.h1, r.h2, r.h3].filter(Boolean).join('\n'), Fo = (r.foto || []).map(okImg).filter(Boolean);
  return `<div class="paper lap">${kop()}${ttl}${h4('I. PENDAHULUAN')}${h5('A', 'Latar Belakang')}${pj(r.latar)}${h5('B', 'Dasar Hukum')}${ol(dasar)}${h5('C', 'Maksud dan Tujuan')}${pj(r.mt || s.maksud)}${h5('D', 'Waktu Pelaksanaan')}${pj(wkt)}${h4('II. KEGIATAN YANG DILAKSANAKAN')}${ol(keg)}${h4('III. HASIL YANG DICAPAI')}${ol(hasil)}${h4('IV. KESIMPULAN DAN SARAN')}${pj(r.kes)}${h4('V. REKOMENDASI')}${ol(r.tl)}${h4('VI. PENUTUP')}${pj(r.penutup || 'Demikian Laporan perjalanan dinas ini dibuat untuk dipergunakan sebagaimana mestinya.')}
  <div class="sig2">${esc(kc('kota'))}, ${dts(r.tgl || today())}<br>Yang Melaporkan,<table>${P.map((p, i) => `<tr><td>${i + 1}.</td><td>${esc(p.nama)}</td><td>……………………</td></tr>`).join('')}</table></div></div>` + Array.from({length:Math.ceil(Fo.length / 2)}, (_, i) => `<div class="paper lap">${i === 0 ? ttl.replace('LAPORAN HASIL', 'DOKUMENTASI') : ''}<div class="gal">${Fo.slice(i * 2, i * 2 + 2).map(f => `<img src="${f}" alt="Dokumentasi">`).join('')}</div></div>`).join('');
}

/* Foto dokumentasi: dikompres & di-encode ulang (metadata/EXIF terbuang) */
onCh('addFoto', async el => {
  for (const f of [...el.files].slice(0, 6 - LF.length)) { try { LF.push(await reencode(f, 1000, 'image/jpeg', .72, 15e6)); } catch (e) { toast(e.message, 'err'); } }
  el.value = ''; fotoRender();
}, 'w');
act('fotoDel', el => { LF.splice(+el.dataset.i, 1); fotoRender(); }, 'w');
function fotoRender() { const bx = $('#fotoBox'); if (bx) bx.innerHTML = LF.map((f, i) => `<div class="ph"><img src="${okImg(f)}" alt="Foto ${i + 1}">${canW() ? iBtn('fotoDel', {i}, 'x', 'Hapus foto', 'ib sm danger') : ''}</div>`).join('') || `<span class="muted sm">Belum ada foto (maks 6)</span>`; }
AFTER.lap = fotoRender;
act('saveLap', el => {
  const final = el.dataset.f === '1', s = D.sppd.find(x => x.id === ST.lap.id); if (!s) return toast('Pilih SPPD', 'err');
  const g = k => txt($('#l_' + k).value.trim(), 8000), o = {sppdId:s.id, no:g('no'), latar:g('latar'), dasar:g('dasar'), mt:g('mt'), wkt:g('wkt'), keg:g('keg'), hasil:g('hasil'), kes:g('kes'), tl:g('tl'), penutup:g('penutup'), tgl:okDate(g('tgl')), foto:LF.filter(okImg).slice(0, 6)};
  if (final && (!o.hasil || !o.kes || !o.tgl)) return toast('Untuk status Selesai, isi Hasil yang Dicapai, Kesimpulan, dan Tanggal', 'err');
  o.status = final ? 'selesai' : 'draft'; let r = D.rep.find(x => x.sppdId === s.id); if (r) Object.assign(r, o); else D.rep.push({id:uid(), ts:nextTs(), ...o});
  if (save('rep')) { log('Laporan ' + s.no + ' (' + o.status + ')'); toast('Laporan disimpan'); render(); }
}, 'w');
act('delLap', async el => { if (!(await ask('Hapus laporan ini?', 'Hapus'))) return; D.rep = D.rep.filter(r => r.id !== el.dataset.id); save('rep'); log('Menghapus laporan'); LFid = ''; render(); }, 'w');
act('openLap', el => { ST.lap.id = el.dataset.id; render(); });
act('lapPrev', el => { ST.cetak = {id:el.dataset.id, v:'lap'}; go('cetak'); });
onCh('lapSel', el => { ST.lap.id = el.value; render(); });

pages.lap = () => {
  const s = D.sppd.find(x => x.id === ST.lap.id), e = s ? pegOf(s) : {}, r = s && D.rep.find(x => x.sppdId === s.id) || {}, ro = canW() ? '' : 'readonly';
  if (s && LFid !== s.id) { LF = [...(r.foto || [])]; LFid = s.id; }
  const ta = (k, l, n = 3, ph = '', v = r[k]) => `<label class="fld"><span>${l}</span><textarea id="l_${k}" rows="${n}" placeholder="${esc(ph)}" class="in" maxlength="8000" ${ro}>${esc(v)}</textarea></label>`, nm = 'Satu baris = satu nomor';
  return `<div class="card mb-3"><div class="toolbar">${sppdSel('lap', 'lapSel')}${s ? badge(stRep(s.id)) : ''}</div>${s ? `<div class="info mt-3">${I('user')}<span><b>${esc(e.nama)}</b> · NIP ${esc(e.nip)} · ${esc(e.jabatan)}<br>Tujuan: ${esc(s.tujuan)} · ${dts(s.tb)} s/d ${dts(s.tk)}</span></div>
  <div class="fgrid g2 mt-3"><label class="fld"><span>Nomor Laporan</span><input id="l_no" value="${esc(r.no)}" class="in" maxlength="200" ${ro}></label><label class="fld"><span>Tanggal Penyusunan</span><input id="l_tgl" type="date" value="${esc(r.tgl || today())}" class="in" ${ro}></label>
  ${secH('I. Pendahuluan', 'flag')}${ta('latar', 'A. Latar Belakang', 4)}${ta('dasar', 'B. Dasar Hukum tambahan (Surat Tugas & SPPD otomatis)', 4, nm)}${ta('mt', 'C. Maksud dan Tujuan (kosong = otomatis)', 3)}${ta('wkt', 'D. Waktu Pelaksanaan (kosong = otomatis)', 3)}
  ${secH('II – VI. Isi Laporan', 'clipboard')}${ta('keg', 'II. Kegiatan yang Dilaksanakan (kosong = otomatis)', 4, nm)}${ta('hasil', 'III. Hasil yang Dicapai', 4, nm, r.hasil || [r.h1, r.h2, r.h3].filter(Boolean).join('\n'))}${ta('kes', 'IV. Kesimpulan dan Saran', 3)}${ta('tl', 'V. Rekomendasi', 3, nm)}<div class="col-span-full">${ta('penutup', 'VI. Penutup (kosong = kalimat baku)', 2)}</div>
  ${secH('Dokumentasi Foto', 'image')}<div class="col-span-full">${canW() ? `<label class="btn2 file">${I('upload')}<span>Tambah foto (maks 6)</span><input type="file" accept="image/png,image/jpeg,image/webp" multiple data-ch="addFoto" hidden></label>` : ''}<div id="fotoBox" class="phs mt-2"></div></div></div>
  <div class="actions">${canW() ? b('Simpan Draft', 'saveLap', {f:0}, 'btn2', 'edit') + b('Simpan & Selesai', 'saveLap', {f:1}, 'btn', 'check') : ''}${r.id ? b('Pratinjau / PDF', 'lapPrev', {id:s.id}, 'btn2', 'eye') + b('Unduh Word', 'expWord', {id:s.id}, 'btn2', 'word') + (canW() ? b('Hapus', 'delLap', {id:r.id}, 'btnd', 'trash') : '') : ''}</div>` : `<div class="empty-st">${I('file', 'big')}<p>Pilih nomor SPPD untuk mengisi laporan</p></div>`}</div>
  <div class="card">${cardH('Daftar Laporan', 'folder')}${table(['Nomor SPPD', 'Pegawai', 'Tanggal', 'Status', 'Aksi'], D.rep.map(x => { const p = D.sppd.find(q => q.id === x.sppdId) || {}; return [esc(p.no), esc(pegOf(p).nama), dts(x.tgl), badge(x.status === 'selesai' ? 'Selesai' : 'Draft'), iBtn('openLap', {id:x.sppdId}, 'chevr', 'Buka')]; }))}</div>`;
};
