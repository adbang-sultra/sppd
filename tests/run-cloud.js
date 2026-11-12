/* Skenario uji MODE CLOUD terhadap PostgreSQL asli (schema-sppd.sql).
   Pakai: node tests/run-cloud.js   (server: node tests/server.js 8802 cloud; basis data uji kosong + kode setup KODE) */
const {PW, ok, launch, page, toasts, setup, login, sleep, until, done, mkFotos} = require('./lib');
const U = process.env.URL_CLOUD || 'http://localhost:8802/', KODE = process.env.KODE || 'kode-setup-uji-1234567890';
const ctl = q => fetch(U + '__ctl' + (q || '')).then(r => r.json());
const sql = s => ctl('?sql=' + encodeURIComponent(s)).then(j => j.out);
const rpc = (fn, body, ip) => fetch(U + 'rest/v1/rpc/' + fn, {method:'POST', headers:{'Content-Type':'application/json', ...(ip ? {'x-test-ip':ip} : {})}, body:JSON.stringify(body)}).then(async r => ({status:r.status, j:await r.json().catch(() => null)}));
(async () => {
  await ctl('?fail=0&slow=0');
  await sql('truncate sppd_users cascade; truncate sppd_rows, sppd_sessions, sppd_audit, sppd_fails, sppd_nums; alter sequence sppd_ver restart;');
  const br = await launch(), mk = async () => page(await br.newContext({viewport:{width:1366, height:800}}));
  const A = await mk(), B = await mk();
  console.log('\n[1] Pemasangan cloud & pengguna');
  await A.goto(U); await A.waitForSelector('#a_c'); await A.fill('#a_c', 'kode-yang-salah-123456'); await A.fill('#a_n', 'Admin Uji'); await A.fill('#a_u', 'admin'); await A.fill('#a_p', PW); await A.fill('#a_p2', PW); await A.click('#a_b');
  ok(await until(A, () => /Kode setup salah/.test($('#a_e').textContent)), 'kode setup salah ditolak');
  await A.fill('#a_c', KODE); await A.click('#a_b'); await A.waitForSelector('#app:not([hidden])', {timeout:30000}); ok(true, 'administrator pertama dibuat dengan kode setup');
  await A.evaluate(async pw => { for (const [u, role] of [['operator1', 'operator'], ['pembaca1', 'viewer']]) { const id = uid(); await Cloud.rpc('sppd_user_put', {p_t:Cloud.token, p:{id, u, role, aktif:true, ...(await Cloud.entry(id, u, pw))}}); ACL.push({id, u, name:u, role, on:true}); } await saveACL(); }, PW);
  await A.evaluate(() => { const e = {id:uid(), ts:nextTs(), nama:'Pegawai Uji', nip:'199001012020121001', pangkat:'Penata', gol:'III/c', jabatan:'Analis', jk:'Laki-laki', telp:'-', unit:'Biro', status:'PNS'}; D.emp.push(e); save('emp');
    D.sppd.push({id:uid(), ts:nextTs(), no:'001/SPPD/2026', tgl:today(), empId:e.id, peg:{nama:e.nama, nip:e.nip, pangkat:e.pangkat, gol:e.gol, jabatan:e.jabatan, unit:e.unit}, maksud:'Uji', tujuan:'Jakarta', tb:'2026-11-16', tk:'2026-11-19', fol:[], bud:null, biaya:[]}); save('sppd'); log('Menambah SPPD: 001'); return Cloud.claim('001/SPPD/2026', null); });
  await until(A, () => Cloud.state === 'ok' && !Cloud.pending);
  await B.goto(U); await login(B, 'operator1'); ok(await B.evaluate(() => D.sppd.length === 1 && cur.role === 'operator'), 'perangkat kedua (operator) masuk & menerima data');

  console.log('\n[2] Ketikan tidak hilang saat sinkron');
  await A.evaluate(() => { ST.lap.id = D.sppd[0].id; location.hash = 'lap'; }); await A.waitForSelector('#l_latar'); await A.fill('#l_latar', 'Teks laporan yang sedang diketik.'); await A.focus('#l_latar');
  await A.evaluate(() => log('Aktivitas sendiri')); await sleep(21000);
  ok(await A.inputValue('#l_latar') === 'Teks laporan yang sedang diketik.', 'setelah simpanan sendiri + 21 detik: ketikan Laporan utuh');
  await B.evaluate(() => { D.emp.push({id:uid(), ts:nextTs(), nama:'Pegawai Dari B', nip:'-', pangkat:'-', gol:'-', jabatan:'Staf', jk:'Perempuan', telp:'-', unit:'Biro', status:'Honorer'}); save('emp'); log('Menambah pegawai'); });
  ok(await until(A, () => D.emp.some(e => e.nama === 'Pegawai Dari B')), 'perubahan perangkat lain tiba di perangkat ini');
  ok(await A.inputValue('#l_latar') === 'Teks laporan yang sedang diketik.' && await A.evaluate(() => document.activeElement?.id === 'l_latar'), 'ketikan & fokus tetap ada setelah data dari perangkat lain masuk');
  await A.evaluate(() => location.hash = 'set'); await A.waitForSelector('#c_pejabat'); await A.fill('#c_pejabat', 'Nama Pejabat (belum disimpan)'); await B.evaluate(() => log('Aktivitas lain')); await sleep(18000);
  ok(await A.inputValue('#c_pejabat') === 'Nama Pejabat (belum disimpan)', 'ketikan di Pengaturan Instansi utuh setelah aktivitas pengguna lain');
  await A.evaluate(() => location.hash = 'dash');

  console.log('\n[3] Dua perangkat mengubah SPPD yang sama');
  await B.evaluate(() => { D.sppd[0].tujuan = 'Makassar (B)'; save('sppd'); }); await A.evaluate(() => { D.sppd[0].maksud = 'Maksud dari A'; save('sppd'); });
  const both = () => D.sppd[0].tujuan === 'Makassar (B)' && D.sppd[0].maksud === 'Maksud dari A';
  ok(await until(A, both) && await until(B, both), 'kolom berbeda: kedua perubahan selamat di kedua perangkat', JSON.stringify(await A.evaluate(() => [D.sppd[0].tujuan, D.sppd[0].maksud])));
  await until(A, () => !Cloud.pending && Cloud.state === 'ok'); await until(B, () => !Cloud.pending && Cloud.state === 'ok');
  for (const P of [A, B]) await P.evaluate(() => { window.__t = []; new MutationObserver(m => m.forEach(x => x.addedNodes.forEach(n => __t.push(n.textContent)))).observe($('#toast'), {childList:true}); });
  await B.evaluate(() => { D.sppd[0].alat = 'Pesawat (B)'; save('sppd'); }); await A.evaluate(() => { D.sppd[0].alat = 'Kapal (A)'; save('sppd'); });
  const sama = async () => (await A.evaluate(() => D.sppd[0].alat)) === (await B.evaluate(() => D.sppd[0].alat)); let t0 = Date.now(); while (!(await sama()) && Date.now() - t0 < 40000) await sleep(500);
  const tt = [...await A.evaluate(() => __t), ...await B.evaluate(() => __t)].join(' | ');
  ok(await sama() && /isian yang sama/.test(tt), 'kolom sama: hasil akhir seragam di kedua perangkat + pemberitahuan bentrok', (await A.evaluate(() => D.sppd[0].alat)) + ' · ' + tt.slice(0, 90));
  await B.evaluate(() => { const id = D.emp.find(e => e.nama === 'Pegawai Dari B').id; D.emp = D.emp.filter(e => e.id !== id); save('emp'); }); await A.evaluate(() => { D.emp.find(e => e.nama === 'Pegawai Dari B').jabatan = 'Diubah A'; save('emp'); });
  const ada = () => D.emp.some(e => e.nama === 'Pegawai Dari B'); t0 = Date.now(); while ((await A.evaluate(ada)) !== (await B.evaluate(ada)) && Date.now() - t0 < 40000) await sleep(500);
  ok((await A.evaluate(ada)) === (await B.evaluate(ada)), 'hapus vs ubah bersamaan: kedua perangkat berakhir pada keadaan yang sama', 'data ' + ((await A.evaluate(ada)) ? 'dipertahankan' : 'terhapus'));

  console.log('\n[4] Nomor SPPD unik antarperangkat');
  const form = async (P, tb = '2027-03-01', no) => { await P.evaluate(() => go('form')); await P.waitForSelector('#s_no'); if (no) await P.fill('#s_no', no); else { await P.click('[data-act="numAuto"]'); await until(P, () => $('#s_no').value); } await P.selectOption('#s_emp', {index:1}); await P.fill('#s_maksud', 'Uji nomor'); await P.fill('#s_tujuan', 'Bandung'); await P.fill('#s_tb', tb); await P.fill('#s_tk', tb); return P.inputValue('#s_no'); };
  const nA = await form(A), nB = await form(B, '2027-04-01'); await A.click('#mok'); await until(A, () => !$('#mod').innerHTML); await B.click('#mok'); await sleep(1500);
  ok(nA === nB && await B.evaluate(() => !!$('#mod').innerHTML) && /baru saja dipakai/.test((await B.evaluate(() => __t)).join()), 'dua perangkat mendapat nomor sama → penyimpan kedua ditolak server', nA + ' / ' + nB);
  await B.click('[data-act="numAuto"]'); await until(B, n => $('#s_no').value && $('#s_no').value !== n, nA); const nB2 = await B.inputValue('#s_no'); await B.click('#mok'); await until(B, () => !$('#mod').innerHTML);
  ok(nB2 !== nA && await until(A, () => new Set(D.sppd.map(s => s.no)).size === 3 && D.sppd.length === 3), 'setelah klik Auto lagi: nomor berikutnya, tidak ada nomor kembar', nB2);

  console.log('\n[5] Offline');
  await ctl('?fail=1');
  await A.evaluate(() => { D.emp.push({id:uid(), ts:nextTs(), nama:'Diinput Saat Offline', nip:'-', pangkat:'-', gol:'-', jabatan:'Staf', jk:'Perempuan', telp:'-', unit:'Biro', status:'Honorer'}); save('emp'); }); await until(A, () => Cloud.state === 'off');
  await A.reload(); await A.waitForSelector('#app:not([hidden])', {timeout:30000}).catch(() => {});
  ok(await A.evaluate(() => Auth.logged() && D.emp.some(e => e.nama === 'Diinput Saat Offline') && D.sppd.length === 3 && !!D.cfg && ACL.length === 3), 'muat ulang saat offline: tetap masuk, data dari cache + perubahan yang belum terkirim tetap ada', 'status: ' + await A.evaluate(() => Cloud.state));
  await A.evaluate(() => { D.emp.push({id:uid(), ts:nextTs(), nama:'Offline Kedua', nip:'-', pangkat:'-', gol:'-', jabatan:'Staf', jk:'Perempuan', telp:'-', unit:'Biro', status:'Honorer'}); save('emp'); }); await sleep(1200);
  await A.evaluate(() => Auth.logout()); await A.waitForSelector('#a_r:not([hidden])', {timeout:30000}); ok(/belum terkirim/.test(await A.$eval('#login', e => e.textContent)), 'keluar saat offline: diberi tahu ada perubahan belum terkirim (tersimpan di perangkat)');
  await ctl('?fail=0'); await A.click('#a_r'); await A.waitForSelector('#a_u'); await ctl('?fail=1');
  await A.fill('#a_u', 'admin'); await A.fill('#a_p', PW); await A.click('#a_b'); await sleep(3000);
  ok(await A.evaluate(() => !$('#a_b').disabled && /Tidak dapat terhubung/.test($('#a_e').textContent)), 'masuk saat server tak terjangkau: pesan jelas, tombol aktif lagi', await A.$eval('#a_e', e => e.textContent));
  await ctl('?fail=0'); await A.click('#a_b'); await A.waitForSelector('#app:not([hidden])', {timeout:30000});
  ok(await until(B, () => ['Diinput Saat Offline', 'Offline Kedua'].every(n => D.emp.some(e => e.nama === n)), null, 40000), 'setelah online & masuk lagi: kedua perubahan offline terkirim dan tiba di perangkat lain');
  ok(await until(A, async () => !Cloud.pending) && +(await sql("select count(*) from sppd_rows where k like 'emp:%' and not del")) === await A.evaluate(() => D.emp.length), 'isi server = isi perangkat (tidak ada yang tertinggal di antrean)');

  console.log('\n[6] Foto laporan terpisah dari teks');
  const f = await mkFotos(A, 1, 3);
  await A.evaluate(f => { D.rep.push({id:uid(), ts:nextTs(), sppdId:D.sppd[0].id, status:'draft', hasil:'h', kes:'k', tgl:today(), foto:f}); save('rep'); }, f); await until(A, () => !Cloud.pending && Cloud.state === 'ok');
  const v1 = await sql("select string_agg(ver::text, ',' order by k) from sppd_rows where k like 'ph:%' and not del");
  ok(await until(B, () => D.rep.length === 1 && D.rep[0].foto.length === 3 && D.rep[0].foto.every(x => x.startsWith('data:image/jpeg'))), 'laporan + 3 foto tiba utuh di perangkat lain');
  await B.evaluate(() => { D.rep[0].kes = 'Kesimpulan diubah B'; save('rep'); }); await until(B, () => !Cloud.pending && Cloud.state === 'ok'); await until(A, () => D.rep[0].kes === 'Kesimpulan diubah B');
  ok(v1 === await sql("select string_agg(ver::text, ',' order by k) from sppd_rows where k like 'ph:%' and not del") && v1.split(',').length === 3 && await A.evaluate(() => D.rep[0].foto.length === 3), 'mengubah teks laporan tidak mengunggah ulang foto (versi baris foto di server tidak berubah)', 'versi foto: ' + v1);
  await A.evaluate(() => { D.rep[0].foto.splice(0, 1); save('rep'); }); ok(await until(B, () => D.rep[0].foto.length === 2) && +(await sql("select count(*) from sppd_rows where k like 'ph:%' and not del")) === 2, 'menghapus 1 foto → hilang di perangkat lain & di server');

  console.log('\n[7] Peran diperiksa server; audit; aturan SQL');
  const V = await mk(); await V.goto(U); await login(V, 'pembaca1');
  const r7 = await V.evaluate(async () => { try { await Cloud.rpc('sppd_push', {p_t:Cloud.token, p_rows:[{k:'emp:hack1234', v:'x', b:0}], p_api:2}); return 'DITERIMA'; } catch (e) { return e.message; } });
  ok(/AKSES/.test(r7), 'Pembaca mencoba menulis langsung ke server → ditolak', r7);
  const r7b = await V.evaluate(async () => { try { await Cloud.rpc('sppd_push', {p_t:Cloud.token, p_rows:[{k:'log:' + cur.id + '20200101', v:'x'}, {k:'log:orangxlain20261112', v:'x'}], p_api:2}); return await Cloud.rpc('sppd_user_list', {p_t:Cloud.token}).then(() => 'LIST OK', e => e.message); } catch (e) { return e.message; } });
  ok(+(await sql("select count(*) from sppd_rows where k in ('log:orangxlain20261112') or k like 'log:%20200101'")) === 0 && /AKSES/.test(r7b), 'log tanggal lampau / milik orang lain diabaikan server; daftar pengguna hanya untuk admin');
  await A.evaluate(() => location.hash = 'user'); await A.waitForSelector('[data-act="audit"]'); await A.click('[data-act="audit"]'); await A.waitForSelector('#mod .tbl');
  const aud = await A.$$eval('#mod .tbl tbody tr', a => a.map(r => r.textContent.replace(/\s+/g, ' ').trim())); ok(aud.some(x => /Masuk/.test(x)) && aud.some(x => /pengguna/.test(x)), 'Jejak Audit Server tampil di aplikasi', aud.length + ' baris, mis. "' + aud[0].slice(0, 60) + '"'); await A.evaluate(() => closeM());
  for (let i = 0; i < 6; i++) await rpc('sppd_login', {p_u:'admin', p_ah:'salah'}, '9.9.9.9');
  const l1 = await rpc('sppd_login', {p_u:'admin', p_ah:'salah'}, '9.9.9.9'), l2 = await rpc('sppd_login', {p_u:'tidakada', p_ah:'x'}, '8.8.8.8');
  const A2 = await mk(); await A2.goto(U); await login(A2, 'admin');
  ok(l1.j.err === 'lock' && l2.j.err === 'auth' && await A2.evaluate(() => Auth.logged()), 'penyerang dari IP lain mengunci dirinya sendiri; admin asli tetap bisa masuk', JSON.stringify(l1.j));
  const tok = await A.evaluate(() => Cloud.token), pg = await rpc('sppd_pull', {p_t:tok, p_since:0, p_lim:3});
  ok(pg.j.rows.length === 3 && pg.j.more === true && pg.j.ver === pg.j.rows[2].ver, 'pull berhalaman (p_lim=3 → 3 baris, more=true)');
  ok((await rpc('sppd_push', {p_t:tok, p_rows:[]})).status === 404 && (await rpc('sppd_pull', {p_t:tok, p_since:0})).status === 404, 'klien versi lama (tanda tangan fungsi lama) ditolak, tidak bisa menimpa data');
  ok(![...A.errs, ...B.errs, ...V.errs].length, 'tidak ada error konsol di semua perangkat', [...A.errs, ...B.errs, ...V.errs].join(' | '));
  await br.close(); process.exit(done() ? 1 : 0);
})().catch(e => { console.error('UJI BERHENTI:', e); process.exit(2); });
