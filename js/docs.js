/* ============================================================
   DOKUMEN CETAK — mengikuti format contoh:
   - Kop surat model Executive Summary Setda Prov. Sultra (logo kiri, 3 baris, garis tebal)
   - Surat Tugas, SPD, Lampiran SPD model contoh SPT
   - Tanda tangan manual (basah): ruang tanda tangan dibiarkan kosong, tanpa catatan kaki
   - Seluruh isi dokumen Arial 12 pt, kecuali kop surat
   Semua teks kop & penanda tangan dapat diubah di menu Pengaturan Instansi.
   ============================================================ */
'use strict';
const KOPDEF = {
  kop1:'PEMERINTAH PROVINSI SULAWESI TENGGARA', kop2:'SEKRETARIAT DAERAH',
  kop3:'Kompleks Bumi Praja Anduonohu Tlp. 391609 Fax (0401) 391614 Kendari 93232',
  kopMode:'teks', kopImg:'', kota:'Kendari'
};
const KOPLOGO = 'assets/logo-sultra.png';
const kc = k => { const v = D.cfg[k]; return v === undefined || v === null || (v === '' && k !== 'kopImg') ? KOPDEF[k] : v; };

/* Angka → terbilang (untuk "4 (empat) hari") */
function terbilang(n) {
  n = Math.floor(Math.abs(+n || 0)); const a = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  const sisa = (v, d, w) => f(Math.floor(v / d)) + ' ' + w + (v % d ? ' ' + f(v % d) : '');
  const f = v => v < 12 ? a[v] : v < 20 ? f(v - 10) + ' belas' : v < 100 ? sisa(v, 10, 'puluh') : v < 200 ? 'seratus' + (v > 100 ? ' ' + f(v - 100) : '') : v < 1000 ? sisa(v, 100, 'ratus')
    : v < 2000 ? 'seribu' + (v > 1000 ? ' ' + f(v - 1000) : '') : v < 1e6 ? sisa(v, 1e3, 'ribu') : v < 1e9 ? sisa(v, 1e6, 'juta') : v < 1e12 ? sisa(v, 1e9, 'miliar') : v < 1e15 ? sisa(v, 1e12, 'triliun') : String(v);
  return f(n);
}
const hari = n => `${n} (${terbilang(n) || 'nol'}) hari`;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- Kop surat ---------- */
const kop = () => {
  const c = D.cfg;
  if (kc('kopMode') === 'gambar' && okImg(c.kopImg)) return `<div class="kopimg"><img src="${okImg(c.kopImg)}" alt="Kop surat"></div>`;
  const lg = okImg(c.logo) || KOPLOGO;
  return `<div class="kop2"><img class="kop2-l" src="${lg}" alt=""><div class="kop2-t"><div class="k1">${esc(kc('kop1'))}</div><div class="k2">${esc(kc('kop2'))}</div><div class="k3">${esc(kc('kop3'))}</div></div></div>`;
};

/* ---------- Tanda tangan (manual/basah) ---------- */
const sgPk = p => p ? `<div class="tte-p">${esc(p)}</div>` : '';
/* blok tanda tangan: jabatan, ruang kosong untuk tanda tangan basah, nama, pangkat (bila ada), NIP; box=false → rata kiri */
function sign(jab, nama, nip, box = true, pk = '', ttd = null) {
  jab = esc((jab || '').toUpperCase()); const nm = esc(nama || '...............................'), np = nip && nip !== '-' ? 'NIP. ' + esc(nip) : 'NIP.';
  return `<div class="${box ? 'sgb' : 'sgb nb'}"><div class="tte-j">${jab},</div><div class="sg-sp">${ttd ? `<img class="ttd-img" src="${esc(ttd.img)}" alt="Tanda tangan elektronik">` : ''}</div><div class="tte-n">${nm}</div>${sgPk(pk)}<div class="tte-p">${np}</div>${ttd ? `<div class="ttd-n">Disetujui secara elektronik · ${dts(ttd.at)}</div>` : ''}</div>`;
}
const signS = (sg, box, ttd) => sign(sg.jabatan, sg.nama, sg.nip, box, sg.pangkat, ttd);
const issued = (tgl, cls = '') => `<table class="iss ${cls}"><tr><td>Dikeluarkan di</td><td>: ${esc(kc('kota'))}</td></tr><tr><td>Pada tanggal</td><td>: ${dts(tgl)}</td></tr></table>`;
const page = (cls, body, nokop) => `<div class="paper fx ${cls}">${nokop ? '' : kop()}<div class="pbody">${body}</div></div>`;

