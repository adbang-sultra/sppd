/* ============================================================
   LAPORAN PERJALANAN DINAS + SURAT TUGAS + ekspor Word
   ============================================================ */
'use strict';
let LF = [], LFid = '';
const lines = t => String(t || '').split('\n').map(x => x.trim()).filter(Boolean);
/* ---- Template laporan (mengikuti contoh LAPORAN_WAKATOBI): Times New Roman 12, spasi 1,5, rata kiri-kanan ---- */
const unnum = x => x.replace(/^\d+[.)]\s*/, ''), isB = x => /^[-•*]\s+/.test(x), unb = x => x.replace(/^[-•*]\s+/, '');
/* satu baris = satu nomor; baris berawalan "- " = butir (•) di bawah nomor; bul=1 → semua baris berupa butir */
const lst = (t, bul) => { const a = lines(t); if (!a.length) return '<div class="blank"></div>'; let n = 0;
  return a.map(x => bul || isB(x) ? `<div class="li b${bul ? '' : ' l2'}"><i>•</i><span>${esc(unb(x))}</span></div>` : `<div class="li"><i>${++n}.</i><span>${esc(unnum(x))}</span></div>`).join(''); };
const pj = t => { const a = lines(t); return a.length ? a.map(x => `<p class="lp">${esc(x)}</p>`).join('') : '<div class="blank"></div>'; };
/* satu baris biasa (tanpa nomor/butir) = paragraf uraian; selebihnya daftar bernomor */
const lstp = t => { const a = lines(t); return a.length === 1 && !isB(a[0]) && !/^\d+[.)]\s/.test(a[0]) ? pj(t) : lst(t); };
const lh1 = (n, t) => `<div class="lh1"><i>${n}</i><span>${t}</span></div>`, lh2 = (n, t) => `<div class="lh2"><i>${n}</i><span>${t}</span></div>`;
/* nilai kosong/strip ("-", "- / -") dianggap tidak ada */
const nil = v => !v || /^[\s\-–—/]*$/.test(String(v)) ? '' : String(v);
const pgk = (p, g) => [nil(p), nil(g) ? 'Gol. ' + nil(g) : ''].filter(Boolean).join(', ');
/* PPPK (P3K) tidak memiliki pangkat/golongan: dikenali dari Status Pegawai (data pegawai, dicari lewat NIP/ID) atau kata PPPK/P3K pada jabatan */
/* golongan pengikut disimpan "Pangkat / Gol" — pisahkan agar pangkat tidak tertulis dua kali */
const fpg = (f, m) => { const g = String(f.gol || ''), i = g.lastIndexOf(' / '); return {pangkat:nil(m.pangkat) || (i > -1 ? nil(g.slice(0, i)) : ''), gol:nil(m.gol) || nil(i > -1 ? g.slice(i + 3) : g)}; };
const isP3K = (...o) => o.some(x => x && (x.status === 'PPPK' || /\b(PPPK|P3K)\b/i.test(x.jabatan || '')));
/* daftar petugas (pegawai + pengikut) dengan pangkat/golongan; pangkat pengikut diambil dari data pegawai lewat NIP */
const petugas = s => { const e = pegOf(s), byNip = n => (n && D.emp.find(x => x.nip === n)) || {};
  const e0 = emp(s.empId) || byNip(e.nip), p0 = isP3K(e, e0);
  return [{nama:e.nama, nip:e.nip, jabatan:e.jabatan, p3k:p0, pg:p0 ? '' : pgk(e.pangkat, e.gol)}, ...(s.fol || []).map(f => { const m = byNip(f.nip), k = isP3K(f, m); return {nama:f.nama, nip:f.nip, jabatan:f.jabatan || m.jabatan, p3k:k, pg:k ? '' : (q => pgk(q.pangkat, q.gol))(fpg(f, m))}; })].filter(p => p.nama); };
