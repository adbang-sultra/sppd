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
  await p.check('#ai_over'); await p.click('[data-act="aiLap"]');
  ok(await until(p, () => $('#l_latar').value.includes('Latar AI'), null, 8000), 'AI: opsi "Timpa isian" mengganti isi yang sudah ada');
  await p.fill('#l_kes', 'Kesimpulan hasil edit saya'); ok(await p.inputValue('#l_kes') === 'Kesimpulan hasil edit saya', 'AI: hasil dapat diedit setelah dibuat');

  /* ===== v1.4.0: prompt per bagian laporan + Model AI di Pengaturan ===== */
  console.log('\n[AI-1.4] Prompt per bagian laporan & Model AI (Pengaturan)');
  const aiHook = () => p.evaluate(() => { if (window.__aiReq) return; window.__aiReq = []; const f = window.fetch.bind(window); window.fetch = (u, o) => { if (String(u).includes('/api/ai')) { try { window.__aiReq.push(JSON.parse(o.body)); } catch {} } return f(u, o); }; });
  await aiHook();
  const aiST = await p.evaluate(() => JSON.stringify(ST));
  const aiStBack = () => p.evaluate(j => { const o = JSON.parse(j); for (const k of Object.keys(o)) { Object.keys(ST[k]).forEach(x => { if (!(x in o[k])) delete ST[k][x]; }); Object.assign(ST[k], o[k]); } }, aiST);   // pulihkan status halaman (ST) seperti sebelum blok ini
  const aiLast = () => p.evaluate(() => window.__aiReq[window.__aiReq.length - 1]);
  const aiKeys = ['latar', 'dasar', 'mt', 'wkt', 'keg', 'hasil', 'kes', 'tl', 'penutup'];
  ok(await p.evaluate(ks => ks.every(k => $('#ai_p_' + k) && $(`[data-act="aiGen"][data-k="${k}"][data-m="baru"]`) && $(`[data-act="aiGen"][data-k="${k}"][data-m="revisi"]`)), aiKeys), 'Laporan: 9 bagian (termasuk Dasar Hukum) masing-masing punya kotak prompt + tombol Buat/Revisi');
  ok(await p.evaluate(() => !$('#ai_model') && /bawaan server/.test($('.aibar').textContent)), 'Laporan: tanpa model di panel admin → "Model: bawaan server"');
  await p.screenshot({path:OUT + '/ai-lap-desktop.png', fullPage:false});
  await p.fill('#l_latar', 'Latar buatan tangan'); await p.fill('#ai_p_latar', 'Tekankan koordinasi pembangunan'); await p.fill('#l_kes', 'Kesimpulan tidak boleh berubah');
  await p.click('[data-act="aiGen"][data-k="latar"][data-m="baru"]');
  ok(await until(p, () => $('#l_latar').value.startsWith('Hasil AI latar'), null, 8000), 'Prompt per bagian: tombol Buat mengisi kolom Latar Belakang');
  const aiG1 = await p.evaluate(() => ({v:$('#l_latar').value, ro:$('#l_latar').readOnly, undo:!$('[data-act="aiUndo"][data-k="latar"]').hidden, st:$('#ai_s_latar').textContent, kes:$('#l_kes').value, off:[...$$('[data-act="aiGen"][data-k="latar"]')].some(x => x.disabled)}));
  ok(/arahan: Tekankan koordinasi pembangunan/.test(aiG1.v) && /model: server/.test(aiG1.v) && !aiG1.ro && aiG1.undo && /Selesai/.test(aiG1.st) && aiG1.kes === 'Kesimpulan tidak boleh berubah' && !aiG1.off, 'Hasil masuk ke kolom (bisa diedit), bagian lain tidak berubah, tombol Urungkan muncul', JSON.stringify(aiG1));
  const aiR1 = await aiLast();
  ok(aiR1.kind === 'bagian' && aiR1.sec === 'latar' && aiR1.mode === 'baru' && aiR1.prompt === 'Tekankan koordinasi pembangunan' && aiR1.model === null && !!aiR1.ctx.tujuan && !JSON.stringify(aiR1).includes('Budi Uji'), 'Permintaan: jenis "bagian", arahan terkirim, tanpa nama pegawai', JSON.stringify(aiR1).slice(0, 260));
  await p.fill('#l_latar', 'Hasil AI latar diedit manual'); ok(await p.inputValue('#l_latar') === 'Hasil AI latar diedit manual', 'Hasil AI dapat diedit langsung di kolom');
  await p.click('[data-act="aiUndo"][data-k="latar"]');
  ok(await p.inputValue('#l_latar') === 'Latar buatan tangan' && await p.evaluate(() => $('[data-act="aiUndo"][data-k="latar"]').hidden), 'Urungkan: isi sebelum hasil AI kembali & tombol tersembunyi');
  await p.fill('#l_mt', ''); await p.click('[data-act="aiGen"][data-k="mt"][data-m="revisi"]'); await sleep(250);
  ok((await toasts(p)).some(t => /masih kosong/.test(t)), 'Revisi pada kolom kosong ditolak dengan pesan');
  await p.fill('#l_mt', 'Maksud awal yang akan direvisi'); await p.click('[data-act="aiGen"][data-k="mt"][data-m="revisi"]'); await sleep(250);
  ok((await toasts(p)).some(t => /arahan revisi/.test(t)), 'Revisi tanpa arahan ditolak dengan pesan');
  await p.fill('#ai_p_mt', 'persingkat'); await p.click('[data-act="aiGen"][data-k="mt"][data-m="revisi"]');
  ok(await until(p, () => $('#l_mt').value.includes('(revisi dari: Maksud awal yang a'), null, 8000), 'Revisi: teks lama dikirim dan diganti hasil revisi');
  const aiR2 = await aiLast(); ok(aiR2.mode === 'revisi' && aiR2.cur === 'Maksud awal yang akan direvisi' && aiR2.prompt === 'persingkat', 'Permintaan revisi memuat teks saat ini + arahan', JSON.stringify(aiR2).slice(0, 200));
  await p.fill('#ai_p_penutup', 'nada singkat'); await p.press('#ai_p_penutup', 'Enter');
  ok(await until(p, () => $('#l_penutup').value.includes('arahan: nada singkat'), null, 8000), 'Enter di kotak prompt = Buat');
  await p.fill('#ai_p_dasar', 'UU 23/2014 dan Permendagri 77/2020'); await p.click('[data-act="aiGen"][data-k="dasar"][data-m="baru"]');
  ok(await until(p, () => $('#l_dasar').value.startsWith('Hasil AI dasar'), null, 8000) && /Periksa nomor, tahun, dan judul peraturan/.test(await p.textContent('#ai_s_dasar')), 'Dasar Hukum dapat dibuat dari prompt + pengingat memeriksa peraturan');
  await p.fill('#ai_p_hasil', 'rapat menyepakati percepatan'); await p.fill('#ai_p_tl', 'rapat evaluasi bulanan'); await p.click('[data-act="aiLap"]');
  ok(await until(p, () => !$('[data-act="aiLap"]').disabled, null, 8000), 'Buat Semua Bagian selesai'); const aiR3 = await aiLast();
  ok(aiR3.kind === 'laporan' && aiR3.ctx.hints && aiR3.ctx.hints.tl === 'rapat evaluasi bulanan' && !aiR3.ctx.hints.hasil, 'Buat Semua Bagian: arahan per bagian ikut dikirim sebagai hints');

  /* prompt tersimpan bersama laporan & bertahan setelah muat ulang (laporan SPPD #1 dipulihkan sesudahnya) */
  const aiRepBak = await p.evaluate(() => structuredClone(D.rep.find(x => x.sppdId === D.sppd[0].id)));   // cadangan di sisi Node (variabel halaman hilang saat reload)
  await p.click('[data-act="saveLap"][data-f="0"]'); await sleep(700);
  const aiSv = await p.evaluate(() => { const r = D.rep.find(x => x.sppdId === D.sppd[0].id); return r && {ap:r.ap, dasar:r.dasar}; });
  ok(aiSv && aiSv.ap.latar === 'Tekankan koordinasi pembangunan' && aiSv.ap.mt === 'persingkat' && aiSv.ap.dasar === 'UU 23/2014 dan Permendagri 77/2020' && aiSv.ap.penutup === 'nada singkat' && /^Hasil AI dasar/.test(aiSv.dasar), 'Simpan: prompt tiap bagian ikut tersimpan di laporan', JSON.stringify(aiSv).slice(0, 220));
  await p.reload(); await p.waitForSelector('#app:not([hidden])', {timeout:30000}); await sleep(400); await aiHook();
  await p.evaluate(() => { ST.lap.id = D.sppd[0].id; location.hash = 'lap'; render(); }); await p.waitForSelector('#ai_p_latar');
  ok(await p.evaluate(() => $('#ai_p_latar').value === 'Tekankan koordinasi pembangunan' && $('#ai_p_dasar').value === 'UU 23/2014 dan Permendagri 77/2020'), 'Setelah muat ulang: prompt tiap bagian muncul lagi di kotaknya');
  await p.evaluate(b => { const r = D.rep.find(x => x.sppdId === D.sppd[0].id); for (const k of Object.keys(r)) delete r[k]; Object.assign(r, b); save('rep'); }, aiRepBak); await sleep(300);

  /* ---- Pengaturan → Model AI (Administrator) ---- */
  await p.evaluate(() => { location.hash = 'peng'; }); await sleep(300); await p.click('[data-act="tab"][data-k="peng"][data-v="ai"]'); await sleep(300);
  ok(await p.evaluate(() => $$('.seg').some(x => /Model AI/.test(x.textContent)) && !!$('[data-act="aiAdd"]') && /Keamanan kunci API/.test($('#main').textContent)), 'Pengaturan: tab "Model AI" tersedia + catatan keamanan kunci');
  ok(await p.evaluate(() => { location.hash = 'ai'; return true; }) && (await sleep(300), await p.evaluate(() => RT === 'peng' && ST.peng.t === 'ai')), 'Alamat #ai membuka Pengaturan → Model AI');
  await p.screenshot({path:OUT + '/ai-pengaturan-kosong.png'});
  await p.click('[data-act="aiAdd"]'); await p.waitForSelector('#ai_n'); await sleep(450); await p.fill('#ai_n', 'Claude Haiku (uji)'); await p.selectOption('#ai_pv', 'anthropic');
  ok(await p.inputValue('#ai_m') === 'claude-haiku-5-5' && await p.evaluate(() => $('#ai_bw').hidden), 'Tambah model: ID model terisi sesuai penyedia, kolom Base URL tersembunyi');
  await p.fill('#ai_k', 'sk-ant-RAHASIA-12345678'); await p.screenshot({path:OUT + '/ai-model-form.png'}); await p.click('#mok'); await sleep(600);
  const aiM1 = await p.evaluate(() => { const A = D.cfg.ai; return {n:A.models.length, m:A.models[0], def:A.def, id:A.models[0].id, txt:$('#main').textContent, html:document.documentElement.innerHTML}; });
  ok(aiM1.n === 1 && aiM1.m.prov === 'anthropic' && aiM1.m.model === 'claude-haiku-5-5' && aiM1.m.key === 'sk-ant-RAHASIA-12345678' && aiM1.def === aiM1.id && aiM1.m.on === true, 'Model pertama tersimpan di cfg.ai dan otomatis menjadi bawaan', JSON.stringify({...aiM1.m, key:'***'}));
  ok(/••••5678/.test(aiM1.txt) && !aiM1.html.includes('RAHASIA-12345678'), 'Daftar hanya menampilkan 4 digit terakhir kunci; kunci utuh tidak ada di DOM');
  await p.click('[data-act="aiAdd"]'); await p.waitForSelector('#ai_n'); await sleep(450); await p.fill('#ai_n', 'LLM Kustom'); await p.selectOption('#ai_pv', 'custom');
  ok(await p.evaluate(() => !$('#ai_bw').hidden && $('#ai_m').value === ''), 'Penyedia kustom: Base URL muncul, ID model dikosongkan');
  await p.fill('#ai_m', 'qwen-2.5'); await p.fill('#ai_b', 'http://tidak-aman.contoh.id/v1'); await p.click('#mok'); await sleep(300);
  ok((await toasts(p)).some(t => /https:\/\//.test(t)) && await p.evaluate(() => D.cfg.ai.models.length === 1), 'Penyedia kustom: Base URL tanpa https ditolak dan tidak tersimpan');
  await p.fill('#ai_b', 'https://api.contoh.id/v1/'); await p.fill('#ai_n', 'Claude Haiku (uji)'); await p.click('#mok'); await sleep(300);
  ok((await toasts(p)).some(t => /sudah dipakai/.test(t)), 'Nama tampilan kembar ditolak'); await p.fill('#ai_n', 'LLM Kustom'); await p.click('#mok'); await sleep(500);
  const aiM2 = await p.evaluate(() => ({n:D.cfg.ai.models.length, m:D.cfg.ai.models[1], def:D.cfg.ai.def, first:D.cfg.ai.models[0].id}));
  ok(aiM2.n === 2 && aiM2.m.base === 'https://api.contoh.id/v1' && aiM2.m.key === '' && aiM2.def === aiM2.first, 'Model kedua (kustom, tanpa kunci → kunci server) tersimpan; bawaan tidak berubah', JSON.stringify(aiM2.m));
  await p.screenshot({path:OUT + '/ai-pengaturan-daftar.png'});
  await p.click(`[data-act="aiTest"][data-id="${aiM1.id}"]`); await sleep(900);
  const aiRq = await aiLast(); ok((await toasts(p)).some(t => /Claude Haiku \(uji\): terhubung/.test(t)) && aiRq.kind === 'tes' && aiRq.model.prov === 'anthropic' && aiRq.model.key === 'sk-ant-RAHASIA-12345678', 'Uji koneksi: berhasil, mengirim konfigurasi model yang dipilih', JSON.stringify(aiRq).replace(/RAHASIA-\d+/, '***'));
  await p.click(`[data-act="aiEdit"][data-id="${aiM1.id}"]`); await p.waitForSelector('#ai_n'); await sleep(450);
  ok(await p.evaluate(() => $('#ai_k').value === '' && /5678/.test($('#ai_k').placeholder) && !document.body.innerHTML.includes('RAHASIA-12345678')), 'Ubah: kolom kunci kosong (hanya penanda 4 digit terakhir), kunci utuh tidak ditampilkan');
  await p.fill('#ai_n', 'Claude Haiku v2'); await p.click('#mok'); await sleep(400);
  ok(await p.evaluate(() => D.cfg.ai.models[0].nama === 'Claude Haiku v2' && D.cfg.ai.models[0].key === 'sk-ant-RAHASIA-12345678'), 'Ubah: kunci dikosongkan di formulir → kunci lama dipertahankan');
  await p.reload(); await p.waitForSelector('#app:not([hidden])', {timeout:30000}); await sleep(400); await aiHook();
  ok(await p.evaluate(() => D.cfg.ai && D.cfg.ai.models.length === 2 && D.cfg.ai.models[0].key === 'sk-ant-RAHASIA-12345678' && D.cfg.ai.def === D.cfg.ai.models[0].id), 'Model AI bertahan setelah muat ulang (tersimpan terenkripsi)');
  const aiBk = await p.evaluate(() => structuredClone(D.cfg)); await p.evaluate(() => { location.hash = 'peng'; }); await sleep(200); await p.click('[data-act="tab"][data-k="peng"][data-v="ins"]'); await sleep(200);
  await p.click('[data-act="resetCfg"]'); await p.waitForSelector('.ov.ask [data-r="1"]'); await p.click('.ov.ask [data-r="1"]'); await sleep(500);
  ok(await p.evaluate(() => D.cfg.ai && D.cfg.ai.models.length === 2), 'Reset Identitas tidak menghapus model AI maupun kuncinya'); await p.evaluate(b => { D.cfg = b; save('cfg'); }, aiBk); await sleep(300);

  /* ---- Backup & restore tidak membocorkan / menghilangkan kunci API ---- */
  ok(await p.evaluate(() => { const plain = JSON.stringify(bakData(true)), full = JSON.stringify(bakData()), j = JSON.parse(plain).data.cfg.ai; return !plain.includes('RAHASIA-12345678') && full.includes('RAHASIA-12345678') && j.models.length === 2 && j.models.every(m => m.key === ''); }), 'Backup biasa (tanpa enkripsi): kunci API tidak ikut; data terenkripsi/di aplikasi tetap lengkap');
  ok(await p.evaluate(() => { const cur = {models:[{id:'a', key:'K-A'}, {id:'b', key:'K-B'}], def:'a'}, n1 = {ai:{models:[{id:'a', key:''}, {id:'c', key:''}, {id:'b', key:'K-BARU'}], def:'a'}}, n2 = {}; aiMergeRestore(n1, cur); aiMergeRestore(n2, cur); aiMergeRestore(null, cur); aiMergeRestore({ai:{models:[]}}, null); return n1.ai.models[0].key === 'K-A' && n1.ai.models[1].key === '' && n1.ai.models[2].key === 'K-BARU' && n2.ai === cur; }), 'Restore: kunci kosong di backup diisi dari model yang sama; backup tanpa model AI mempertahankan yang ada');
  const aiBak = await p.evaluate(() => JSON.stringify(bakData(true))), aiBefore = await p.evaluate(() => JSON.stringify({s:D.sppd.length, e:D.emp.length, r:D.rep.length, a:D.cfg.ai.models.map(m => [m.id, m.nama, m.key])}));
  await p.evaluate(() => { location.hash = 'akses'; }); await sleep(300);
  await p.evaluate(() => { $('#fjson').value = ''; }); await p.setInputFiles('#fjson', {name:'backup_uji.json', mimeType:'application/json', buffer:Buffer.from(aiBak)});
  await p.waitForSelector('.ov.ask [data-r="1"]'); await p.click('.ov.ask [data-r="1"]'); await p.waitForSelector('#ra_p'); await sleep(450); await p.fill('#ra_p', PW); await p.click('#mok');
  ok(await until(p, () => /Restore berhasil/.test([...document.querySelectorAll('#toast .tst')].map(x => x.textContent).join(' ')), null, 15000), 'Restore dari Backup biasa lewat berkas: berhasil');
  ok(await p.evaluate(b => JSON.stringify({s:D.sppd.length, e:D.emp.length, r:D.rep.length, a:D.cfg.ai.models.map(m => [m.id, m.nama, m.key])}) === b, aiBefore), 'Setelah restore: data tidak berubah dan kunci API model tetap utuh (tidak terhapus oleh backup tanpa kunci)', aiBefore.replace(/RAHASIA-\d+/, '***').slice(0, 160));
  await p.evaluate(() => { location.hash = 'lap'; }); await sleep(200);

  /* ---- Laporan memakai model dari panel admin ---- */
  await p.evaluate(() => { ST.lap.id = D.sppd[0].id; location.hash = 'lap'; render(); }); await p.waitForSelector('#ai_model');
  ok(await p.evaluate(() => { const o = [...$('#ai_model').options]; return o.length === 2 && o[0].textContent === 'Claude Haiku v2' && o[0].selected; }), 'Laporan: pilihan model memuat model aktif, bawaan terpilih');
  await p.fill('#ai_p_kes', 'uji model'); await p.click('[data-act="aiGen"][data-k="kes"][data-m="baru"]'); await until(p, () => /Hasil AI kes/.test($('#l_kes').value), null, 8000);
  const aiRm1 = await aiLast(); ok(/model: claude-haiku-5-5/.test(await p.inputValue('#l_kes')) && aiRm1.model.prov === 'anthropic' && aiRm1.model.key === 'sk-ant-RAHASIA-12345678', 'Bagian dibuat dengan model bawaan dari panel admin (penyedia, ID, kunci terkirim ke server)');
  ok(await p.evaluate(() => !document.documentElement.innerHTML.includes('RAHASIA-12345678')), 'Halaman Laporan tidak menampilkan kunci API');
  await p.selectOption('#ai_model', await p.evaluate(() => D.cfg.ai.models[1].id)); await p.fill('#ai_p_tl', 'uji model dua'); await p.click('[data-act="aiGen"][data-k="tl"][data-m="baru"]'); await until(p, () => /Hasil AI tl/.test($('#l_tl').value), null, 8000);
  const aiRm2 = await aiLast(); ok(/model: qwen-2.5/.test(await p.inputValue('#l_tl')) && aiRm2.model.prov === 'custom' && aiRm2.model.base === 'https://api.contoh.id/v1', 'Mengganti model di halaman Laporan dipakai untuk permintaan berikutnya (penyedia kustom + Base URL)');
  await p.screenshot({path:OUT + '/ai-lap-model.png'});
  await p.evaluate(() => { location.hash = 'peng'; }); await sleep(200); await p.click('[data-act="tab"][data-k="peng"][data-v="ai"]'); await sleep(200);
  await p.click(`[data-act="aiDef"][data-id="${aiM2.m.id}"]`); await sleep(300);
  ok(await p.evaluate(id => D.cfg.ai.def === id && /Bawaan/.test([...$$('#main tbody tr, #main .tr, #main tr')].find(r => /LLM Kustom/.test(r.textContent))?.textContent || ''), aiM2.m.id), 'Jadikan bawaan: model kedua bertanda "Bawaan"');
  await p.evaluate(() => { ST.lap.model = ''; ST.lap.id = D.sppd[0].id; location.hash = 'lap'; render(); }); await p.waitForSelector('#ai_model');
  ok(await p.evaluate(() => { const o = $('#ai_model'); return o.options[o.selectedIndex].textContent === 'LLM Kustom'; }), 'Laporan: model bawaan baru terpilih otomatis');
  await p.evaluate(() => { location.hash = 'peng'; }); await sleep(200); await p.click('[data-act="tab"][data-k="peng"][data-v="ai"]'); await sleep(200);
  await p.click(`[data-act="aiEdit"][data-id="${aiM2.m.id}"]`); await p.waitForSelector('#ai_n'); await sleep(450); await p.selectOption('#ai_on', '0'); await p.click('#mok'); await sleep(400);
  ok(await p.evaluate(id => D.cfg.ai.models[1].on === false && D.cfg.ai.def === id && /Nonaktif/.test($('#main').textContent), aiM1.id), 'Model dinonaktifkan (tampil "Nonaktif"); bawaan pindah ke model aktif lain');
  await p.evaluate(() => { ST.lap.model = ''; ST.lap.id = D.sppd[0].id; location.hash = 'lap'; render(); }); await p.waitForSelector('#ai_model');
  ok(await p.evaluate(() => $('#ai_model').options.length === 1), 'Model nonaktif tidak muncul di pilihan Laporan');
  await p.evaluate(() => { location.hash = 'peng'; }); await sleep(200); await p.click('[data-act="tab"][data-k="peng"][data-v="ai"]'); await sleep(200);
  await p.click(`[data-act="aiEdit"][data-id="${aiM1.id}"]`); await p.waitForSelector('#ai_n'); await sleep(450); await p.selectOption('#ai_dk', '1'); await p.click('#mok'); await sleep(400);
  ok(await p.evaluate(() => D.cfg.ai.models[0].key === '' && /kunci server/.test($('#main').textContent)), 'Ubah: "Hapus — pakai kunci server" mengosongkan kunci tersimpan');
  for (const id of [aiM2.m.id, aiM1.id]) { await p.click(`[data-act="aiDel"][data-id="${id}"]`); await p.waitForSelector('.ov.ask [data-r="1"]'); await p.click('.ov.ask [data-r="1"]'); await sleep(350); }
  ok(await p.evaluate(() => D.cfg.ai.models.length === 0 && D.cfg.ai.def === ''), 'Hapus model (dengan konfirmasi) → daftar kosong, bawaan dikosongkan');
  ok(await p.evaluate(() => ({a:PERM.aiAdd, e:PERM.aiEdit, t:PERM.aiTest, d:PERM.aiDel, g:PERM.aiGen, tab:TABOK.peng.includes('ai'), pg:PG.operator.includes('peng') || PG.viewer.includes('peng') || PG.kepala.includes('peng')})).then(x => x.a === 'a' && x.e === 'a' && x.t === 'a' && x.d === 'a' && x.g === 'w' && x.tab && !x.pg), 'Hak akses: kelola model hanya Administrator; membuat bagian laporan operator ke atas');
  ok(await p.evaluate(() => { const k = 'sk-x-12345678'; const c = CLEAN.cfg({ai:{models:[{id:'abcd1234', nama:'A', prov:'bukan-penyedia', model:'m', key:' sk x 123 ', base:'javascript:alert(1)', temp:9, on:true}, {nama:'', model:'x'}, {nama:'B', prov:'openai', model:''}], def:'tidak-ada'}}); const m = c.ai.models[0]; return c.ai.models.length === 1 && m.prov === 'gemini' && m.key === 'skx123' && m.base === '' && m.temp === 1 && c.ai.def === '' && JSON.stringify(CLEAN.rep([{ap:{latar:'a', hack:'x', __proto__:{x:1}}}])[0].ap) === '{"latar":"a"}'; }), 'Pembersih data: penyedia/Base URL/temperature tak valid dinormalkan, bagian tak dikenal di prompt dibuang');
  ok(!p.errs.length, 'Fitur AI v1.4: tidak ada error konsol (CSP ketat)', p.errs.join(' | '));
  await aiStBack(); await p.evaluate(() => { location.hash = 'lap'; render(); }); await sleep(300);
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
  await p.evaluate(() => go('form')); await p.waitForSelector('#s_no'); await sleep(300);   // dialog memindahkan fokus ke kolom pertama ±60 ms setelah terbuka
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