/* ---------- Surat Tugas ---------- */
function dST(s) {
  const P = petugas(s), n = lama(s.tb, s.tk), ds = String(s.dasar || '').split(/;|\n/).map(x => x.trim()).filter(Boolean), sg = signerOf(s, 'stS'), U = untuk(s);
  const ol = a => `<ol class="ol">${a.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`, kv = (a, b) => `<tr><td class="k1">${a}</td><td>: ${esc(b || '-')}</td></tr>`;
  const row = (l, v, cls = '') => `<tr><td class="l1">${l}</td><td class="l2">:</td><td class="${cls}">${v}</td></tr>`;
  return page('st', `<div class="st-t">SURAT TUGAS</div><div class="st-n">Nomor : ${esc(s.stNo || '...............................')}</div>
  <table class="lbl st-l">${row('Dasar', ds.length > 1 ? ol(ds) : esc(ds[0] || '-'), 'just2')}</table>
  <div class="st-m">MENUGASKAN:</div>
  <table class="lbl st-l">${row('Kepada', P.map(p => `<table class="st-p">${kv('Nama', p.nama)}${kv('Jabatan', p.jabatan)}${kv('NIP', fmtNip(p.nip))}${kv('Pangkat/Gol', p.pg)}</table>`).join(''))}
  ${row('Selama', `${n} (${terbilang(n).toLowerCase()}) hari dari tanggal ${perST(s)}.`)}
  ${row('Untuk', esc(U.head) + (U.items.length ? ol(U.items) : ''), 'just2')}</table>
  <p class="st-d">Demikian Surat Tugas ini dibuat untuk dilaksanakan dengan penuh rasa tanggung jawab.</p>
  <div class="sgw st-s"><div class="st-k">${esc(kc('kota'))}, ${dts(s.stTgl || s.tgl)}</div>${signS(sg, true, ttdOf(s, 'st'))}</div>`);
}

/* ---------- SPD (lembar depan) ---------- */
function dSPPD1(s, e) {
  const bd = s.bud || {}, c = D.cfg, F = [], n = lama(s.tb, s.tk), sg = signerOf(s, 'spdS');
  const r1 = (no, l, v, cl = '') => `<tr><td class="c-no">${no}</td><td colspan="2">${l}</td><td colspan="2" class="${cl}">${v}</td></tr>`;
  const ab = (no, rows) => rows.map(([l, v], i) => `<tr>${i === 0 ? `<td class="c-no" rowspan="${rows.length}">${no}</td>` : ''}<td class="c-ab">${'abc'[i]}.</td><td>${l}</td><td class="c-ab">${'abc'[i]}.</td><td>${v}</td></tr>`).join('');
  const fol = F.length ? F : [{}, {}];
  return page('spd', `<table class="lbl lbr"><tr><td>Lembar ke</td><td>: 1</td></tr><tr><td>Kode No</td><td>: </td></tr><tr><td>Nomor</td><td>: ${esc(s.no)}</td></tr></table>
  <div class="ttl1 u">SURAT PERJALANAN DINAS (SPD)</div>
  <table class="dt spdt"><colgroup><col class="cw-no"><col class="cw-ab"><col class="cw-l"><col class="cw-ab"><col></colgroup>${r1(1, 'Pejabat Pembuat Komitmen', '<b>' + esc(s.pejabat || c.jabatan) + '</b>')}${r1(2, 'Nama Pegawai Yang di Perintah', esc(e.nama))}
  ${ab(3, [['Pangkat dan Golongan', esc(e.pangkat) + (e.gol ? ' Gol. ' + esc(e.gol) : '')], ['Jabatan', esc(e.jabatan)], ['Tingkat Biaya Perjalanan Dinas', esc(s.tingkat || '')]])}
  ${r1(4, 'Maksud Perjalanan Dinas', esc(maksud1(s)))}${r1(5, 'Alat Angkut yang dipergunakan', esc(s.alat))}
  ${ab(6, [['Tempat Berangkat', esc(s.asal)], ['Tempat Tujuan', esc(s.tujuan) + (s.inst ? ' (' + esc(s.inst) + ')' : '')]])}
  ${ab(7, [['Lamanya Perjalanan Dinas', hari(n)], ['Tanggal berangkat', dts(s.tb)], ['Tanggal Harus Kembali', dts(s.tk)]])}
  <tr><td class="c-no" rowspan="${fol.length + 1}">8.</td><td colspan="2">Pengikut : nama</td><td colspan="2" class="ctr">Keterangan</td></tr>${fol.map((f, i) => `<tr><td class="c-ab">${f.nama ? i + 1 : '&nbsp;'}</td><td>${esc(f.nama)}</td><td colspan="2">${esc(f.jabatan)}</td></tr>`).join('')}
  <tr><td class="c-no" rowspan="3">9</td><td colspan="2">Pembebanan Anggaran</td><td colspan="2">${esc(bd.sumber || '')}${bd.ta ? ' TA ' + esc(bd.ta) : ''}</td></tr><tr><td class="c-ab">a.</td><td>Instansi</td><td class="c-ab">a.</td><td>${esc(c.instansi)}</td></tr><tr><td class="c-ab">b.</td><td>Akun</td><td class="c-ab">b.</td><td>${esc(s.mata || bd.rek || '')}</td></tr>
  ${r1(10, 'Keterangan Lain-lain', esc(s.ket || ''))}</table><div class="crt">*Coret yang tidak perlu</div>
  <div class="sgw">${issued(s.tgl)}${signS(sg, true, ttdOf(s, 'spd'))}</div>`);
}

