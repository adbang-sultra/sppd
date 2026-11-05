/* ============================================================
   EKSPOR WORD (.docx asli) — format sama dengan contoh SPT_EDIT_BARCOD.docx:
   kop surat di HEADER, catatan TTE di FOOTER, penanda ${ttd} di kotak tanda tangan.
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
  const R = (t, o = {}) => new TextRun({text:String(t ?? ''), bold:o.b, underline:o.u ? {} : undefined, italics:o.i, size:o.sz, font:o.f, break:o.br});
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
      C([P(kc('kop1'), {al:'c', b:1, sz:27, f:TNR}), P(kc('kop2'), {al:'c', sz:44, f:'Cooper Black', b:0}), P(kc('kop3'), {al:'c', sz:19, f:TNR})], {w:CW - 1500, nb:1, va:'c'})]], [1500, CW - 1500], {nb:1}),
      P('', {af:0, ln:120, bd:{bottom:{style:BorderStyle.SINGLE, size:36, color:'000000', space:1}}})];
  };
  const noteFtr = () => isTTE() && kc('ttdNote') ? new Footer({children:[P([R('Catatan :', {b:1, sz:17, f:'Arial'})], {bd:{top:{style:BorderStyle.SINGLE, size:10, color:'2F6FB4', space:2}}}), ...lines(kc('ttdNote')).map(l => P([R('•\t', {sz:15, f:'Arial'}), R(l, {sz:15, f:'Arial'})], {ind:{left:220, hanging:220}, ln:230}))]}) : undefined;

  /* ----- Tanda tangan ----- */
  const tag = D.cfg.ttdTag === undefined ? KOPDEF.ttdTag : D.cfg.ttdTag;
  const signParas = (box) => { const A = {f:'Arial', sz:20};
    if (isTTE()) return [...(box ? [P([R(kc('ttdLbl'), {...A, u:1})])] : []), P([R((c.jabatan || '').toUpperCase(), {...A, b:1})], {af:200}), P([R(tag, {...A, sz:16})], {af:560, bf:160}), P([R(c.pejabat || '..............................', {...A, b:1, u:1})]), P([R('NIP. ' + (c.nip || ''), A)])];
    return [P((c.jabatan || '').toUpperCase() + ',', {b:1, al:box ? 'c' : 'l'}), sp(1100), P([R(c.pejabat || '..............................', {b:1, u:1})], {al:box ? 'c' : 'l'}), P('NIP. ' + (c.nip || ''), {al:box ? 'c' : 'l'})]; };
  const signBox = () => isTTE() ? T([[C(signParas(true), {w:4800, mt:80, mb:100, ml:140})]], [4800]) : T([[C(signParas(true), {w:4800, nb:1})]], [4800], {nb:1});
  const issuedT = tgl => T([[C('Dikeluarkan di', {w:1700, nb:1, ml:0}), C(': ' + kc('kota'), {w:3100, nb:1})], [C('Pada tanggal', {w:1700, nb:1, ml:0}), C(': ' + dts(tgl), {w:3100, nb:1})]], [1700, 3100], {nb:1});
  const signArea = tgl => T([[C('', {w:CW - 4900, nb:1}), C([...(tgl ? [issuedT(tgl), sp(160)] : []), signBox()], {w:4900, nb:1, ml:0})]], [CW - 4900, 4900], {nb:1});

  /* ----- Surat Tugas ----- */
  const ST = () => { const Pt = petugas(s), n = lama(s.tb, s.tk), ds = String(s.dasar || '').split(/;|\n/).map(x => x.trim()).filter(Boolean);
    const per = s.tb && s.tk && s.tb.slice(0, 7) === s.tk.slice(0, 7) ? (+s.tb.slice(8)) + ' s/d ' + dts(s.tk) : dts(s.tb) + ' s/d ' + dts(s.tk);
    return [P('SURAT TUGAS', {al:'c', b:1, sz:23}), P('NOMOR : ' + (s.stNo || '...............................'), {al:'c', af:300}),
      T([[C('Dasar', {w:1250, nb:1, ml:0}), C(':', {w:300, nb:1}), C(ds.length ? ds.map((x, i) => P(`${i + 1}.\t${x}`, {al:'j', ind:{left:360, hanging:360}, af:40})) : ['-'], {w:CW - 1550, nb:1})]], [1250, 300, CW - 1550], {nb:1}),
      P('MENUGASKAN :', {al:'c', b:1, bf:240, af:160}),
      T([[C('No.', {w:600, b:1}), C('Nama/NIP', {w:4400, b:1}), C('Jabatan', {w:3480, b:1})], ...Pt.map((p, i) => [C(String(i + 1), {w:600, al:'c'}), C([P(p.nama), ...(p.nip ? [P('NIP. ' + p.nip)] : [])], {w:4400}), C(p.jabatan || '', {w:3480})])], [600, 4400, 3480]),
      sp(240), T([[C('Untuk', {w:1250, nb:1, ml:0}), C(':', {w:300, nb:1}), C(P(`${s.maksud}${s.tujuan ? ' di ' + s.tujuan : ''}, selama ${n} (${cap(terbilang(n))}) Hari sejak tanggal ${per}.`, {al:'j'}), {w:CW - 1550, nb:1})]], [1250, 300, CW - 1550], {nb:1}),
      P('Demikian Surat Tugas ini diberikan untuk dilaksanakan dengan penuh rasa tanggung jawab.', {bf:240, af:240}), signArea(s.stTgl || s.tgl)];
  };
  /* ----- SPD ----- */
  const SPD = () => { const e = emp(s.empId) || {}, bd = s.bud || {}, n = lama(s.tb, s.tk), F = (s.fol || []).length ? s.fol : [{}, {}], W = [500, 330, 3600, 330, CW - 4760], Z = {sz:20};
    const r1 = (no, l, val, b) => [C(String(no), {w:W[0], al:'c', ...Z}), C(l, {w:W[1] + W[2], cs:2, ...Z}), C(P([R(val, {b, sz:20})]), {w:W[3] + W[4], cs:2})];
    const ab = (no, rows) => rows.map(([l, val], i) => [...(i === 0 ? [C(String(no), {w:W[0], al:'c', rs:rows.length, ...Z})] : []), C('abc'[i] + '.', {w:W[1], ...Z}), C(l, {w:W[2], ...Z}), C('abc'[i] + '.', {w:W[3], ...Z}), C(val, {w:W[4], ...Z})]);
    const rows = [r1(1, 'Pejabat Pembuat Komitmen', s.pejabat || c.jabatan, 1), r1(2, 'Nama Pegawai Yang di Perintah', e.nama),
      ...ab(3, [['Pangkat dan Golongan', (e.pangkat || '') + (e.gol ? ' Gol. ' + e.gol : '')], ['Jabatan', e.jabatan], ['Tingkat Biaya Perjalanan Dinas', s.tingkat]]),
      r1(4, 'Maksud Perjalanan Dinas', s.maksud), r1(5, 'Alat Angkut yang dipergunakan', s.alat),
      ...ab(6, [['Tempat Berangkat', s.asal], ['Tempat Tujuan', (s.tujuan || '') + (s.inst ? ' (' + s.inst + ')' : '')]]),
      ...ab(7, [['Lamanya Perjalanan Dinas', hari(n)], ['Tanggal berangkat', dts(s.tb)], ['Tanggal Harus Kembali', dts(s.tk)]]),
      [C('8.', {w:W[0], al:'c', rs:F.length + 1, ...Z}), C('Pengikut : nama', {w:W[1] + W[2], cs:2, ...Z}), C('Keterangan', {w:W[3] + W[4], cs:2, al:'c', ...Z})],
      ...F.map((f, i) => [C(f.nama ? String(i + 1) : '', {w:W[1], ...Z}), C(f.nama || '', {w:W[2], ...Z}), C(f.jabatan || '', {w:W[3] + W[4], cs:2, ...Z})]),
      [C('9', {w:W[0], al:'c', rs:3, ...Z}), C('Pembebanan Anggaran', {w:W[1] + W[2], cs:2, ...Z}), C((bd.sumber || '') + (bd.ta ? ' TA ' + bd.ta : ''), {w:W[3] + W[4], cs:2, ...Z})],
      [C('a.', {w:W[1], ...Z}), C('Instansi', {w:W[2], ...Z}), C('a.', {w:W[3], ...Z}), C(c.instansi, {w:W[4], ...Z})], [C('b.', {w:W[1], ...Z}), C('Akun', {w:W[2], ...Z}), C('b.', {w:W[3], ...Z}), C(s.mata || bd.rek || '', {w:W[4], ...Z})],
      r1(10, 'Keterangan Lain-lain', s.ket || '')];
    return [T([[C('Lembar ke', {w:1300, nb:1, ...Z}), C(': 1', {w:3000, nb:1, ...Z})], [C('Kode No', {w:1300, nb:1, ...Z}), C(':', {w:3000, nb:1, ...Z})], [C('Nomor', {w:1300, nb:1, ...Z}), C(': ' + s.no, {w:3000, nb:1, ...Z})]], [1300, 3000], {nb:1, ind:CW - 4300}),
      P([R('SURAT PERJALANAN DINAS (SPD)', {b:1, u:1})], {al:'c', bf:200, af:160}), T(rows, W), P('*Coret yang tidak perlu', {sz:18}), sp(120), signArea(s.tgl)];
  };
  /* ----- Lampiran SPD ----- */
  const LAMP = () => { const W = [520, 4559, 4559], Z = {sz:20};
    const kv = rows => T(rows.map(([a, b2]) => [C(a, {w:1500, nb:1, ml:0, mt:0, mb:0, ...Z}), C(': ' + (b2 || ''), {w:2900, nb:1, mt:0, mb:0, ...Z})]), [1500, 2900], {nb:1});
    const tiba = (a, d) => kv([['Tiba di', a], ['Pada Tanggal', d], ['Kepala', '']]), brk = (a, b2, d) => kv([['Berangkat dari', a], ['Ke', b2], ['Pada Tanggal', d], ['Kepala', '']]);
    const rn = t => C(t, {w:W[0], al:'c', ...Z}), RH = 1150;
    return [T([[rn('I'), C('', {w:W[1]}), C([brk(s.asal, s.tujuan, dts(s.tb)), ...signParas(false)], {w:W[2]})],
      [rn('II'), C(tiba(s.tujuan, dts(s.tb)), {w:W[1]}), C(brk(s.tujuan, s.asal, dts(s.tk)), {w:W[2]})],
      [rn('III'), C(tiba(), {w:W[1]}), C(brk(), {w:W[2]})], [rn('IV'), C(tiba(), {w:W[1]}), C(brk(), {w:W[2]})],
      [rn('V'), C(tiba(), {w:W[1]}), C(P('Telah diperiksa dengan keterangan bahwa perjalanan tersebut diatas benar dilakukan atas perintahnya dan semata-mata untuk kepentingan jabatan dalam waktu yang sesingkat-singkatnya.', {al:'j', sz:20}), {w:W[2]})],
      [rn('VI'), C('Catatan lain-lain :', {w:W[1] + W[2], cs:2, ...Z})],
      [C('', {w:W[0]}), C([P('PERHATIAN:', Z), P('PPK yang menerbitkan SPD, pegawai yang melakukan Perjalanan Dinas, Pejabat yang mengesahkan tanggal berangkat/tiba, serta bendahara pengeluaran bertanggung jawab berdasarkan peraturan-peraturan Keuangan Negara. Apabila negara menderita rugi akibat kesalahan, kelalaian dan kealpaannya.', {al:'j', sz:20})], {w:W[1] + W[2], cs:2})]].map((r, i) => new TableRow({children:r, cantSplit:true, height:i >= 1 && i <= 4 ? {value:RH, rule:'atLeast'} : undefined})), W),
      sp(200), signArea(null)];
  };
  /* ----- Laporan (format Bandung) ----- */
  const LAP = async () => { const r = D.rep.find(x => x.sppdId === s.id) || {}, Pt = petugas(s), A = 'Arial', Z = {f:A, sz:22};
    const H4 = t => P(t, {...Z, b:1, bf:240, af:80, kn:1}), H5 = t => P(t, {...Z, b:1, bf:100, af:40, ind:{left:280}, kn:1});
    const J = t => String(t || '').trim() ? P(t, {...Z, al:'j', ind:{left:560, firstLine:680}, af:120, ln:300}) : P('................................................................................................', {...Z, ind:{left:560}, af:120});
    const OL = t => { const a = lines(t); return a.length ? a.map((x, i) => P(`${i + 1}.\t${x}`, {...Z, al:'j', ind:{left:1000, hanging:360}, af:60, ln:300})) : [J('')]; };
    const wkt = r.wkt || `Kegiatan dilaksanakan pada tanggal ${dts(s.tb)} s.d ${dts(s.tk)} di ${s.tujuan || '-'}${s.inst ? ' (' + s.inst + ')' : ''}.`;
    const dasar = [...(s.stNo ? [`Surat Tugas ${c.jabatan} Nomor ${s.stNo}${s.stTgl ? ' tanggal ' + dts(s.stTgl) : ''}`] : []), `Surat Perintah Perjalanan Dinas Nomor ${s.no}`, ...lines(r.dasar)].join('\n');
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

  const page = {size:{width:11906, height:16838}, margin:{top:2700, bottom:1500, left:1134, right:1134, header:560, footer:420}};
  const sec = (children, lap) => lap
    ? {properties:{page:{...page, margin:{...page.margin, bottom:1134}, pageNumbers:{start:1}}, titlePage:true}, headers:{first:new Header({children:kopHdr()}), default:new Header({children:[P([new TextRun({children:[PageNumber.CURRENT], size:18, font:'Arial'})], {al:'r'})]})}, footers:{first:new Footer({children:[P('')]}), default:new Footer({children:[P('')]})}, children}
    : {properties:{page}, headers:{default:new Header({children:kopHdr()})}, footers:{default:noteFtr() || new Footer({children:[P('')]})}, children};
  const list = v === 'all' ? ['st', 'sppd', 'lamp', 'lap'] : [v], map = {st:ST, sppd:SPD, lamp:LAMP};
  const sections = [];
  for (const k of list) sections.push(k === 'lap' ? sec(await LAP(), true) : sec(map[k](), false));
  const doc = new Document({creator:'SIM Pegawai & SPPD', title:'Dokumen SPPD ' + s.no, styles:{default:{document:{run:{font:TNR, size:22}}}}, sections});
  return Packer.toBlob(doc);
}
async function expDoc(id, v) {
  const s = D.sppd.find(x => x.id === id); if (!s) return toast('Pilih SPPD terlebih dahulu', 'err');
  const nm = {st:'Surat_Tugas', sppd:'SPD', lamp:'Lampiran_SPD', lap:'Laporan', all:'Paket_SPPD'}[v] || 'Dokumen';
  try {
    toast('Menyiapkan dokumen Word…');
    const blob = await buildDocx(s, v), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = (nm + '_' + s.no).replace(/[^\w-]/g, '_') + '.docx'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    log('Unduh Word ' + nm + ' ' + s.no);
  } catch (e) { console.error(e); toast('Gagal membuat Word: ' + (e?.message || e), 'err'); }
}
act('expWord', el => expDoc(el.dataset.id, 'lap'));
act('expDocW', () => expDoc(ST.cetak.id, ST.cetak.v));
