/* Skenario uji MODE LOKAL.  Pakai: node tests/run-local.js [berkas.csv]  (server: node tests/server.js 8801 local) */
const fs = require('fs'), path = require('path');
const {PW, ok, launch, page, toasts, setup, login, sleep, until, done, mkFotos} = require('./lib');
const U = process.env.URL_LOCAL || 'http://localhost:8801/', OUT = process.env.OUT || path.join(require('os').tmpdir(), 'sppd-shots'), CSV = process.argv[2];
fs.mkdirSync(OUT, {recursive:true});
(async () => {
  const br = await launch(), ctx = await br.newContext({viewport:{width:1366, height:800}, acceptDownloads:true}), p = await page(ctx);
  console.log('\n[1] Pemasangan & halaman'); await setup(p, U);
  for (const r of ['emp', 'prog', 'sppd', 'cetak', 'lap', 'rekap', 'set', 'tampil', 'user', 'bak', 'dash']) { await p.evaluate(r => location.hash = r, r); await sleep(150); }
  ok(!p.errs.length, 'semua halaman terbuka tanpa error konsol (CSP ketat)', p.errs.join(' | '));
  ok(await p.evaluate(() => $('#sideUser').textContent.includes('v' + APP_VER)), 'nomor versi tampil (sesuai APP_VER)');
  for (const [r, vw] of [['set', 1920], ['tampil', 1920], ['set', 1366], ['tampil', 1366]]) { await p.setViewportSize({width:vw, height:1000}); await p.evaluate(r => { location.hash = r; }, r); await sleep(700);
    const g = await p.evaluate(() => { const b = $('.sticky-act').getBoundingClientRect(), m = $('#main').getBoundingClientRect(); return {h:Math.round(b.height), w:Math.round(b.width), mw:Math.round(m.width)}; });
    ok(g.h < 140 && g.w > g.mw * .8, `${r} @${vw}px: bilah tombol simpan tidak melebar menutupi isi halaman`, JSON.stringify(g)); await p.screenshot({path:`${OUT}/${r}-${vw}.png`}); }
  await p.setViewportSize({width:1366, height:800});

  console.log('\n[2] Impor CSV'); await p.evaluate(() => location.hash = 'emp'); await sleep(200);
  if (CSV) { await p.click('[data-act="impCSV"]'); await p.setInputFiles('#fcsv', CSV); await p.waitForSelector('#mok'); const info = await p.$eval('#mod .info', e => e.textContent); await p.click('#mok'); await sleep(400);
    ok(await p.evaluate(() => D.emp.length) === 52, 'CSV contoh: pratinjau lalu 52 pegawai masuk', info.replace(/\s+/g, ' ')); }
  const semi = 'Nama Lengkap;NIP;Pangkat;Golongan;Jabatan;Jenis Kelamin;Nomor Telepon;Unit Kerja;Status Pegawai\r\nBudi Uji, S.E., M.Si;199001012020121001;Penata;III/c;Analis Kebijakan;laki-laki;-;Biro Uji;PNS\r\nTanpa Nip Satu;;-;-;Staf;Perempuan;-;Biro Uji;Honorer\r\nTanpa Nip Dua;-;-;-;Staf;Perempuan;-;Biro Uji;Honorer\r\nPns Tanpa Nip;;Penata;III/a;Staf;Perempuan;-;Biro Uji;PNS\r\nNip Kembar;199001012020121001;Penata;III/a;Staf;Perempuan;-;Biro Uji;PNS\r\nJk Salah;199001012020121009;Penata;III/a;Staf;Pria;-;Biro Uji;PNS\r\n';
  const r3 = await p.evaluate(s => parseCSV(s)[1], semi); ok(r3.length === 9 && r3[0] === 'Budi Uji, S.E., M.Si', 'CSV ber-titik-koma: nama bergelar tidak terpecah', JSON.stringify(r3.slice(0, 2)));
  const n0 = await p.evaluate(() => D.emp.length); await p.click('[data-act="impCSV"]'); await p.setInputFiles('#fcsv', {name:'semi.csv', mimeType:'text/csv', buffer:Buffer.from(semi)}); await p.waitForSelector('#mok');
  const bad = await p.$$eval('#mod .tblw:last-of-type tbody tr', a => a.map(r => r.textContent.replace(/\s+/g, ' ').trim())); await p.click('#mok'); await sleep(400);
  ok(await p.evaluate(() => D.emp.length) === n0 + 3, 'impor: 3 baris masuk (termasuk 2 non-ASN tanpa NIP), 3 ditolak beserta alasan', bad.join(' || '));
  ok(await p.evaluate(() => D.emp.find(e => e.nama === 'Budi Uji, S.E., M.Si')?.jk) === 'Laki-laki', 'impor: pilihan dinormalkan ("laki-laki" → "Laki-laki")');

  console.log('\n[3] Form SPPD: nomor, penanda tangan, biaya, bentrok');
  await p.evaluate(() => { D.cfg.kopd = [{jabatan:'Kepala Dinas Pendidikan dan Kebudayaan', nama:'Kadis Uji', pangkat:'Pembina Utama Muda (IV/c)', nip:'196801011994031005'}]; D.cfg.signers = [{jabatan:'Kepala Biro Administrasi Pembangunan', nama:'Kepala Biro Uji', nip:'197001011995031001'}, {jabatan:'Pejabat Pembuat Komitmen', nama:'PPK Uji', nip:'198001012005011002'}]; D.cfg.pejabat = 'Sekda Uji'; D.cfg.nip = '196501011990031001'; D.cfg.bendahara = 'Bendahara Uji'; D.cfg.nipBend = '198505052010012003'; save('cfg');
    D.prog.push({id:uid(), ta:'2026', program:'Program Uji', kdProgram:'1.01', kegiatan:'Koordinasi Pembangunan', kdKegiatan:'1.01.01', sub:'', kdSub:'', rek:'5.1.02.04.01.0001', sumber:'APBD', pagu:'10000000', unit:'Biro'}); save('prog'); });
  let nUrut = 0; const mkSppd = async (tb, tk, biaya) => { await p.evaluate(() => go('form')); await p.waitForSelector('#s_no'); await p.fill('#s_no', String(++nUrut).padStart(3, '0') + '/SPPD/2026'); const no = await p.inputValue('#s_no');
    await p.selectOption('#s_emp', {label:'Budi Uji, S.E., M.Si'}); await p.fill('#s_maksud', 'Koordinasi dan konsultasi pelaporan pembangunan'); await p.fill('#s_tujuan', 'Jakarta'); await p.fill('#s_tb', tb); await p.fill('#s_tk', tk);
    await p.fill('#s_stNo', '094/123/2026'); await p.fill('#s_dasar', 'DPA Biro Tahun 2026'); await p.selectOption('#s_stS', 's:0'); await p.selectOption('#s_spdS', 's:1'); await p.selectOption('#s_prog', {index:1});
    if (biaya) { await p.click('[data-act="biaAdd"][data-t="uh"]'); await p.keyboard.type('530000'); await p.click('[data-act="biaAdd"][data-t="tr"]'); await p.keyboard.type('4.500.000'); await p.click('[data-act="biaAdd"][data-t="inap"]'); await p.keyboard.type('900000'); }
    return no; };
  const no1 = await mkSppd('2026-11-16', '2026-11-19', true); const tot = await p.$eval('#biaTot', e => e.textContent), sisa = await p.$eval('#progInfo', e => e.textContent.replace(/\s+/g, ' '));
  await p.screenshot({path:OUT + '/form-biaya.png'}); await p.click('#mok'); await sleep(500);
  ok(no1 === '001/SPPD/2026' && await p.evaluate(() => D.sppd.length) === 1, 'SPPD #1 tersimpan dengan nomor yang diketik manual', no1);
  ok(/9\.320\.000/.test(tot), 'total biaya dihitung (4×530.000 + 4.500.000 + 3×900.000)', tot + ' | ' + sisa.slice(-60));
  ok(await p.evaluate(() => { const s = D.sppd[0]; return s.peg?.nama === 'Budi Uji, S.E., M.Si' && s.stS?.nama === 'Kepala Biro Uji' && s.spdS?.nama === 'PPK Uji'; }), 'salinan pegawai & penanda tangan per dokumen tersimpan di SPPD');
  await mkSppd('2026-11-18', '2026-11-20', true); await p.click('#mok'); await p.waitForSelector('.ov.ask'); const q1 = await p.$eval('.ov.ask p', e => e.textContent);
  ok(/bentrok/i.test(q1) && /001\/SPPD\/2026/.test(q1), 'bentrok jadwal terdeteksi sebelum simpan', q1.replace(/\s+/g, ' ').slice(0, 110));
  await p.click('.ov.ask [data-r="1"]'); await p.waitForSelector('.ov.ask'); const q2 = await p.$eval('.ov.ask p', e => e.textContent);
  ok(/melebihi sisa pagu/.test(q2), 'peringatan melebihi sisa pagu', q2.replace(/\s+/g, ' ').slice(0, 80)); await p.click('.ov.ask [data-r="0"]'); await sleep(200);
  ok(await p.evaluate(() => D.sppd.length) === 1 && await p.evaluate(() => !!$('#mod').innerHTML), 'batal → SPPD tidak tersimpan, form tetap terbuka'); await p.evaluate(() => closeM());
  await p.evaluate(() => go('form')); await p.waitForSelector('#s_no');
  ok(await p.inputValue('#s_no') === '' && !(await p.$('[data-act="numAuto"]')), 'form baru: nomor SPPD kosong, tidak ada tombol nomor otomatis');
  const og = await p.$$eval('#s_stS optgroup', a => a.map(g => g.label + ':' + g.children.length)); await p.evaluate(() => closeM());
  ok(og.join() === 'Kepala OPD:1,Penanda tangan lain:2', 'pilihan penanda tangan memuat kelompok Kepala OPD', og.join());
  await p.evaluate(() => openSppd(D.sppd[0].id)); await p.waitForSelector('#s_spdS'); await p.selectOption('#s_spdS', 'o:0'); await p.click('#mok'); await sleep(500);
  ok(await p.evaluate(() => D.sppd[0].spdS?.nama === 'Kadis Uji' && dSPPD(D.sppd[0]).includes('KEPALA DINAS PENDIDIKAN DAN KEBUDAYAAN') && dSPPD(D.sppd[0]).includes('Pembina Utama Muda (IV/c)')), 'penanda tangan SPD diganti ke Kepala OPD (jabatan, nama, pangkat tercetak)');
  await p.evaluate(() => openSppd(D.sppd[0].id)); await p.waitForSelector('#s_spdS'); ok(await p.inputValue('#s_spdS') === 'o:0', 'saat diubah lagi, pilihan Kepala OPD tetap terpilih'); await p.selectOption('#s_spdS', 's:1'); await p.click('#mok'); await sleep(500);
  await p.evaluate(() => { const e = D.emp.find(x => x.nama === 'Budi Uji, S.E., M.Si'); e.jabatan = 'Jabatan Baru Setelah Mutasi'; save('emp'); });
  ok(await p.evaluate(() => docs(D.sppd[0], 'sppd').includes('Analis Kebijakan') && !docs(D.sppd[0], 'sppd').includes('Jabatan Baru')), 'dokumen SPPD lama memakai jabatan saat diterbitkan (tidak ikut berubah)');

  console.log('\n[4] Dokumen cetak & Word');
  await p.evaluate(() => { D.rep.push({id:uid(), sppdId:D.sppd[0].id, status:'selesai', latar:'Latar belakang uji. '.repeat(30), hasil:'Hasil satu\nHasil dua\nHasil tiga', kes:'Kesimpulan uji. '.repeat(40), tl:'Rekomendasi satu\nRekomendasi dua', tgl:today(), foto:[]}); save('rep'); ST.cetak.id = D.sppd[0].id; ST.cetak.v = 'all'; location.hash = 'cetak'; }); await sleep(600);
  const html = await p.evaluate(() => docs(D.sppd[0], 'all'));
  ok(/RINCIAN BIAYA PERJALANAN DINAS/.test(html) && /KUITANSI/.test(html) && /Sembilan juta tiga ratus dua puluh ribu rupiah/.test(html), 'Rincian Biaya & Kuitansi ada di paket, terbilang benar');
  ok(/KEPALA BIRO ADMINISTRASI PEMBANGUNAN/.test(await p.evaluate(() => dST(D.sppd[0]))) && /PEJABAT PEMBUAT KOMITMEN/.test(await p.evaluate(() => dSPPD(D.sppd[0]))), 'Surat Tugas & SPD ditandatangani pejabat berbeda');
  ok(!/\$\{ttd\}|dnote|elektronik|UU ITE|class="tte"/i.test(html) && (html.match(/class="sg-sp"/g) || []).length >= 4, 'cetak: tanpa kotak TTE/penanda ${ttd}, tanpa catatan kaki; ruang tanda tangan kosong');
  const fnt = await p.evaluate(() => { const bad = new Set(); $$('#main .paperw .paper *').forEach(e => { if (e.closest('.kop2,.kopimg,.ttd-n') || !e.childNodes.length || ![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return; const c = getComputedStyle(e); if (!/^Arial/.test(c.fontFamily) || c.fontSize !== '16px') bad.add(e.tagName + '.' + e.className + ' ' + c.fontFamily.slice(0, 12) + ' ' + c.fontSize); }); return [...bad]; });
  ok(!fnt.length, 'cetak: semua teks isi Arial 12 pt (kecuali kop)', fnt.slice(0, 5).join(' | '));
  /* v1.2.5: Surat Tugas tanpa jabatan di badan surat; Lampiran SPD tanpa kop; laporan mengikuti template Wakatobi */
  const stH = await p.evaluate(() => dST(D.sppd[0])), lpH = await p.evaluate(() => dLamp(D.sppd[0])), lapH = await p.evaluate(() => dLap(D.sppd[0]));
  ok(!/class="st-j"/.test(stH) && (stH.match(/KEPALA BIRO ADMINISTRASI PEMBANGUNAN/g) || []).length === 1, 'Surat Tugas: jabatan di badan surat dihapus (hanya di blok tanda tangan)');
  ok(!/kop2|kopimg/.test(lpH) && /Berangkat dari/.test(lpH), 'Lampiran SPD (halaman 2): tanpa kop surat');
  /* v1.3.1: lebar kolom Lampiran harus lewat CSS (CSP memblokir gaya sebaris) — numeral ±4%, kiri ±46%, kanan ±50% */
  const lw = await p.evaluate(h => { const d = document.createElement('div'); d.innerHTML = h; document.body.appendChild(d); const r = d.querySelector('.lampt tr.lb'), tb = d.querySelector('.lampt').getBoundingClientRect().width, w = [...r.children].map(c => Math.round(c.getBoundingClientRect().width / tb * 100)); d.remove(); return w; }, lpH);
  const lf = await p.evaluate(h => { const d = document.createElement('div'); d.innerHTML = h; document.body.appendChild(d); const s = new Set(); d.querySelectorAll('.paper.lamp *').forEach(e => { if ([...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) { const c = getComputedStyle(e); s.add(c.fontFamily.split(',')[0].replace(/"/g, '') + '|' + c.fontSize); } }); d.remove(); return [...s]; }, lpH);
  ok(lf.length === 1 && lf[0] === 'Arial|16px', 'Lampiran SPD: seluruh huruf sama (Arial 12 pt, seperti dokumen lain)', JSON.stringify(lf));
  ok(lw[0] <= 9 && lw[1] >= 42 && lw[1] <= 50 && lw[2] >= 46, 'Lampiran SPD: lebar kolom benar di bawah CSP (tidak memakai gaya sebaris)', JSON.stringify(lw));
  ok(/KESIMPULAN DAN SARAN/.test(lapH) && /Kesimpulan:/.test(lapH) && />Saran</.test(lapH) && /PENUTUP/.test(lapH) && /Yang melakukan perjalanan dinas,/.test(lapH) && !/REKOMENDASI|VI\./.test(lapH), 'Laporan: struktur I–V (Kesimpulan & Saran, Penutup) seperti template');
  const lapF = await p.evaluate(() => { const e = $('#main .paper.lap .lp') || $('#main .paper.lap .li'); if (!e) return 'tidak ada'; const c = getComputedStyle(e); return c.fontFamily.slice(0, 20) + '|' + c.fontSize + '|' + c.textAlign; });
  ok(/^Arial|^"Arial/.test(lapF) && /\|16px\|justify/.test(lapF), 'Laporan: Arial 12 pt (sama dengan dokumen lain) rata kiri-kanan', lapF);
  /* v1.2.6: SPD per orang (pegawai + pengikut), poin 8 kosong; nomor & tanggal SPPD boleh kosong */
  const spdT = await p.evaluate(() => { const s = {...D.sppd[0], fol:[{nama:'Ani Pengikut', nip:'', gol:'III/a', jabatan:'Staf A'}, {nama:'Candra Pengikut', nip:'', gol:'III/b', jabatan:'Staf B'}]}, h = dSPPD(s), all = docs(s, 'all'); return {n:(h.match(/paper fx spd/g) || []).length, a:(h.match(/Ani Pengikut/g) || []).length, c:(h.match(/Candra Pengikut/g) || []).length, lamp:(all.match(/paper fx lamp/g) || []).length, urut:all.indexOf('paper fx spd') < all.indexOf('paper fx lamp') && all.split('paper fx spd')[2].indexOf('paper fx lamp') < all.split('paper fx spd')[2].indexOf('Candra') + 10000}; });
  ok(spdT.n === 3 && spdT.a === 1 && spdT.c === 1, 'SPD dibuat per orang (3 lembar untuk 1 pegawai + 2 pengikut), poin 8 tidak berisi nama pengikut', JSON.stringify(spdT));
  ok(spdT.lamp === 3, 'Paket cetak: tiap SPD disusul Lampiran SPD-nya', JSON.stringify(spdT));
  /* v1.2.7: pengikut ikut terhitung; menu gabungan */
  const fo = await p.evaluate(() => { const s = {...D.sppd[0], biaya:[{ur:'UH', vol:2, sat:'hr', hrg:100000}], fol:[{nama:'Ani Pengikut', nip:'111', gol:'III/a', jabatan:'Staf A'}, {nama:'Candra Pengikut', nip:'222', gol:'III/b', jabatan:'Staf B'}]}; const g = grp([s], x => orang(x).map(p => p.nama)); return {n:orang(s).length, g:g.length, b:Math.round(g.reduce((n, x) => n + x[1].b, 0)), tot:totB(s), cell:pegCell(s).includes('+ 2 pengikut')}; });
  ok(fo.n === 3 && fo.g === 3 && fo.b === fo.tot && fo.cell, 'Data SPPD/rekap: pengikut ikut dihitung (3 orang), biaya dibagi rata', JSON.stringify(fo));
  const mn = await p.evaluate(() => { location.hash = 'set'; render(); return {rt:RT, h:location.hash, peng:M.some(m => m[0] === 'peng'), lama:M.some(m => ['set', 'tampil', 'user', 'bak'].includes(m[0]))}; });
  ok(mn.rt === 'peng' && mn.h === '#peng' && mn.peng && !mn.lama, 'Menu Pengaturan & Tampilan, Pengguna & Backup digabung (alamat lama dialihkan)', JSON.stringify(mn));
  /* v1.2.7: Asisten AI untuk laporan (tiruan /api/ai di server uji) */
  await p.evaluate(() => { ST.lap.id = D.sppd[0].id; location.hash = 'lap'; render(); }); await p.waitForSelector('#l_hasil');
  await p.fill('#l_hasil', 'Pertemuan dengan bagian pembangunan menunjukkan penyerapan anggaran belum optimal dan perlu percepatan.'); await p.fill('#l_latar', 'Latar manual saya'); await p.fill('#l_kes', ''); await p.fill('#l_tl', ''); await p.fill('#l_mt', ''); await p.fill('#l_keg', '');
  await p.click('[data-act="aiLap"]'); await p.waitForSelector('#ai_c', {timeout:8000});
  await p.fill('#ai_c', 'kode-uji'); await p.click('#mok'); await sleep(2500); const aiDbg = await p.evaluate(() => JSON.stringify({kes:$('#l_kes')?.value, hasil:($('#l_hasil')?.value || '').length, st:$('#ai_st')?.textContent, modal:$('#mod').innerHTML.length, hash:location.hash}));
  if (!/Kesimpulan AI/.test(aiDbg)) ok(false, 'AI: kode akses lalu isi laporan', aiDbg);
  const ai1 = await p.evaluate(() => ({latar:$('#l_latar').value, mt:$('#l_mt').value, keg:$('#l_keg').value, tl:$('#l_tl').value, pen:$('#l_penutup').value, ro:$('#l_kes').readOnly}));
  ok(/AI paragraf/.test(ai1.mt + ai1.keg) === false && ai1.latar === 'Latar manual saya' && /^Maksud AI/.test(ai1.mt) && /Kegiatan AI satu/.test(ai1.keg) && /Saran AI/.test(ai1.tl) && ai1.pen === 'Penutup AI.' && !ai1.ro, 'AI: mengisi bagian kosong (kode akses diminta), isian manual tidak ditimpa, hasil bisa diedit', JSON.stringify(ai1));
  await p.check('#ai_over'); await p.click('[data-act="aiLap"]'); await p.waitForFunction(() => $('#l_latar').value.includes('Latar AI'), null, {timeout:8000});
  ok(true, 'AI: opsi "Timpa isian" mengganti isi yang sudah ada');
  await p.fill('#l_kes', 'Kesimpulan hasil edit saya'); ok(await p.inputValue('#l_kes') === 'Kesimpulan hasil edit saya', 'AI: hasil dapat diedit setelah dibuat');
  /* v1.2.7: akun Pimpinan, persetujuan & tanda tangan elektronik; penandaan manual laporan */
  const ap0 = await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 300; c.height = 120; const g = c.getContext('2d'); g.strokeStyle = '#123'; g.lineWidth = 6; g.beginPath(); g.moveTo(10, 90); g.bezierCurveTo(80, 0, 150, 160, 290, 30); g.stroke();
    const sg = {jabatan:'Kepala Biro Administrasi Pembangunan', nama:'Dr. NURBIYAH, S.STP., M.Si', nip:'197001011995031001', pangkat:'Pembina Tk.I'};
    window.__adm = cur; ACL.push({id:'kpl00001', u:'kepala1', name:'Dr. NURBIYAH, S.STP., M.Si', role:'kepala', on:true, nip:'197001011995031001', ttd:c.toDataURL('image/png')});
    const s = D.sppd[0]; s.stS = sg; save('sppd'); window.__sid = s.id;
    return {before:ttdOf(s, 'st'), role:RL.kepala, allow:Auth.allow('apr'), kp:(() => { cur = ACL.find(x => x.id === 'kpl00001'); const o = {w:Auth.can('w'), apr:Auth.canWrite('apr'), sppd:Auth.canWrite('sppd'), pg:Auth.allow('apr'), emp:Auth.allow('emp')}; cur = window.__adm; return o; })()};
  });
  ok(ap0.before === null && ap0.kp.apr === true && ap0.kp.sppd === false && ap0.kp.w === false && ap0.kp.pg === true && ap0.kp.emp === false, 'Peran Pimpinan: hanya dapat menyetujui (tulis koleksi persetujuan), tidak bisa mengubah SPPD/pegawai', JSON.stringify(ap0));
  await p.evaluate(() => { cur = ACL.find(x => x.id === 'kpl00001'); location.hash = 'apr'; render(); }); await p.waitForSelector('[data-act="aprDo"][data-d="st"]');
  await p.click('[data-act="aprDo"][data-d="st"]'); await p.waitForSelector('[data-r="1"]'); await p.click('[data-r="1"]'); await sleep(600);
  const ap1 = await p.evaluate(() => { const s = D.sppd.find(x => x.id === window.__sid), t = ttdOf(s, 'st'), h = dST(s); return {mode:aprOf(s, 'st')?.mode, ttd:!!t, img:/class="ttd-img"/.test(h), note:/Disetujui secara elektronik/.test(h), spdNo:!ttdOf(s, 'spd'), badge:/TTD elektronik/.test(aprBadge(s, 'st'))}; });
  ok(ap1.mode === 'ttd' && ap1.ttd && ap1.img && ap1.note && ap1.spdNo && ap1.badge, 'Pimpinan menyetujui Surat Tugas → tanda tangan elektronik dibubuhkan di dokumen (SPD belum)', JSON.stringify(ap1));
  const wd = await p.evaluate(async () => { const s = D.sppd.find(x => x.id === window.__sid), a = await buildDocx(s, 'st'); const sv = D.apr; D.apr = []; const b = await buildDocx(s, 'st'); D.apr = sv; return {withTtd:a.size, without:b.size}; });
  ok(wd.withTtd > wd.without + 500, 'Word: gambar tanda tangan elektronik ikut tersisip', JSON.stringify(wd));
  await p.evaluate(() => { cur = window.__adm; location.hash = 'lap'; ST.lap.id = window.__sid; render(); }); await p.waitForSelector('[data-act="aprMan"]');
  await p.click('[data-act="aprMan"]'); await p.waitForSelector('[data-r="1"]'); await p.click('[data-r="1"]'); await sleep(600);
  const ap2 = await p.evaluate(() => { const s = D.sppd.find(x => x.id === window.__sid); return {mode:aprOf(s, 'lap')?.mode, ttd:!!ttdOf(s, 'lap'), badge:/manual/.test(aprBadge(s, 'lap')), lapHtml:/Disetujui oleh/.test(dLap(s))}; });
  ok(ap2.mode === 'manual' && !ap2.ttd && ap2.badge && !ap2.lapHtml, 'Laporan: opsi manual menandai disetujui pimpinan tanpa membubuhkan tanda tangan', JSON.stringify(ap2));
  const ap3 = await p.evaluate(() => { const s = D.sppd.find(x => x.id === window.__sid), old = s.stS; s.stS = {...old, nip:'199999999999999999', nama:'Orang Lain'}; const r = {stale:!ttdOf(s, 'st') && /ulang/.test(aprBadge(s, 'st'))}; s.stS = old; return r; });
  ok(ap3.stale, 'Persetujuan elektronik tidak berlaku bila penanda tangan SPPD diganti (perlu disetujui ulang)', JSON.stringify(ap3));
  await p.evaluate(() => { D.apr = []; save('apr'); ACL.pop(); cur = window.__adm; });
  await p.evaluate(() => { location.hash = 'cetak'; render(); });
  const nTotal = await p.evaluate(() => D.sppd.length);
  const prevV = await p.evaluate(() => location.hash.slice(1).split('?')[0] || 'cetak');
  await p.evaluate(() => go('form')); await p.waitForSelector('#s_no');
  await p.selectOption('#s_emp', {index:1}); await p.fill('#s_maksud', 'Uji nomor kosong'); await p.fill('#s_tujuan', 'Bau-Bau'); await p.fill('#s_tb', '2026-03-02'); await p.fill('#s_tk', '2026-03-03');
  await p.click('#mok'); await sleep(600);
  const blk = await p.evaluate(() => { const x = D.sppd[D.sppd.length - 1]; return {t:document.querySelector('.toast, #toast, [role=status]')?.textContent, m:!!document.querySelector('#mok'), n:D.sppd.length, no:x.no, tgl:x.tgl, spd:dSPPD(x).length > 100, list:1}; });
  ok(blk.n === nTotal + 1 && blk.no === '' && blk.tgl === '', 'SPPD tersimpan dengan nomor & tanggal SPPD kosong', JSON.stringify(blk));
  await p.evaluate(v => { D.sppd.pop(); save('sppd'); go(v); }, prevV); await sleep(400);
  const [dlw] = await Promise.all([p.waitForEvent('download', {timeout:30000}).catch(() => null), p.click('[data-act="expDocW"]')]);
  if (dlw) await dlw.saveAs(OUT + '/paket.docx'); ok(!!dlw && fs.statSync(OUT + '/paket.docx').size > 50000, 'Unduh Word paket lengkap (termasuk biaya) di bawah CSP', dlw ? fs.statSync(OUT + '/paket.docx').size + ' byte' : (await toasts(p)).join('|'));
  for (const mode of ['dark', 'light']) { await p.evaluate(m => { document.documentElement.dataset.mode = m; $('#pa').innerHTML = docs(D.sppd[0], 'all'); $('#pa').classList.add('pn'); }, mode); await p.emulateMedia({media:'print'}); await p.pdf({path:`${OUT}/cetak-${mode}.pdf`, format:'A4', printBackground:true, preferCSSPageSize:true}); await p.emulateMedia({media:'screen'}); }
  await p.evaluate(() => { $('#pa').innerHTML = ''; document.documentElement.dataset.mode = 'dark'; });
  ok(true, 'PDF cetak dibuat (mode gelap & terang, "background graphics" aktif) — diperiksa visual', OUT + '/cetak-*.pdf');

  console.log('\n[5] Kapasitas: 12 laporan × 6 foto');
  await p.evaluate(() => { const s = D.sppd[0]; for (let i = 1; i < 12; i++) D.sppd.push({...structuredClone(s), id:uid(), ts:nextTs(), no:String(i + 100) + '/SPPD/2026', tb:'2027-0' + (1 + i % 9) + '-0' + (1 + i % 9), tk:'2027-0' + (1 + i % 9) + '-0' + (1 + i % 9), biaya:[]}); save('sppd'); });
  let quota = '';
  for (let i = 0; i < 12; i++) { const f = await mkFotos(p, i); await p.evaluate(async ([i, f]) => { const s = D.sppd[i]; let r = D.rep.find(x => x.sppdId === s.id); if (!r) { r = {id:uid(), ts:nextTs(), sppdId:s.id, status:'selesai', hasil:'x', kes:'y', tgl:today()}; D.rep.push(r); } r.foto = f; await persist('rep'); await flush(); }, [i, f]); quota = (await toasts(p)).find(t => /Gagal menyimpan/.test(t)) || quota; }
  const st = await p.evaluate(async () => { let ls = 0; for (let i = 0; i < localStorage.length; i++) ls += localStorage.key(i).length + localStorage.getItem(localStorage.key(i)).length; const rows = await LDB.all(); return {ls, rows:rows.length, ph:rows.filter(r => r[0].startsWith('ph:')).length, idb:rows.reduce((n, r) => n + r[1].length, 0)}; });
  ok(!quota && st.ph === 72, '12 laporan penuh foto tersimpan tanpa "penyimpanan penuh"', `IndexedDB ${st.rows} baris (${st.ph} foto, ${(st.idb / 1e6).toFixed(1)} juta karakter) · localStorage tinggal ${st.ls} karakter`);
  const w = await p.evaluate(async () => { let n = 0, sz = 0; const o = LDB.batch; LDB.batch = ops => { n += ops.length; sz += ops.reduce((a, x) => a + (x[1] || '').length, 0); return o(ops); }; D.rep.find(r => r.sppdId === D.sppd.find(s => s.no === '103/SPPD/2026').id).kes = 'Kesimpulan diubah'; await persist('rep'); await flush(); LDB.batch = o; return [n, sz]; });
  ok(w[0] === 1 && w[1] < 5000, 'mengubah teks satu laporan hanya menulis 1 baris kecil (foto tidak ditulis ulang)', `${w[0]} baris, ${w[1]} karakter`);
  const utuh = () => D.rep.length === 12 && D.rep.every(r => r.foto.length === 6 && r.foto.every(f => f.startsWith('data:image/jpeg'))) && D.rep.filter(r => r.kes === 'Kesimpulan diubah').length === 1 && D.sppd.length === 12 && D.cfg.signers.length === 2 && D.sppd[0].no === '001/SPPD/2026' && D.emp.slice(-1)[0].nama === 'Tanpa Nip Dua';
  await p.reload(); await p.waitForSelector('#app:not([hidden])', {timeout:30000}); await sleep(300);
  ok(await p.evaluate(utuh), 'muat ulang halaman: sesi pulih, semua data, foto & urutan utuh');
  await p.evaluate(() => Auth.logout()); await login(p); await sleep(300);
  ok(await p.evaluate(utuh), 'keluar lalu masuk lagi: semua data & foto utuh');
  await p.evaluate(async () => { D.rep[D.rep.length - 1].foto.splice(0, 2); await persist('rep'); await flush(); }); ok((await p.evaluate(async () => (await LDB.all()).filter(r => r[0].startsWith('ph:')).length)) === 70, 'menghapus 2 foto → 2 baris foto ikut terhapus dari penyimpanan');

  console.log('\n[6] Dua tab, ketikan tidak hilang; fokus dialog; efek latar');
  const p2 = await page(ctx); await p2.goto(U); await login(p2); await sleep(300);
  await p.evaluate(() => { ST.lap.id = D.sppd[5].id; location.hash = 'lap'; }); await p.waitForSelector('#l_latar'); await p.fill('#l_latar', 'Ketikan yang belum disimpan'); await p.focus('#l_latar');
  await p2.evaluate(() => { D.emp.push({id:uid(), nama:'Ditambah Dari Tab Lain', nip:'-', pangkat:'-', gol:'-', jabatan:'Staf', jk:'Perempuan', telp:'-', unit:'Biro', status:'Honorer'}); save('emp'); });
  ok(await until(p, () => D.emp.some(e => e.nama === 'Ditambah Dari Tab Lain')), 'perubahan dari tab lain masuk ke tab ini');
  ok(await p.inputValue('#l_latar') === 'Ketikan yang belum disimpan' && await p.evaluate(() => document.activeElement?.id) === 'l_latar', 'ketikan yang belum disimpan & fokus tetap ada setelah data diperbarui dari luar');
  await p2.close();
  await p.evaluate(() => location.hash = 'emp'); await sleep(200); await p.click('[data-act="edit"][data-k="emp"]:not([data-id])'); await p.waitForSelector('#f_nama'); const seen = new Set();
  for (let i = 0; i < 40; i++) { await p.keyboard.press('Tab'); seen.add(await p.evaluate(() => !!document.activeElement.closest('#mod .dlg'))); }
  ok(seen.size === 1 && seen.has(true), 'Tab 40× tidak keluar dari dialog (perangkap fokus)'); await p.evaluate(() => closeM());
  /* perangkat lambat disimulasikan: tiap frame ditunda 90 ms (≈11 fps) */
  await p.evaluate(() => { const r = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = f => r(t => setTimeout(() => f(performance.now()), 90)); FX.wake(); });
  ok(await until(p, () => FX.low, null, 30000) && await p.evaluate(() => localStorage.getItem('sppd_fxlow')) === '1', 'efek latar berhenti sendiri bila frame lambat (disimulasikan ≈11 fps) & diingat per perangkat');
  await p.evaluate(() => location.hash = 'tampil'); await sleep(300); ok(await p.evaluate(() => !!document.querySelector('[data-act="fxWake"]')), 'halaman Tampilan memberi tahu efek dijeda + tombol "Aktifkan lagi"');

  console.log('\n[7] Tampilan ponsel');
  const m = await br.newContext({viewport:{width:390, height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true, storageState:await ctx.storageState({indexedDB:true}).catch(() => ctx.storageState())}), q = await page(m);
  await q.goto(U); await login(q).catch(() => {}); await sleep(900); await q.screenshot({path:OUT + '/hp-dash.png'});
  await q.evaluate(() => { if (!D.emp.length) { D.emp.push({id:uid(), nama:'Pegawai Uji', nip:'-', pangkat:'-', gol:'-', jabatan:'Staf', jk:'Perempuan', telp:'-', unit:'Biro', status:'Honorer'}); save('emp'); } location.hash = 'emp'; }); await sleep(500); await q.screenshot({path:OUT + '/hp-emp.png'});
  const sz = await q.evaluate(() => { const b = document.querySelector('.ra .ib.sm')?.getBoundingClientRect(); return {btn:b ? [Math.round(b.width), Math.round(b.height)] : null, small:[...document.querySelectorAll('#app *')].filter(e => e.offsetParent && e.childElementCount === 0 && e.textContent.trim() && parseFloat(getComputedStyle(e).fontSize) < 10.4).length}; });
  ok(sz.btn && sz.btn[0] >= 44 && sz.btn[1] >= 44 && sz.small === 0, 'ponsel: tombol ikon ≥ 44 px, tidak ada teks di bawah 10,5 px', JSON.stringify(sz));
  ok(!p.errs.length && !q.errs.length, 'tidak ada error konsol selama seluruh skenario', [...p.errs, ...q.errs].join(' | '));
  await br.close(); process.exit(done() ? 1 : 0);
})().catch(e => { console.error('UJI BERHENTI:', e); process.exit(2); });
