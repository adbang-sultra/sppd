/* ============================================================
   EKSPOR WORD (.docx asli): kop surat di HEADER, tanpa catatan kaki,
   ruang tanda tangan dikosongkan (tanda tangan manual), isi Arial 12 pt (kecuali kop).
   Pustaka docx (MIT) dimuat dari js/vendor hanya saat dibutuhkan.
   Bisa dibuka di MS Word, WPS Office, LibreOffice & Google Docs.
   ============================================================ */
'use strict';
let DX = null;
const loadDocx = () => DX ? Promise.resolve(DX) : new Promise((ok, no) => {
  const s = document.createElement('script'); s.src = 'js/vendor/docx.iife.js';
  s.onload = () => { DX = window.docx; DX ? ok(DX) : no(new Error('Pustaka Word gagal dimuat')); }; s.onerror = () => no(new Error('Pustaka Word gagal dimuat')); document.head.appendChild(s);
});
async function imgBytes(src) {
  if (!src) return null;
  try {
    let buf, t;
    if (src.startsWith('data:')) { const m = src.match(/^data:image\/(png|jpeg|webp);base64,(.*)$/); if (!m) return null; t = m[1]; buf = ub(m[2]); }
    else { const r = await fetch(src); buf = new Uint8Array(await r.arrayBuffer()); t = (r.headers.get('content-type') || 'image/png').split('/')[1]; }
    const im = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(new Blob([buf], {type:'image/' + t})); });
    if (t === 'webp') { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); buf = ub(c.toDataURL('image/png').split(',')[1]); t = 'png'; }
    return {data:buf, type:t === 'jpeg' ? 'jpg' : 'png', w:im.naturalWidth, h:im.naturalHeight};
  } catch { return null; }
}