/* ---------- Lampiran SPD (lembar belakang) — tanpa kop surat ---------- */
function dLamp(s) {
  /* Lembar belakang SPD — mengikuti FORMAT_SPPD_BARU_2025 (sheet "Belakang"): blok I–VI, VII Catatan Lain, VIII Perhatian (tanpa Paraf Hierarki) */
  const sg = signerOf(s, 'spdS'), c = D.cfg, tt = ttdOf(s, 'spd'), L = rows => `<table class="kv3">${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b === null ? '' : ': ' + (b || '')}</td></tr>`).join('')}</table>`;
  const nn = '<div class="lnm"><div class="lnl"></div><div>NIP.</div></div>';
  const tiba = (a = '', d = '') => L([['Tiba di', esc(a)], ['Pada Tanggal', d], ['Kepala', ''], ['&nbsp;', null]]);
  const brk = (a = '', b = '', d = '') => L([['Berangkat dari', esc(a)], ['Ke', esc(b)], ['Pada Tanggal', d], ['Kepala', '']]);
  const blk = (n, l, r, rc = '') => `<tr class="lb"><td class="c-rn">${n}</td><td class="lc">${l}${nn}</td><td class="lc rt ${rc}">${r}</td></tr>`;
  const att = `${esc(c.jabatan || 'Pejabat Pembuat Komitmen')}${c.provinsi ? ' Prov. ' + esc(c.provinsi) : ''} yang menerbitkan SPD, pegawai yang melakukan perjalanan dinas, para pejabat yang mengesahkan tanggal berangkat/tiba, serta bendahara pengeluaran bertanggung jawab berdasarkan peraturan-peraturan Keuangan Negara apabila negara menderita rugi akibat kesalahan, kelalaian, dan kealpaannya.`;
  return page('lamp', `<table class="lampt"><colgroup><col class="ca"><col class="cb"><col class="cc"></colgroup>
  <tr class="r1"><td colspan="2" class="lc"></td><td class="lc rt"><span class="lrn">I.</span>${L([['Berangkat dari', esc(s.asal)], ['(Tempat Kedudukan)', null], ['Ke', esc(s.tujuan)], ['Pada Tanggal', dts(s.tb)]])}<div class="lgap"></div>${signS(sg, false, tt)}</td></tr>
  ${blk('II.', tiba(s.tujuan, dts(s.tb)), brk(s.tujuan, s.asal, dts(s.tk)))}
  ${blk('III.', tiba(), brk())}
  ${blk('IV.', tiba(), brk())}
  ${blk('V.', tiba(), brk())}
  ${blk('VI.', tiba(), 'Telah diperiksa, dengan keterangan bahwa perjalanan tersebut di atas benar dilakukan atas perintahnya dan semata-mata untuk kepentingan jabatan dalam waktu yang sesingkat-singkatnya.', 'just2 ltop')}
  <tr class="l7"><td class="c-rn">VII.</td><td colspan="2" class="ls">Catatan Lain</td></tr>
  <tr class="l8"><td class="c-rn">VIII.</td><td colspan="2" class="ls just2">PERHATIAN :<br>${att}</td></tr></table>
  <div class="lbot"><div class="lsgn">${signS(sg, true, tt)}</div></div>`, true);
}

/* ---------- Rincian Biaya Perjalanan Dinas & Kuitansi (tanda tangan basah) ---------- */
const wet = (ttl, nama, nip, pk = '') => `<div class="wsg"><div>${ttl}</div><div class="sg-sp"></div><div class="tte-n">${esc(nama || '...............................')}</div>${sgPk(pk)}<div>${nip && nip !== '-' ? 'NIP. ' + esc(nip) : 'NIP.'}</div></div>`;
const terbRp = n => cap(terbilang(n) || 'nol') + ' rupiah';
function dBiaya(s) {
  const c = D.cfg, e = pegOf(s), B = s.biaya || [], tot = totB(s), ppk = signerOf(s, 'spdS');
  return `<div class="paper rb">${kop()}<div class="ttl1">RINCIAN BIAYA PERJALANAN DINAS</div>
  <table class="lbl rbh"><tr><td class="l1w">Lampiran SPD Nomor</td><td class="l2">:</td><td>${esc(s.no)}</td></tr><tr><td>Tanggal</td><td>:</td><td>${dts(s.tgl)}</td></tr></table>
  <table class="dt rbt"><tr class="th"><td class="c-no">No.</td><td>Perincian Biaya</td><td class="c-jm">Jumlah</td><td class="c-kt">Keterangan</td></tr>
  ${B.map((x, i) => `<tr><td class="c-no">${i + 1}</td><td>${esc(x.ur)}</td><td class="num">${rupiah(x.vol * x.hrg)}</td><td>${x.vol} ${esc(x.sat)} × ${rupiah(x.hrg)}</td></tr>`).join('') || '<tr><td class="c-no">&nbsp;</td><td></td><td></td><td></td></tr>'}
  <tr class="th"><td></td><td>Jumlah</td><td class="num">${rupiah(tot)}</td><td></td></tr>
  <tr><td></td><td colspan="3">Terbilang: <i>${esc(terbRp(tot))}</i></td></tr></table>
  <div class="sg2c"><div>&nbsp;<br>Telah dibayar sejumlah<br><b>${rupiah(tot)}</b>${wet('Bendahara Pengeluaran,', c.bendahara, c.nipBend)}</div><div>${esc(kc('kota'))}, ${dts(s.tgl)}<br>Telah menerima jumlah uang sebesar<br><b>${rupiah(tot)}</b>${wet('Yang Menerima,', e.nama, e.nip)}</div></div>
  <div class="rbl"></div><div class="ttl3">PERHITUNGAN SPD RAMPUNG</div>
  <table class="lbl rbh"><tr><td class="l1w">Ditetapkan sejumlah</td><td class="l2">:</td><td>${rupiah(tot)}</td></tr><tr><td>Yang telah dibayar semula</td><td>:</td><td>${rupiah(tot)}</td></tr><tr><td>Sisa kurang/lebih</td><td>:</td><td>${rupiah(0)}</td></tr></table>
  <div class="sg2c"><div></div><div>${wet(esc(ppk.jabatan || 'Pejabat Pembuat Komitmen') + ',', ppk.nama, ppk.nip, ppk.pangkat)}</div></div></div>`;
}
function dKwit(s) {
  const c = D.cfg, e = pegOf(s), bd = s.bud || {}, tot = totB(s), ppk = signerOf(s, 'spdS'), n = lama(s.tb, s.tk);
  return `<div class="paper rb">${kop()}<div class="ttl1 u">KUITANSI</div>
  <table class="lbl kwt"><tr><td class="l1w">Tahun Anggaran</td><td class="l2">:</td><td>${esc(bd.ta || c.ta)}</td></tr><tr><td>Kode Rekening</td><td>:</td><td>${esc(s.mata || bd.rek || '')}</td></tr>
  <tr><td>Sudah terima dari</td><td>:</td><td>Bendahara Pengeluaran ${esc(c.instansi)}</td></tr><tr><td>Uang sebesar</td><td>:</td><td class="amt">${rupiah(tot)}</td></tr><tr><td>Terbilang</td><td>:</td><td><i>${esc(terbRp(tot))}</i></td></tr>
  <tr><td>Untuk pembayaran</td><td>:</td><td class="just2">Biaya perjalanan dinas dalam rangka ${esc(s.maksud)}${s.tujuan ? ' di ' + esc(s.tujuan) : ''} selama ${hari(n)}, tanggal ${dts(s.tb)} s/d ${dts(s.tk)}, sesuai SPD Nomor ${esc(s.no)} tanggal ${dts(s.tgl)}.</td></tr></table>
  <div class="sg3c"><div>Setuju dibayar,${wet(esc(ppk.jabatan || 'Pejabat Pembuat Komitmen') + ',', ppk.nama, ppk.nip, ppk.pangkat)}</div><div>Lunas dibayar,${wet('Bendahara Pengeluaran,', c.bendahara, c.nipBend)}</div><div>${esc(kc('kota'))}, ${dts(s.tgl)}${wet('Yang menerima,', e.nama, e.nip)}</div></div></div>`;
}
const hasB = s => (s.biaya || []).length > 0;
/* SPD dibuat per orang (pegawai + tiap pengikut); poin 8 (pengikut) dikosongkan; Lampiran SPD menyertai tiap SPD */
const dSPPD = s => spdPeople(s).map(p => dSPPD1(s, p)).join(''), dLampN = s => spdPeople(s).map(() => dLamp(s)).join(''), dSPDset = s => spdPeople(s).map(p => dSPPD1(s, p) + dLamp(s)).join('');
const docs = (s, v) => v === 'st' ? dST(s) : v === 'sppd' ? dSPPD(s) : v === 'lamp' ? dLampN(s) : v === 'biaya' ? dBiaya(s) + dKwit(s) : v === 'lap' ? dLap(s) : dST(s) + dSPDset(s) + (hasB(s) ? dBiaya(s) + dKwit(s) : '') + dLap(s);

