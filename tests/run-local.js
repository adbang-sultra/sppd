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
  ok(await p.evaluate(() => $('#sideUser').textContent.includes('v1.2')), 'nomor versi tampil (v1.2)');

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
  await p.evaluate(() => { D.cfg.signers = [{jabatan:'Kepala Biro Administrasi Pembangunan', nama:'Kepala Biro Uji', nip:'197001011995031001'}, {jabatan:'Pejabat Pembuat Komitmen', nama:'PPK Uji', nip:'198001012005011002'}]; D.cfg.pejabat = 'Sekda Uji'; D.cfg.nip = '196501011990031001'; D.cfg.bendahara = 'Bendahara Uji'; D.cfg.nipBend = '198505052010012003'; save('cfg');
    D.prog.push({id:uid(), ta:'2026', program:'Program Uji', kdProgram:'1.01', kegiatan:'Koordinasi Pembangunan', kdKegiatan:'1.01.01', sub:'', kdSub:'', rek:'5.1.02.04.01.0001', sumber:'APBD', pagu:'10000000', unit:'Biro'}); save('prog'); });
  const mkSppd = async (tb, tk, biaya) => { await p.evaluate(() => go('form')); await p.waitForSelector('#s_no'); await p.click('[data-act="numAuto"]'); await sleep(150); const no = await p.inputValue('#s_no');
    await p.selectOption('#s_emp', {label:'Budi Uji, S.E., M.Si'}); await p.fill('#s_maksud', 'Koordinasi dan konsultasi pelaporan pembangunan'); await p.fill('#s_tujuan', 'Jakarta'); await p.fill('#s_tb', tb); await p.fill('#s_tk', tk);
    await p.fill('#s_stNo', '094/123/2026'); await p.fill('#s_dasar', 'DPA Biro Tahun 2026'); await p.selectOption('#s_stS', '0'); await p.selectOption('#s_spdS', '1'); await p.selectOption('#s_prog', {index:1});
    if (biaya) { await p.click('[data-act="biaAdd"][data-t="uh"]'); await p.keyboard.type('530000'); await p.click('[data-act="biaAdd"][data-t="tr"]'); await p.keyboard.type('4.500.000'); await p.click('[data-act="biaAdd"][data-t="inap"]'); await p.keyboard.type('900000'); }
    return no; };
  const no1 = await mkSppd('2026-11-16', '2026-11-19', true); const tot = await p.$eval('#biaTot', e => e.textContent), sisa = await p.$eval('#progInfo', e => e.textContent.replace(/\s+/g, ' '));
  await p.screenshot({path:OUT + '/form-biaya.png'}); await p.click('#mok'); await sleep(500);
  ok(no1 === '001/SPPD/2026' && await p.evaluate(() => D.sppd.length) === 1, 'SPPD #1 tersimpan, nomor otomatis', no1);
  ok(/9\.320\.000/.test(tot), 'total biaya dihitung (4×530.000 + 4.500.000 + 3×900.000)', tot + ' | ' + sisa.slice(-60));
  ok(await p.evaluate(() => { const s = D.sppd[0]; return s.peg?.nama === 'Budi Uji, S.E., M.Si' && s.stS?.nama === 'Kepala Biro Uji' && s.spdS?.nama === 'PPK Uji'; }), 'salinan pegawai & penanda tangan per dokumen tersimpan di SPPD');
  await mkSppd('2026-11-18', '2026-11-20', true); await p.click('#mok'); await p.waitForSelector('.ov.ask'); const q1 = await p.$eval('.ov.ask p', e => e.textContent);
  ok(/bentrok/i.test(q1) && /001\/SPPD\/2026/.test(q1), 'bentrok jadwal terdeteksi sebelum simpan', q1.replace(/\s+/g, ' ').slice(0, 110));
  await p.click('.ov.ask [data-r="1"]'); await p.waitForSelector('.ov.ask'); const q2 = await p.$eval('.ov.ask p', e => e.textContent);
  ok(/melebihi sisa pagu/.test(q2), 'peringatan melebihi sisa pagu', q2.replace(/\s+/g, ' ').slice(0, 80)); await p.click('.ov.ask [data-r="0"]'); await sleep(200);
  ok(await p.evaluate(() => D.sppd.length) === 1 && await p.evaluate(() => !!$('#mod').innerHTML), 'batal → SPPD tidak tersimpan, form tetap terbuka'); await p.evaluate(() => closeM());
  ok(await p.evaluate(() => { D.sppd.push({...structuredClone(D.sppd[0]), id:uid(), no:'007/SPPD/2025'}); const a = numNext('2026'), b = numNext('2025'); D.sppd.pop(); return a + ' ' + b; }) === '002/SPPD/2026 008/SPPD/2025', 'nomor urut dihitung per tahun');
  await p.evaluate(() => { const e = D.emp.find(x => x.nama === 'Budi Uji, S.E., M.Si'); e.jabatan = 'Jabatan Baru Setelah Mutasi'; save('emp'); });
  ok(await p.evaluate(() => docs(D.sppd[0], 'sppd').includes('Analis Kebijakan') && !docs(D.sppd[0], 'sppd').includes('Jabatan Baru')), 'dokumen SPPD lama memakai jabatan saat diterbitkan (tidak ikut berubah)');

  console.log('\n[4] Dokumen cetak & Word');
  await p.evaluate(() => { D.rep.push({id:uid(), sppdId:D.sppd[0].id, status:'selesai', latar:'Latar belakang uji. '.repeat(30), hasil:'Hasil satu\nHasil dua\nHasil tiga', kes:'Kesimpulan uji. '.repeat(40), tl:'Rekomendasi satu\nRekomendasi dua', tgl:today(), foto:[]}); save('rep'); ST.cetak.id = D.sppd[0].id; ST.cetak.v = 'all'; location.hash = 'cetak'; }); await sleep(600);
  const html = await p.evaluate(() => docs(D.sppd[0], 'all'));
  ok(/RINCIAN BIAYA PERJALANAN DINAS/.test(html) && /KUITANSI/.test(html) && /Sembilan juta tiga ratus dua puluh ribu rupiah/.test(html), 'Rincian Biaya & Kuitansi ada di paket, terbilang benar');
  ok(/KEPALA BIRO ADMINISTRASI PEMBANGUNAN/.test(await p.evaluate(() => dST(D.sppd[0]))) && /PEJABAT PEMBUAT KOMITMEN/.test(await p.evaluate(() => dSPPD(D.sppd[0]))), 'Surat Tugas & SPD ditandatangani pejabat berbeda');
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