/* orang yang masing-masing dibuatkan SPD: pegawai utama lalu tiap pengikut (pangkat pengikut dari data pegawai lewat NIP) */
const spdPeople = s => { const e = pegOf(s), byNip = n => (n && D.emp.find(x => x.nip === n)) || {};
  const e0 = emp(s.empId) || byNip(e.nip), p0 = isP3K(e, e0);
  const a = [{nama:e.nama, jabatan:e.jabatan, p3k:p0, pangkat:p0 ? '' : nil(e.pangkat), gol:p0 ? '' : nil(e.gol)}, ...(s.fol || []).map(f => { const m = byNip(f.nip), k = isP3K(f, m); return {nama:f.nama, jabatan:f.jabatan || m.jabatan, p3k:k, ...(k ? {pangkat:'', gol:''} : fpg(f, m))}; })].filter(p => p.nama);
  return a.length ? a : [{}]; };
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
  const dasar = [...(s.stNo ? [`Surat Tugas ${signerOf(s, 'stS').jabatan || c.jabatan} Nomor ${s.stNo}${s.stTgl ? ' tanggal ' + dts(s.stTgl) : ''}`] : []), `Surat Perintah Perjalanan Dinas${s.no ? ' Nomor ' + s.no : ''}`, ...lines(r.dasar)].join('\n');
  const keg = r.keg || `${dt(s.tb)} berangkat dari ${s.asal || '-'} ke ${s.tujuan}\n${dt(s.tk)} kembali ke ${s.asal || '-'}`;
  const hasil = r.hasil || [r.h1, r.h2, r.h3].filter(Boolean).join('\n'), Fo = (r.foto || []).map(okImg).filter(Boolean), FC = String(r.fcap || '').split('\n').map(x => x.trim());
  return `<div class="paper lap">${kop()}${ttl}${lh1('I.', 'PENDAHULUAN')}${lh2('A.', 'Latar Belakang')}${pj(r.latar)}${lh2('B.', 'Dasar Hukum')}${lst(dasar)}${lh2('C.', 'Maksud dan Tujuan')}${pj(r.mt || maksud1(s))}${lh2('D.', 'Waktu Pelaksanaan')}${pj(wkt)}${lh1('II.', 'KEGIATAN YANG DILAKSANAKAN')}${lstp(keg)}${lh1('III.', 'HASIL YANG DICAPAI')}${lstp(hasil)}${lh1('IV.', 'KESIMPULAN DAN SARAN')}${lh2('1.', 'Kesimpulan:')}${lst(r.kes, 1)}${lh2('2.', 'Saran')}${lst(r.tl, 1)}${lh1('V.', 'PENUTUP')}${pj(r.penutup || 'Demikian Laporan Hasil Perjalanan Dinas ini disusun untuk dipergunakan sebagaimana mestinya.')}
  <div class="lsig">${esc(kc('kota'))}, ${dts(r.tgl || today())}<br>Yang melakukan perjalanan dinas,</div><table class="lsn">${P.map((p, i) => `<tr><td>${i + 1}.</td><td>${esc(p.nama)}</td><td>………………………</td></tr>`).join('')}</table>${ttdOf(s, 'lap') ? `<div class="lapr"><div>Disetujui oleh,</div>${signS(docSg(s, 'lap'), true, ttdOf(s, 'lap'))}</div>` : ''}</div>` + Array.from({length:Math.ceil(Fo.length / 2)}, (_, i) => `<div class="paper lap">${i === 0 ? '<div class="lt">Dokumentasi</div>' : ''}${Fo.slice(i * 2, i * 2 + 2).map((f, k) => `<figure class="gal">${FC[i * 2 + k] ? `<figcaption>${esc(FC[i * 2 + k])}</figcaption>` : ''}<img src="${f}" alt="Dokumentasi ${i * 2 + k + 1}"></figure>`).join('')}</div>`).join('');
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
  const g = k => txt($('#l_' + k).value.trim(), 8000), o = {sppdId:s.id, no:g('no'), latar:g('latar'), dasar:g('dasar'), mt:g('mt'), wkt:g('wkt'), keg:g('keg'), hasil:g('hasil'), kes:g('kes'), tl:g('tl'), penutup:g('penutup'), tgl:okDate(g('tgl')), fcap:g('fcap'), foto:LF.filter(okImg).slice(0, 6)};
  if (final && (!o.hasil || !o.kes || !o.tgl)) return toast('Untuk status Selesai, isi Hasil yang Dicapai, Kesimpulan, dan Tanggal', 'err');
  o.status = final ? 'selesai' : 'draft'; let r = D.rep.find(x => x.sppdId === s.id); if (r) Object.assign(r, o); else D.rep.push({id:uid(), ts:nextTs(), ...o});
  if (save('rep')) { log('Laporan ' + s.no + ' (' + o.status + ')'); toast('Laporan disimpan'); render(); }
}, 'w');
/* ---------- Asisten AI (api/ai.js) ---------- */
let AIBUSY = false;
async function aiRun(retry) {
  if (AIBUSY) return; const s = D.sppd.find(x => x.id === ST.lap.id), el = $('#l_hasil'); if (!s || !el) return;
  const hasil = el.value.trim(); if (hasil.length < 30) return toast('Isi "Hasil yang Dicapai" dulu (beberapa kalimat), lalu klik Buat Isi Laporan dengan AI', 'err');
  const st = $('#ai_st'), btn = $('[data-act="aiLap"]'), over = !!$('#ai_over')?.checked; AIBUSY = true; if (btn) btn.disabled = true; if (st) st.textContent = 'AI sedang menyusun… (sekitar 5–20 detik)';
  const code = (() => { try { return sessionStorage.getItem('sppd_aicode') || ''; } catch { return ''; } })();
  try {
    const r = await fetch('/api/ai', {method:'POST', headers:{'Content-Type':'application/json', ...(Cloud.on && Cloud.token ? {Authorization:'Bearer ' + Cloud.token} : {}), ...(code ? {'x-ai-code':code} : {})}, body:JSON.stringify({kind:'laporan', ctx:{instansi:D.cfg.instansi, maksud:maksud1(s), tujuan:s.tujuan, asal:s.asal, tb:dts(s.tb), tk:dts(s.tk), orang:orang(s).length, hasil}})});
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && !retry) { AIBUSY = false; if (btn) btn.disabled = false; if (st) st.textContent = ''; return modal('Kode akses AI', `<p class="muted sm mb-2">${esc(j.error || 'Masukkan kode akses AI dari administrator.')}</p><label class="fld"><span>Kode akses</span><input id="ai_c" type="password" class="in" maxlength="100" autocomplete="off"></label>`, async () => { const c = $('#ai_c').value.trim(); if (!c) return false; try { sessionStorage.setItem('sppd_aicode', c); } catch {} setTimeout(() => aiRun(true), 50); return true; }, false, 'Lanjut'); }
    if (!r.ok || !j.ok) throw new Error(j.error || 'Layanan AI tidak tersedia (kode ' + r.status + ')');
    let n = 0; for (const k of ['latar', 'mt', 'keg', 'kes', 'tl', 'penutup']) { const e = $('#l_' + k), v = String(j.data?.[k] || '').trim(); if (e && v && (over || !e.value.trim())) { e.value = v; n++; } }
    if (st) st.textContent = n ? n + ' bagian terisi — silakan periksa & edit, lalu Simpan.' : 'Semua bagian sudah terisi (centang "Timpa" untuk mengganti).'; toast(n ? 'Isi laporan dibuat AI — periksa dan edit sebelum disimpan' : 'Tidak ada bagian kosong untuk diisi');
  } catch (e) { if (st) st.textContent = ''; toast(e.message || 'Gagal menghubungi AI', 'err'); }
  finally { AIBUSY = false; const b2 = $('[data-act="aiLap"]'); if (b2) b2.disabled = false; }
}
act('aiLap', () => aiRun(false), 'w');
act('delLap', async el => { if (!(await ask('Hapus laporan ini?', 'Hapus'))) return; D.rep = D.rep.filter(r => r.id !== el.dataset.id); save('rep'); log('Menghapus laporan'); LFid = ''; render(); }, 'w');
act('openLap', el => { ST.lap.id = el.dataset.id; render(); });
act('lapPrev', el => { ST.cetak = {id:el.dataset.id, v:'lap'}; go('cetak'); });
onCh('lapSel', el => { ST.lap.id = el.value; render(); });