/* Kop teks digambar ke kanvas (font lokal) → PNG, agar identik di Word/WPS/LibreOffice */
async function kopPNG() {
  try { await Promise.all(["700 40px Tinos", "400 40px Tinos", "40px Caprasimo"].map(f => document.fonts.load(f))); } catch {}
  const S = 12, W = 170 * S, H = 31 * S, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const lg = await new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = okImg(D.cfg.logo) || KOPLOGO; });
  const lh = 23 * S; let lw = 0; if (lg) { lw = lh * lg.naturalWidth / lg.naturalHeight; g.drawImage(lg, -S, 1.2 * S, lw, lh); }
  const cx = lw + (W - lw) / 2 - 2 * S; g.fillStyle = '#000'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const fit = (t, font, y, sp = 0) => { g.font = font; if ('letterSpacing' in g) g.letterSpacing = sp + 'px'; let m = g.measureText(t).width, max = W - lw - 4 * S; if (m > max) { const k = max / m; g.save(); g.translate(cx, y); g.scale(k, 1); g.fillText(t, 0, 0); g.restore(); } else g.fillText(t, cx, y); };
  g.wordSpacing = '6px'; fit(kc('kop1'), `700 ${4.76 * S}px Tinos, 'Times New Roman', serif`, 7.4 * S, .1 * S); g.wordSpacing = '0px';
  fit(kc('kop2'), `400 ${7.8 * S}px Caprasimo, 'Cooper Black', serif`, 16.2 * S, .45 * S);
  fit(kc('kop3'), `400 ${3.4 * S}px Tinos, 'Times New Roman', serif`, 21.6 * S, 0);
  g.fillRect(0, H - 2.6 * S, W, 2.4 * S);
  return {data:ub(cv.toDataURL('image/png').split(',')[1]), type:'png', w:W, h:H};
}
async function buildDocx(s, v) {
  const X = await loadDocx(), c = D.cfg;
  const {Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, ImageRun, Header, Footer, PageNumber, VerticalAlign, TabStopType, PageBreak} = X;
  const TNR = 'Times New Roman', CW = 9638;                         /* lebar isi A4 (twip) dengan margin 2 cm */
  const NONE = {style:BorderStyle.NONE, size:0, color:'FFFFFF'}, NB = {top:NONE, bottom:NONE, left:NONE, right:NONE, insideHorizontal:NONE, insideVertical:NONE};
  const LINE = {style:BorderStyle.SINGLE, size:6, color:'000000'}, BB = {top:LINE, bottom:LINE, left:LINE, right:LINE, insideHorizontal:LINE, insideVertical:LINE};
  const AR = 'Arial', SZ = 24;                                       /* isi dokumen: Arial 12 pt; o.kop=1 hanya untuk teks kop surat */
  const R = (t, o = {}) => new TextRun({text:String(t ?? ''), bold:o.b, underline:o.u ? {} : undefined, italics:o.i, size:o.kop ? o.sz : SZ, font:o.kop ? o.f : AR, break:o.br});
  const P = (k, o = {}) => new Paragraph({children:(Array.isArray(k) ? k : [R(k, o)]), alignment:o.al === 'c' ? AlignmentType.CENTER : o.al === 'r' ? AlignmentType.RIGHT : o.al === 'j' ? AlignmentType.JUSTIFIED : AlignmentType.LEFT, spacing:{before:o.bf || 0, after:o.af ?? 0, ...(o.ln ? {line:o.ln, lineRule:'auto'} : {})}, indent:o.ind, keepNext:o.kn, border:o.bd, tabStops:o.tabs, pageBreakBefore:o.pb});
  const C = (ch, o = {}) => new TableCell({children:(Array.isArray(ch) ? ch : [ch]).map(x => typeof x === 'string' ? P(x, o) : x), width:o.w ? {size:o.w, type:WidthType.DXA} : undefined, columnSpan:o.cs, rowSpan:o.rs, verticalAlign:o.va === 'c' ? VerticalAlign.CENTER : VerticalAlign.TOP, borders:o.nb ? {top:NONE, bottom:NONE, left:NONE, right:NONE} : o.bd, margins:{top:o.mt ?? 15, bottom:o.mb ?? 15, left:o.ml ?? 90, right:o.mr ?? 90}});
  const T = (rows, widths, o = {}) => new Table({rows:rows.map(r => r instanceof TableRow ? r : new TableRow({children:r, height:o.rh ? {value:o.rh, rule:'atLeast'} : undefined, cantSplit:true})), width:{size:widths.reduce((a, b) => a + b, 0), type:WidthType.DXA}, columnWidths:widths, borders:o.nb ? NB : BB, indent:o.ind ? {size:o.ind, type:WidthType.DXA} : undefined, layout:'fixed'});
  const sp = n => P('', {af:n});

  /* ----- Kop (header) ----- */
  const kopImg = (kc('kopMode') === 'gambar' && okImg(c.kopImg) ? await imgBytes(c.kopImg) : null) || await kopPNG();
  const logo = null;
  const kopHdr = () => {
    if (kopImg) { const w = 640; return [new Paragraph({children:[new ImageRun({type:kopImg.type, data:kopImg.data, transformation:{width:w, height:Math.round(w * kopImg.h / kopImg.w)}})], alignment:AlignmentType.CENTER})]; }
    const lw = 86, lh = logo ? Math.round(lw * logo.h / logo.w) : 0;
    return [T([[C(logo ? new Paragraph({children:[new ImageRun({type:logo.type, data:logo.data, transformation:{width:lw, height:lh}})]}) : P(''), {w:1500, nb:1, va:'c', ml:0}),
      C([P(kc('kop1'), {al:'c', b:1, sz:27, f:TNR, kop:1}), P(kc('kop2'), {al:'c', sz:44, f:'Cooper Black', b:0, kop:1}), P(kc('kop3'), {al:'c', sz:19, f:TNR, kop:1})], {w:CW - 1500, nb:1, va:'c'})]], [1500, CW - 1500], {nb:1}),
      P('', {af:0, ln:120, bd:{bottom:{style:BorderStyle.SINGLE, size:36, color:'000000', space:1}}})];
  };

  /* ----- Tanda tangan ----- */
  const SG = signerOf(s, 'spdS');
  /* tanda tangan basah: jabatan, ruang kosong, nama, pangkat (bila ada), NIP */
  const signParas = (box, sg = SG, gap = box ? 1300 : 1000) => { const al = 'l', nip = sg.nip && sg.nip !== '-' ? 'NIP. ' + sg.nip : 'NIP.';
    return [P((sg.jabatan || '').toUpperCase() + ',', {b:1, al}), sp(gap), P([R(sg.nama || '..............................', {b:1, u:1})], {al}), ...(sg.pangkat ? [P(sg.pangkat, {al})] : []), P(nip, {al})]; };
  const SL = Math.round(CW * .40), SR = CW - SL;                       /* blok tanda tangan: kolom kanan, rata kiri (seperti contoh SPT) */
  const signBox = (sg, gap) => T([[C(signParas(true, sg, gap), {w:SR, nb:1, ml:0})]], [SR], {nb:1});
  const issuedT = tgl => T([[C('Dikeluarkan di', {w:1900, nb:1, ml:0}), C(': ' + kc('kota'), {w:2900, nb:1})], [C('Pada tanggal', {w:1900, nb:1, ml:0}), C(': ' + dts(tgl), {w:2900, nb:1})]], [1900, 2900], {nb:1});
  const signArea = (tgl, sg = SG, gap, place) => T([[C('', {w:SL, nb:1}), C([...(place ? [P(kc('kota') + ', ' + dts(tgl), {af:0})] : tgl ? [issuedT(tgl), sp(160)] : []), signBox(sg, gap)], {w:SR, nb:1, ml:0})]], [SL, SR], {nb:1});

  /* ----- Surat Tugas ----- */
  const ST = () => { const Pt = petugas(s), n = lama(s.tb, s.tk), ds = String(s.dasar || '').split(/;|\n/).map(x => x.trim()).filter(Boolean), sg = signerOf(s, 'stS'), U = untuk(s);
    const L = 1250, M = 300, R2 = CW - L - M, K = 1700, G = 220;
    const num = (a, bf = 0) => a.map((x, i) => P(`${i + 1}.\t${x}`, {al:'j', ind:{left:360, hanging:360}, tabs:[{type:'left', position:360}], bf:i ? 0 : bf}));
    const row = (lab, kids, bf = 0) => [C([P(lab, {bf})], {w:L, nb:1, ml:0}), C([P(':', {bf})], {w:M, nb:1}), C(kids, {w:R2, nb:1})];
    const orang = Pt.flatMap((p, i) => [T([['Nama', p.nama], ['Jabatan', p.jabatan], ['NIP', fmtNip(p.nip)], ['Pangkat/Gol', p.pg]].map(([a, v]) => [C(a, {w:K, nb:1, ml:0, mt:0, mb:0}), C(': ' + (v || '-'), {w:R2 - K, nb:1, mt:0, mb:0})]), [K, R2 - K], {nb:1}), ...(i < Pt.length - 1 ? [sp(100)] : [])]);
    return [P([R('SURAT TUGAS', {b:1, u:1})], {al:'c'}), P('Nomor : ' + (s.stNo || '...............................'), {al:'c', af:300}),
      T([row('Dasar', ds.length > 1 ? num(ds) : [P(ds[0] || '-', {al:'j'})])], [L, M, R2], {nb:1}),
      P((sg.jabatan || '').toUpperCase(), {al:'c', b:1, bf:300, af:200}), P('MENUGASKAN:', {al:'c', af:280}),
      T([row('Kepada', orang), row('Selama', [P(`${n} (${terbilang(n).toLowerCase()}) hari dari tanggal ${perST(s)}.`, {bf:G})], G),
        row('Untuk', [P(U.head, {al:'j', bf:G}), ...num(U.items)], G)], [L, M, R2], {nb:1}),
      P('Demikian Surat Tugas ini dibuat untuk dilaksanakan dengan penuh rasa tanggung jawab.', {al:'j', bf:280, af:360, ind:{firstLine:680}}),
      signArea(s.stTgl || s.tgl, sg, 1300, true)];
  };
  /* ----- SPD ----- */
  const SPD = () => { const e = pegOf(s), bd = s.bud || {}, n = lama(s.tb, s.tk), F = (s.fol || []).length ? s.fol : [{}, {}], W = [480, 420, 3100, 420, CW - 4420], Z = {sz:20, ln:216}, AB = {ml:50, mr:20};
    const r1 = (no, l, val, b) => [C(String(no), {w:W[0], al:'c', ...Z}), C(l, {w:W[1] + W[2], cs:2, ...Z}), C(P([R(val, {b, sz:20})]), {w:W[3] + W[4], cs:2})];
    const ab = (no, rows) => rows.map(([l, val], i) => [...(i === 0 ? [C(String(no), {w:W[0], al:'c', rs:rows.length, ...Z})] : []), C('abc'[i] + '.', {w:W[1], ...Z, ...AB}), C(l, {w:W[2], ...Z}), C('abc'[i] + '.', {w:W[3], ...Z, ...AB}), C(val, {w:W[4], ...Z})]);
    const rows = [r1(1, 'Pejabat Pembuat Komitmen', s.pejabat || c.jabatan, 1), r1(2, 'Nama Pegawai Yang di Perintah', e.nama),
      ...ab(3, [['Pangkat dan Golongan', (e.pangkat || '') + (e.gol ? ' Gol. ' + e.gol : '')], ['Jabatan', e.jabatan], ['Tingkat Biaya Perjalanan Dinas', s.tingkat]]),
      r1(4, 'Maksud Perjalanan Dinas', maksud1(s)), r1(5, 'Alat Angkut yang dipergunakan', s.alat),
      ...ab(6, [['Tempat Berangkat', s.asal], ['Tempat Tujuan', (s.tujuan || '') + (s.inst ? ' (' + s.inst + ')' : '')]]),
      ...ab(7, [['Lamanya Perjalanan Dinas', hari(n)], ['Tanggal berangkat', dts(s.tb)], ['Tanggal Harus Kembali', dts(s.tk)]]),
      [C('8.', {w:W[0], al:'c', rs:F.length + 1, ...Z}), C('Pengikut : nama', {w:W[1] + W[2], cs:2, ...Z}), C('Keterangan', {w:W[3] + W[4], cs:2, al:'c', ...Z})],
      ...F.map((f, i) => [C(f.nama ? String(i + 1) : '', {w:W[1], ...Z, ...AB}), C(f.nama || '', {w:W[2], ...Z}), C(f.jabatan || '', {w:W[3] + W[4], cs:2, ...Z})]),
      [C('9', {w:W[0], al:'c', rs:3, ...Z}), C('Pembebanan Anggaran', {w:W[1] + W[2], cs:2, ...Z}), C((bd.sumber || '') + (bd.ta ? ' TA ' + bd.ta : ''), {w:W[3] + W[4], cs:2, ...Z})],
      [C('a.', {w:W[1], ...Z, ...AB}), C('Instansi', {w:W[2], ...Z}), C('a.', {w:W[3], ...Z, ...AB}), C(c.instansi, {w:W[4], ...Z})], [C('b.', {w:W[1], ...Z, ...AB}), C('Akun', {w:W[2], ...Z}), C('b.', {w:W[3], ...Z, ...AB}), C(s.mata || bd.rek || '', {w:W[4], ...Z})],
      r1(10, 'Keterangan Lain-lain', s.ket || '')];
    return [T([[C('Lembar ke', {w:1700, nb:1, ...Z}), C(': 1', {w:2800, nb:1, ...Z})], [C('Kode No', {w:1700, nb:1, ...Z}), C(':', {w:2800, nb:1, ...Z})], [C('Nomor', {w:1700, nb:1, ...Z}), C(': ' + s.no, {w:2800, nb:1, ...Z})]], [1700, 2800], {nb:1, ind:CW - 4500}),
      P([R('SURAT PERJALANAN DINAS (SPD)', {b:1, u:1})], {al:'c', bf:120, af:100}), T(rows, W), P('*Coret yang tidak perlu', {sz:18}), signArea(s.tgl, SG, 900)];
  };
  /* ----- Lampiran SPD ----- */
  const LAMP = () => { const W = [520, 4559, 4559], Z = {sz:20, ln:216};
    const kv = rows => T(rows.map(([a, b2]) => [C(a, {w:1850, nb:1, ml:0, mt:0, mb:0, ...Z}), C(': ' + (b2 || ''), {w:2500, nb:1, mt:0, mb:0, ...Z})]), [1850, 2500], {nb:1});
    const tiba = (a, d) => kv([['Tiba di', a], ['Pada Tanggal', d], ['Kepala', '']]), brk = (a, b2, d) => kv([['Berangkat dari', a], ['Ke', b2], ['Pada Tanggal', d], ['Kepala', '']]);
    const rn = t => C(t, {w:W[0], al:'c', ...Z}), RH = 900;
    return [T([[rn('I'), C('', {w:W[1]}), C([brk(s.asal, s.tujuan, dts(s.tb)), ...signParas(false, SG, 800)], {w:W[2]})],
      [rn('II'), C(tiba(s.tujuan, dts(s.tb)), {w:W[1]}), C(brk(s.tujuan, s.asal, dts(s.tk)), {w:W[2]})],
      [rn('III'), C(tiba(), {w:W[1]}), C(brk(), {w:W[2]})], [rn('IV'), C(tiba(), {w:W[1]}), C(brk(), {w:W[2]})],
      [rn('V'), C(tiba(), {w:W[1]}), C(P('Telah diperiksa dengan keterangan bahwa perjalanan tersebut diatas benar dilakukan atas perintahnya dan semata-mata untuk kepentingan jabatan dalam waktu yang sesingkat-singkatnya.', {al:'j', ...Z}), {w:W[2]})],
      [rn('VI'), C('Catatan lain-lain :', {w:W[1] + W[2], cs:2, ...Z})],
      [C('', {w:W[0]}), C([P('PERHATIAN:', Z), P('PPK yang menerbitkan SPD, pegawai yang melakukan Perjalanan Dinas, Pejabat yang mengesahkan tanggal berangkat/tiba, serta bendahara pengeluaran bertanggung jawab berdasarkan peraturan-peraturan Keuangan Negara. Apabila negara menderita rugi akibat kesalahan, kelalaian dan kealpaannya.', {al:'j', ...Z})], {w:W[1] + W[2], cs:2})]].map((r, i) => new TableRow({children:r, cantSplit:true, height:i >= 1 && i <= 4 ? {value:RH, rule:'atLeast'} : undefined})), W),
      sp(60), signArea(null, SG, 1000)];
  };
  /* ----- Rincian Biaya & Kuitansi (tanda tangan basah) ----- */
  const BIAYA = () => { const e = pegOf(s), B = s.biaya || [], tot = totB(s), bd = s.bud || {}, n = lama(s.tb, s.tk), W = [600, 4338, 2000, 2700], Z = {sz:21}, NO = {nb:1, ml:0};
    const wet = (ttl, nama, nip, pk) => [P(ttl, Z), sp(1100), P([R(nama || '...............................', {b:1, u:1})]), ...(pk ? [P(pk, Z)] : []), P(nip && nip !== '-' ? 'NIP. ' + nip : 'NIP.', Z)];
    const kv = (rows, w = 3000) => T(rows.map(([a, v, o]) => [C(a, {w, ...NO, ...Z}), C(':', {w:300, nb:1, ...Z}), C(P([R(v, {sz:21, ...(o || {})})], {al:'j'}), {w:CW - w - 300, nb:1})]), [w, 300, CW - w - 300], {nb:1});
    const half = CW / 2, third = Math.floor(CW / 3);
    return [P('RINCIAN BIAYA PERJALANAN DINAS', {al:'c', b:1, sz:23, af:200}), kv([['Lampiran SPD Nomor', s.no], ['Tanggal', dts(s.tgl)]]), sp(160),
      T([[C('No.', {w:W[0], al:'c', b:1, ...Z}), C('Perincian Biaya', {w:W[1], b:1, ...Z}), C('Jumlah', {w:W[2], b:1, ...Z}), C('Keterangan', {w:W[3], b:1, ...Z})],
        ...B.map((x, i) => [C(String(i + 1), {w:W[0], al:'c', ...Z}), C(x.ur, {w:W[1], ...Z}), C(rupiah(x.vol * x.hrg), {w:W[2], al:'r', ...Z}), C(`${x.vol} ${x.sat} × ${rupiah(x.hrg)}`, {w:W[3], ...Z})]),
        [C('', {w:W[0]}), C('Jumlah', {w:W[1], b:1, ...Z}), C(rupiah(tot), {w:W[2], al:'r', b:1, ...Z}), C('', {w:W[3]})],
        [C('', {w:W[0]}), C(P([R('Terbilang: ', {sz:21}), R(terbRp(tot), {sz:21, i:1})]), {w:W[1] + W[2] + W[3], cs:3})]], W),
      sp(300), T([[C([P('', Z), P('Telah dibayar sejumlah', Z), P(rupiah(tot), {b:1, ...Z}), ...wet('Bendahara Pengeluaran,', c.bendahara, c.nipBend)], {w:half, ...NO}), C([P(`${kc('kota')}, ${dts(s.tgl)}`, Z), P('Telah menerima jumlah uang sebesar', Z), P(rupiah(tot), {b:1, ...Z}), ...wet('Yang Menerima,', e.nama, e.nip)], {w:half, nb:1})]], [half, half], {nb:1}),
      P('', {bf:200, af:100, bd:{top:{style:BorderStyle.SINGLE, size:6, color:'000000', space:1}}}), P('PERHITUNGAN SPD RAMPUNG', {al:'c', b:1, af:160}),
      kv([['Ditetapkan sejumlah', rupiah(tot)], ['Yang telah dibayar semula', rupiah(tot)], ['Sisa kurang/lebih', rupiah(0)]]), sp(200),
      T([[C('', {w:half, ...NO}), C(wet((SG.jabatan || 'Pejabat Pembuat Komitmen') + ',', SG.nama, SG.nip, SG.pangkat), {w:half, nb:1})]], [half, half], {nb:1}),
      P([R('KUITANSI', {b:1, u:1, sz:23})], {al:'c', pb:true, af:240}),
      kv([['Tahun Anggaran', bd.ta || c.ta], ['Kode Rekening', s.mata || bd.rek || ''], ['Sudah terima dari', 'Bendahara Pengeluaran ' + c.instansi], ['Uang sebesar', rupiah(tot), {b:1, sz:24}], ['Terbilang', terbRp(tot), {i:1}],
        ['Untuk pembayaran', `Biaya perjalanan dinas dalam rangka ${s.maksud}${s.tujuan ? ' di ' + s.tujuan : ''} selama ${hari(n)}, tanggal ${dts(s.tb)} s/d ${dts(s.tk)}, sesuai SPD Nomor ${s.no} tanggal ${dts(s.tgl)}.`]], 2600), sp(400),
      T([[C([P('Setuju dibayar,', Z), ...wet((SG.jabatan || 'Pejabat Pembuat Komitmen') + ',', SG.nama, SG.nip, SG.pangkat)], {w:third, ...NO}), C([P('Lunas dibayar,', Z), ...wet('Bendahara Pengeluaran,', c.bendahara, c.nipBend)], {w:third, nb:1}), C([P(`${kc('kota')}, ${dts(s.tgl)}`, Z), ...wet('Yang menerima,', e.nama, e.nip)], {w:CW - 2 * third, nb:1})]], [third, third, CW - 2 * third], {nb:1})];
  };
  /* ----- Laporan (format Bandung) ----- */
  const LAP = async () => { const r = D.rep.find(x => x.sppdId === s.id) || {}, Pt = petugas(s), A = 'Arial', Z = {f:A, sz:22};
    const H4 = t => P(t, {...Z, b:1, bf:240, af:80, kn:1}), H5 = t => P(t, {...Z, b:1, bf:100, af:40, ind:{left:280}, kn:1});
    const J = t => String(t || '').trim() ? P(t, {...Z, al:'j', ind:{left:560, firstLine:680}, af:120, ln:300}) : P('................................................................................................', {...Z, ind:{left:560}, af:120});
    const OL = t => { const a = lines(t); return a.length ? a.map((x, i) => P(`${i + 1}.\t${x}`, {...Z, al:'j', ind:{left:1000, hanging:360}, af:60, ln:300})) : [J('')]; };
    const wkt = r.wkt || `Kegiatan dilaksanakan pada tanggal ${dts(s.tb)} s.d ${dts(s.tk)} di ${s.tujuan || '-'}${s.inst ? ' (' + s.inst + ')' : ''}.`;
    const dasar = [...(s.stNo ? [`Surat Tugas ${signerOf(s, 'stS').jabatan || c.jabatan} Nomor ${s.stNo}${s.stTgl ? ' tanggal ' + dts(s.stTgl) : ''}`] : []), `Surat Perintah Perjalanan Dinas Nomor ${s.no}`, ...lines(r.dasar)].join('\n');
    const keg = r.keg || `${dt(s.tb)} berangkat dari ${s.asal || '-'} ke ${s.tujuan}\n${dt(s.tk)} kembali ke ${s.asal || '-'}`, hasil = r.hasil || [r.h1, r.h2, r.h3].filter(Boolean).join('\n');
    const ttl = (s.maksud || '').toUpperCase();
    const out = [P('LAPORAN HASIL PERJALANAN DINAS', {...Z, b:1, al:'c'}), P(ttl, {...Z, b:1, al:'c', af:240}),
      H4('I.\tPENDAHULUAN'), H5('A.  Latar Belakang'), J(r.latar), H5('B.  Dasar Hukum'), ...OL(dasar), H5('C.  Maksud dan Tujuan'), J(r.mt || s.maksud), H5('D.  Waktu Pelaksanaan'), J(wkt),
      H4('II.\tKEGIATAN YANG DILAKSANAKAN'), ...OL(keg), H4('III.\tHASIL YANG DICAPAI'), ...OL(hasil), H4('IV.\tKESIMPULAN DAN SARAN'), J(r.kes), H4('V.\tREKOMENDASI'), ...OL(r.tl), H4('VI.\tPENUTUP'), J(r.penutup || 'Demikian Laporan perjalanan dinas ini dibuat untuk dipergunakan sebagaimana mestinya.'),
      sp(200), P(`${kc('kota')}, ${dts(r.tgl || today())}`, {...Z, ind:{left:4300}}), P('Yang Melaporkan,', {...Z, ind:{left:4300}, af:400}),
      ...Pt.map((p, i) => P([R(`${i + 1}.\t${p.nama}`, Z), R('\t……………………', Z)], {tabs:[{type:TabStopType.LEFT, position:400}, {type:TabStopType.LEFT, position:6200}], af:500}))];
    const Fo = (r.foto || []).map(okImg).filter(Boolean);
    for (let i = 0; i < Fo.length; i++) { const im = await imgBytes(Fo[i]); if (!im) continue; const w = 480, h = Math.min(400, Math.round(w * im.h / im.w));
      if (i % 2 === 0) { out.push(P('DOKUMENTASI PERJALANAN DINAS', {...Z, b:1, al:'c', pb:true})); if (i === 0) out.push(P(ttl, {...Z, b:1, al:'c', af:200})); }
      out.push(new Paragraph({children:[new ImageRun({type:im.type, data:im.data, transformation:{width:w, height:h}})], alignment:AlignmentType.CENTER, spacing:{before:300}})); }
    return out;
  };

  const page = {size:{width:11906, height:16838}, margin:{top:2450, bottom:1000, left:1134, right:1134, header:560, footer:420}};
  const sec = (children, lap) => lap
    ? {properties:{page:{...page, margin:{...page.margin, bottom:1134}, pageNumbers:{start:1}}, titlePage:true}, headers:{first:new Header({children:kopHdr()}), default:new Header({children:[P([new TextRun({children:[PageNumber.CURRENT], size:SZ, font:AR})], {al:'r'})]})}, footers:{first:new Footer({children:[P('')]}), default:new Footer({children:[P('')]})}, children}
    : {properties:{page}, headers:{default:new Header({children:kopHdr()})}, footers:{default:new Footer({children:[P('')]})}, children};
  const list = v === 'all' ? ['st', 'sppd', 'lamp', ...(hasB(s) ? ['biaya'] : []), 'lap'] : [v], map = {st:ST, sppd:SPD, lamp:LAMP, biaya:BIAYA};
  const sections = [];
  for (const k of list) sections.push(k === 'lap' ? sec(await LAP(), true) : sec(map[k](), false));
  const doc = new Document({creator:'SIM Pegawai & SPPD', title:'Dokumen SPPD ' + s.no, styles:{default:{document:{run:{font:AR, size:SZ}}}}, sections});
  return Packer.toBlob(doc);
}
async function expDoc(id, v) {
  const s = D.sppd.find(x => x.id === id); if (!s) return toast('Pilih SPPD terlebih dahulu', 'err');
  const nm = {st:'Surat_Tugas', sppd:'SPD', lamp:'Lampiran_SPD', biaya:'Rincian_Biaya_Kuitansi', lap:'Laporan', all:'Paket_SPPD'}[v] || 'Dokumen';
  try {
    toast('Menyiapkan dokumen Word…');
    const blob = await buildDocx(s, v), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = (nm + '_' + s.no).replace(/[^\w-]/g, '_') + '.docx'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    log('Unduh Word ' + nm + ' ' + s.no);
  } catch (e) { console.error(e); toast('Gagal membuat Word: ' + (e?.message || e), 'err'); }
}
act('expWord', el => expDoc(el.dataset.id, 'lap'));
act('expDocW', () => expDoc(ST.cetak.id, ST.cetak.v));
