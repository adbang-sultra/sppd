/* Uji MIGRASI dari v1.1 → v1.2 (lokal: localStorage → IndexedDB; cloud: skema & format baris lama) + uji kunci push di SQL.
   Pakai: OLD=/jalur/ke/sim-sppd-v1.1 node tests/run-migrasi.js
   Perlu: psql & PGHOST/PGPORT/PGUSER (pengguna yang boleh membuat basis data). Membuat basis data sementara "sppd_mig". */
const {spawn, execFileSync} = require('child_process'), path = require('path'), fs = require('fs'), os = require('os');
const {chromium} = require('playwright'); const {PW, ok, sleep, until, done, mkFotos} = require('./lib');
const OLD = process.env.OLD, NEW = path.resolve(__dirname, '..'); if (!OLD) { console.log('Lewati: set OLD=/jalur/ke/versi-1.1'); process.exit(0); }
const psql = (db, args) => execFileSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', db, ...args], {encoding:'utf8', stdio:['ignore', 'pipe', 'pipe']}).trim();
const SRV = []; process.on('exit', () => SRV.forEach(c => { try { c.kill(); } catch {} }));
const serve = (root, port, mode, env = {}) => new Promise(res => { const c = spawn('node', [path.join(__dirname, 'server.js'), port, mode], {env:{...process.env, ROOT:root, ...env}}); SRV.push(c); c.stdout.once('data', () => res(c)); c.stderr.on('data', d => process.stderr.write(d)); });
const prof = n => { const d = path.join(os.tmpdir(), 'sppd-prof-' + n + '-' + Date.now()); fs.mkdirSync(d, {recursive:true}); return d; };
const open = d => chromium.launchPersistentContext(d, {executablePath:process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox', '--no-proxy-server'], viewport:{width:1366, height:800}});
const isi = async p => p.evaluate(() => ({emp:D.emp.map(e => e.nama), sppd:D.sppd.map(s => s.no), rep:D.rep.map(r => [r.kes, r.foto.length, r.foto.every(f => f.startsWith('data:image/'))]), logo:(D.cfg.logo || '').slice(0, 22), inst:D.cfg.instansi}));
const seed = async p => { const f = await mkFotos(p, 3, 2);
  await p.evaluate(async f => { ['Pegawai Satu', 'Pegawai Dua', 'Pegawai Tiga'].forEach((n, i) => D.emp.push({id:uid(), nama:n, nip:'19900101202012100' + i, pangkat:'Penata', gol:'III/c', jabatan:'Analis', jk:'Laki-laki', telp:'-', unit:'Biro', status:'PNS'})); save('emp');
    ['001/SPPD/2026', '002/SPPD/2026'].forEach(no => D.sppd.push({id:uid(), no, tgl:today(), empId:D.emp[0].id, maksud:'Uji', tujuan:'Jakarta', tb:'2026-11-16', tk:'2026-11-19', fol:[], bud:null})); save('sppd');
    D.rep.push({id:uid(), sppdId:D.sppd[0].id, status:'selesai', hasil:'h', kes:'Kesimpulan lama', tgl:today(), foto:f}); save('rep');
    D.cfg.instansi = 'Instansi Uji Migrasi'; D.cfg.logo = f[0].replace('image/jpeg', 'image/jpeg'); save('cfg'); await flush(); }, f); };
(async () => {
  console.log('\n[1] Mode lokal: v1.1 (localStorage) → v1.2 (IndexedDB)');
  let srv = await serve(OLD, 8805, 'local'); let ctx = await open(prof('lokal')), p = ctx.pages()[0] || await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:8805/'); await p.waitForSelector('#a_n'); await p.fill('#a_n', 'Admin Lama'); await p.fill('#a_u', 'admin'); await p.fill('#a_p', PW); await p.fill('#a_p2', PW); await p.click('#a_b'); await p.waitForSelector('#app:not([hidden])');
  await seed(p); const lama = await isi(p), lsLama = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('sppd_x_')).sort().join(','));
  ok(lama.rep[0][1] === 2 && /sppd_x_rep/.test(lsLama), 'data dibuat di v1.1 (tersimpan di localStorage)', lsLama);
  srv.kill(); await sleep(400); srv = await serve(NEW, 8805, 'local');
  await p.goto('http://localhost:8805/'); await p.waitForSelector('#app:not([hidden]), #a_u'); if (await p.$('#a_u')) { await p.fill('#a_u', 'admin'); await p.fill('#a_p', PW); await p.click('#a_b'); await p.waitForSelector('#app:not([hidden])'); }
  await sleep(500); const baru = await isi(p), ls = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('sppd_x_')).sort().join(',')), idb = await p.evaluate(async () => (await LDB.all()).map(r => r[0].split(':')[0]).sort().join(',').replace(/(\w+)(,\1)+/g, (m, a) => a + '×' + m.split(',').length));
  ok(JSON.stringify(baru) === JSON.stringify(lama), 'dibuka dengan v1.2: semua data, foto, logo & urutan sama persis', JSON.stringify(baru).slice(0, 110));
  ok(ls === 'sppd_x_acl' && /ph×2/.test(idb) && /img/.test(idb), 'data pindah ke IndexedDB per baris; salinan localStorage dihapus', 'localStorage: ' + ls + ' · IndexedDB: ' + idb);
  await p.evaluate(() => Auth.logout()); await p.waitForSelector('#a_u'); await p.fill('#a_u', 'admin'); await p.fill('#a_p', PW); await p.click('#a_b'); await p.waitForSelector('#app:not([hidden])'); await sleep(400);
  ok(JSON.stringify(await isi(p)) === JSON.stringify(lama), 'keluar & masuk lagi di v1.2: data tetap utuh'); await ctx.close(); srv.kill();

  console.log('\n[2] Mode cloud: basis data & baris format v1.1 → v1.2');
  try { psql('postgres', ['-c', 'drop database if exists sppd_mig']); } catch {} psql('postgres', ['-c', 'create database sppd_mig']);
  psql('sppd_mig', ['-c', 'create schema if not exists extensions; grant usage on schema extensions to public; grant usage on schema public to anon, authenticated;']); psql('sppd_mig', ['-f', path.join(OLD, 'supabase/schema-sppd.sql')]);
  srv = await serve(OLD, 8806, 'cloud', {PGDATABASE:'sppd_mig', API:'1'}); ctx = await open(prof('cloud')); p = ctx.pages()[0] || await ctx.newPage(); p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:8806/'); await p.waitForSelector('#a_c'); await p.fill('#a_c', 'GANTI-DENGAN-KODE-SETUP-RAHASIA'); await p.fill('#a_n', 'Admin Lama'); await p.fill('#a_u', 'admin'); await p.fill('#a_p', PW); await p.fill('#a_p2', PW); await p.click('#a_b'); await p.waitForSelector('#app:not([hidden])', {timeout:30000});
  await seed(p); await until(p, () => Cloud.state === 'ok' && !Cloud.pending); const cl = await isi(p), rowsLama = psql('sppd_mig', ['-c', "select string_agg(split_part(k, ':', 1), ',' order by k) from sppd_rows where not del"]);
  ok(cl.rep[0][1] === 2 && !/ph/.test(rowsLama), 'data dibuat klien v1.1 di server berskema v1.1 (foto menyatu di baris laporan)', rowsLama);
  srv.kill(); await sleep(400); psql('sppd_mig', ['-f', path.join(NEW, 'supabase/schema-sppd.sql')]); ok(true, 'schema-sppd.sql v1.2 dijalankan di atas basis data lama tanpa error');
  srv = await serve(NEW, 8806, 'cloud', {PGDATABASE:'sppd_mig'});
  await p.goto('http://localhost:8806/'); await p.waitForSelector('#app:not([hidden]), #a_u', {timeout:30000}); if (await p.$('#a_u')) { await p.fill('#a_u', 'admin'); await p.fill('#a_p', PW); await p.click('#a_b'); await p.waitForSelector('#app:not([hidden])', {timeout:30000}); }
  await sleep(800); ok(JSON.stringify(await isi(p)) === JSON.stringify(cl), 'klien v1.2 membuka data lama: semua data, foto & logo utuh (akun & kata sandi lama tetap berlaku)');
  await p.evaluate(() => { D.sppd[0].tujuan = 'Diubah di v1.2'; save('sppd'); }); await until(p, () => Cloud.state === 'ok' && !Cloud.pending);
  ok(+psql('sppd_mig', ['-c', "select count(*) from sppd_rows where k like 'ph:%'"]) === 0, 'mengubah SPPD tidak memicu unggah ulang foto laporan lama');
  await p.evaluate(() => { D.rep[0].kes = 'Kesimpulan baru'; save('rep'); }); await until(p, () => Cloud.state === 'ok' && !Cloud.pending);
  ok(+psql('sppd_mig', ['-c', "select count(*) from sppd_rows where k like 'ph:%' and not del"]) === 2, 'laporan lama yang diubah otomatis dipindah ke format baru (2 baris foto terpisah)');
  const c2 = await chromium.launch({executablePath:process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox', '--no-proxy-server']}), q = await (await c2.newContext()).newPage();
  await q.goto('http://localhost:8806/'); await q.waitForSelector('#a_u'); await q.fill('#a_u', 'admin'); await q.fill('#a_p', PW); await q.click('#a_b'); await q.waitForSelector('#app:not([hidden])', {timeout:30000}); await sleep(500);
  const x = await isi(q); ok(x.rep[0][0] === 'Kesimpulan baru' && x.rep[0][1] === 2 && x.rep[0][2] && x.sppd.length === 2 && x.emp.join() === cl.emp.join() && x.logo === cl.logo, 'perangkat baru (tanpa cache) menerima data hasil migrasi dengan utuh', JSON.stringify(x.rep)); await c2.close(); await ctx.close();
  ok(!errs.length, 'tidak ada error halaman selama migrasi', errs.join(' | '));

  console.log('\n[3] SQL: push diserialkan (pull tidak bisa melewatkan baris)');
  /* tiga sesi berbeda (pemanggilan dengan token yang sama memang antre pada baris sesinya sendiri) */
  const [tA, tB, tC] = ['a', 'b', 'c'].map(c => c.repeat(64)); psql('sppd_mig', ['-c', `insert into sppd_sessions (th, uid, exp, idle) select sppd_h(repeat(c, 64)), (select id from sppd_users where role = 'admin' limit 1), now() + interval '1 hour', now() + interval '1 hour' from unnest(array['a','b','c']) c`]);
  const push = (tok, k) => `select (sppd_push('${tok}', '[{"k":"${k}","v":"x","b":0}]'::json, 2)->'vers'->>'${k}')`;
  const t1 = spawn('psql', ['-X', '-q', '-At', '-d', 'sppd_mig', '-c', `begin; ${push(tA, 'emp:lambat0001')}; select pg_sleep(2.5); commit;`]); let v1 = ''; t1.stdout.on('data', d => v1 += d);
  await sleep(700); const mx = +psql('sppd_mig', ['-c', 'select coalesce(max(ver), 0) from sppd_rows']), mid = psql('sppd_mig', ['-c', `select json_array_length(sppd_pull('${tC}', ${mx}, 500)->'rows')`]);
  const t0 = Date.now(), v2 = psql('sppd_mig', ['-c', push(tB, 'emp:cepat00002')]), ms = Date.now() - t0; await new Promise(r => t1.on('close', r));
  ok(ms > 1200 && +v2 > +v1.trim().split('\n')[0] && +mid === 0, 'push kedua (sesi lain) menunggu push pertama selesai; versi mengikuti urutan commit; pull di tengah tidak melihat baris setengah jadi', `menunggu ${ms} ms · versi ${v1.trim().split('\n')[0]} lalu ${v2}`);
  srv.kill(); try { psql('postgres', ['-c', 'drop database if exists sppd_mig']); } catch {}
  process.exit(done() ? 1 : 0);
})().catch(e => { console.error('UJI BERHENTI:', e); process.exit(2); });