pages.lap = () => {
  const s = D.sppd.find(x => x.id === ST.lap.id), e = s ? pegOf(s) : {}, r = s && D.rep.find(x => x.sppdId === s.id) || {}, ro = canW() ? '' : 'readonly';
  if (s && LFid !== s.id) { LF = [...(r.foto || [])]; LFid = s.id; }
  const ta = (k, l, n = 3, ph = '', v = r[k]) => `<label class="fld"><span>${l}</span><textarea id="l_${k}" rows="${n}" placeholder="${esc(ph)}" class="in" maxlength="8000" ${ro}>${esc(v)}</textarea></label>`, nm = 'Satu baris = satu nomor', nb = 'Satu baris = satu nomor. Awali baris dengan "- " untuk butir (•) di bawah nomor';
  return `<div class="card mb-3"><div class="toolbar">${sppdSel('lap', 'lapSel')}${s ? badge(stRep(s.id)) : ''}${s && r.id ? `<span class="apl">Persetujuan pimpinan: ${aprBadge(s, 'lap')}</span><span class="ra wrap">${aprActs(s, 'lap')}</span>` : ''}</div>${s ? `<div class="info mt-3">${I('user')}<span><b>${esc(e.nama)}</b> · NIP ${esc(e.nip)} · ${esc(e.jabatan)}<br>Tujuan: ${esc(s.tujuan)} · ${dts(s.tb)} s/d ${dts(s.tk)}</span></div>
  <div class="fgrid g2 mt-3"><label class="fld"><span>Nomor Laporan</span><input id="l_no" value="${esc(r.no)}" class="in" maxlength="200" ${ro}></label><label class="fld"><span>Tanggal Penyusunan</span><input id="l_tgl" type="date" value="${esc(r.tgl || today())}" class="in" ${ro}></label>
  ${secH('I. Pendahuluan', 'flag')}${ta('latar', 'A. Latar Belakang', 4)}${ta('dasar', 'B. Dasar Hukum tambahan (Surat Tugas & SPPD otomatis)', 4, nm)}${ta('mt', 'C. Maksud dan Tujuan (kosong = otomatis)', 3)}${ta('wkt', 'D. Waktu Pelaksanaan (kosong = otomatis)', 3)}
  ${secH('II – V. Isi Laporan', 'clipboard')}${ta('keg', 'II. Kegiatan yang Dilaksanakan (kosong = otomatis)', 4, nb)}${ta('hasil', 'III. Hasil yang Dicapai', 4, nb, r.hasil || [r.h1, r.h2, r.h3].filter(Boolean).join('\n'))}${canW() ? `<div class="col-span-full aibox"><div class="aib-h">${I('sparkles')}<b>Asisten AI</b></div><p class="muted sm">Setelah <b>Hasil yang Dicapai</b> terisi, AI menyusun Latar Belakang, Maksud dan Tujuan, Kegiatan, Kesimpulan, Saran, dan Penutup. Semua hasilnya dapat diedit sebelum disimpan. Periksa kembali isinya — AI bisa keliru. Hanya maksud, tujuan, tanggal, dan teks hasil yang dikirim; nama/NIP pegawai tidak dikirim.</p><div class="stack mt-2">${b('Buat Isi Laporan dengan AI', 'aiLap', {}, 'btn', 'sparkles')}<label class="chk"><input type="checkbox" id="ai_over"><span>Timpa isian yang sudah ada</span></label><span class="muted sm" id="ai_st" role="status"></span></div></div>` : ''}${ta('kes', 'IV.1 Kesimpulan (satu baris = satu butir)', 3, 'Satu baris = satu butir (•)')}${ta('tl', 'IV.2 Saran (satu baris = satu butir)', 3, 'Satu baris = satu butir (•)')}<div class="col-span-full">${ta('penutup', 'V. Penutup (kosong = kalimat baku)', 2)}</div>
  ${secH('Dokumentasi Foto', 'image')}<div class="col-span-full">${canW() ? `<label class="btn2 file">${I('upload')}<span>Tambah foto (maks 6)</span><input type="file" accept="image/png,image/jpeg,image/webp" multiple data-ch="addFoto" hidden></label>` : ''}<div id="fotoBox" class="phs mt-2"></div></div><div class="col-span-full">${ta('fcap', 'Keterangan foto (satu baris = satu foto, sesuai urutan; boleh dikosongkan)', 3, 'Koordinasi dengan Bagian Adm. Pembangunan Setda Kab. ...')}</div></div>
  <div class="actions">${canW() ? b('Simpan Draft', 'saveLap', {f:0}, 'btn2', 'edit') + b('Simpan & Selesai', 'saveLap', {f:1}, 'btn', 'check') : ''}${r.id ? b('Pratinjau / PDF', 'lapPrev', {id:s.id}, 'btn2', 'eye') + b('Unduh Word', 'expWord', {id:s.id}, 'btn2', 'word') + (canW() ? b('Hapus', 'delLap', {id:r.id}, 'btnd', 'trash') : '') : ''}</div>` : `<div class="empty-st">${I('file', 'big')}<p>Pilih nomor SPPD untuk mengisi laporan</p></div>`}</div>
  <div class="card">${cardH('Daftar Laporan', 'folder')}${table(['Nomor SPPD', 'Pegawai', 'Tanggal', 'Status', 'Aksi'], D.rep.map(x => { const p = D.sppd.find(q => q.id === x.sppdId) || {}; return [esc(p.no), esc(pegOf(p).nama), dts(x.tgl), badge(x.status === 'selesai' ? 'Selesai' : 'Draft'), iBtn('openLap', {id:x.sppdId}, 'chevr', 'Buka')]; }))}</div>`;
};
