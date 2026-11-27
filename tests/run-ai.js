/* Uji api/ai.js TANPA browser/penyedia AI sungguhan: fetch & DNS ditiru.  Pakai: node tests/run-ai.js */
const path = require('path'), dnsP = require('dns').promises;
let pass = 0, fail = 0; const fails = [];
const ok = (c, n, i = '') => { c ? pass++ : (fail++, fails.push(n)); console.log((c ? '  LULUS  ' : '  GAGAL  ') + n + (i !== '' ? '  → ' + i : '')); return c; };
const handler = require(path.join(__dirname, '..', 'api', 'ai.js')), T = handler._t;
let CALLS = [], NEXT = null, DNSMAP = {};
global.fetch = async (url, o = {}) => {
  CALLS.push({url:String(url), h:o.headers || {}, b:o.body ? JSON.parse(o.body) : null});
  if (String(url).includes('/rest/v1/rpc/sppd_me')) { const t = JSON.parse(o.body).p_t; return {ok:true, json:async () => t === 'tok-admin' ? {ok:true, user:{role:'admin'}} : t === 'tok-op' ? {ok:true, user:{role:'operator'}} : {ok:false}}; }
  const r = typeof NEXT === 'function' ? NEXT(String(url), o) : NEXT; if (r instanceof Error) throw r;
  return {ok:r.ok !== false, status:r.status || 200, text:async () => typeof r.body === 'string' ? r.body : JSON.stringify(r.body)};
};
dnsP.lookup = async h => { if (h in DNSMAP) return DNSMAP[h]; throw new Error('ENOTFOUND'); };
const env = o => { for (const k of Object.keys(process.env)) if (/^AI_|^SUPABASE_/.test(k)) delete process.env[k]; Object.assign(process.env, o); };
let ipn = 10;
async function call(body, headers = {}, method = 'POST', ip) {
  const res = {h:{}, setHeader(k, v) { this.h[k] = v; }, end(b) { this.body = b; }};
  const hd = {'x-forwarded-for':ip || '9.9.9.' + (++ipn)}; for (const [k, v] of Object.entries(headers)) hd[k.toLowerCase()] = v;   // Node selalu mengecilkan nama header
  await handler({method, headers:hd, body, socket:{}}, res);
  return {code:res.statusCode, j:JSON.parse(res.body), h:res.h};
}
const gem = t => ({body:{candidates:[{content:{parts:[{text:t}]}}]}});
const ctx = {instansi:'Setda Sultra', maksud:'Koordinasi pembangunan', tujuan:'Wakatobi', asal:'Kendari', tb:'10 November 2026', tk:'12 November 2026', orang:2, hasil:'Pertemuan menyepakati percepatan penyerapan anggaran dan perbaikan pelaporan.'};
const M = {prov:'gemini', model:'gemini-2.5-flash', key:'AIzaSyKUNCI-RAHASIA-123456', base:'', temp:''};

(async () => {
  env({AI_ACCESS_CODE:'kode-x'});
  ok((await call({}, {}, 'GET')).code === 405, 'GET ditolak (405)');
  let r = await call({kind:'bagian', sec:'latar', ctx}); ok(r.code === 401 && r.j.needCode === true, 'tanpa otorisasi → 401 + needCode');
  r = await call({kind:'bagian', sec:'latar', ctx}, {'x-ai-code':'salah'}); ok(r.code === 401, 'kode akses salah → 401');

  /* ---- kind "bagian": Gemini dari panel admin ---- */
  NEXT = gem('**Latar Belakang**\n1. Paragraf satu yang rapi.\n\n- Paragraf dua yang rapi.\n'); CALLS = [];
  r = await call({kind:'bagian', sec:'latar', prompt:'Tekankan koordinasi', ctx, model:M}, {'x-ai-code':'kode-x'});
  ok(r.code === 200 && r.j.ok && r.j.text === 'Latar Belakang\nParagraf satu yang rapi.\nParagraf dua yang rapi.', 'bagian: hasil dirapikan (markdown, nomor, butir dibuang)', JSON.stringify(r.j));
  const c0 = CALLS[0]; ok(/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-2\.5-flash:generateContent$/.test(c0.url) && c0.h['x-goog-api-key'] === M.key, 'bagian: memakai kunci & model dari panel admin');
  ok(c0.b.generationConfig.temperature === undefined && c0.b.generationConfig.responseMimeType === undefined, 'bagian: tanpa temperature (bawaan penyedia) & tanpa mode JSON');
  ok(c0.b.contents[0].parts[0].text.includes('Arahan dari pengguna: Tekankan koordinasi') && !/\b(Budi|NIP)\b/.test(JSON.stringify(c0.b)), 'bagian: arahan pengguna masuk ke prompt; tidak ada data pegawai');
  ok(c0.b.systemInstruction.parts[0].text.includes('Latar Belakang') && c0.b.systemInstruction.parts[0].text.includes('jangan mengarang') === false && /Jangan mengarang/.test(c0.b.systemInstruction.parts[0].text), 'bagian: aturan anti-karang ada di system prompt');

  /* ---- Kesimpulan: butir tanpa nomor; Kegiatan: pertahankan "- " rincian ---- */
  NEXT = gem('1. Butir satu\n2) Butir dua\n• Butir tiga'); r = await call({kind:'bagian', sec:'kes', prompt:'', ctx, model:M}, {'x-ai-code':'kode-x'});
  ok(r.j.text === 'Butir satu\nButir dua\nButir tiga', 'kesimpulan: nomor/butir dibuang agar tidak ganda dengan tampilan laporan', r.j.text);
  NEXT = gem('1. Berangkat ke lokasi\n- rincian satu\n2. Rapat koordinasi'); r = await call({kind:'bagian', sec:'keg', prompt:'rapat', ctx, model:M}, {'x-ai-code':'kode-x'});
  ok(r.j.text === 'Berangkat ke lokasi\n- rincian satu\nRapat koordinasi', 'kegiatan: nomor dibuang, rincian "- " dipertahankan', r.j.text);

  /* ---- Dasar Hukum ---- */
  CALLS = []; NEXT = gem('Undang-Undang Nomor 23 Tahun 2014 tentang Pemerintahan Daerah\nPeraturan Menteri Dalam Negeri Nomor 77 Tahun 2020'); r = await call({kind:'bagian', sec:'dasar', prompt:'UU 23/2014 dan Permendagri 77/2020', ctx, model:M}, {'x-ai-code':'kode-x'});
  ok(r.code === 200 && r.j.text.split('\n').length === 2, 'dasar hukum: dapat dibuat dari prompt');
  const sysD = CALLS[0].b.systemInstruction.parts[0].text; ok(/JANGAN menulis Surat Tugas dan SPPD/.test(sysD) && /jangan pernah mengarang nomor/i.test(sysD), 'dasar hukum: dilarang mengarang peraturan & tidak menduplikasi Surat Tugas/SPPD');

  /* ---- revisi ---- */
  CALLS = []; NEXT = gem('Teks revisi.'); r = await call({kind:'bagian', sec:'mt', mode:'revisi', cur:'Teks lama yang panjang sekali.', prompt:'persingkat', ctx, model:M}, {'x-ai-code':'kode-x'});
  ok(r.code === 200 && CALLS[0].b.contents[0].parts[0].text.includes('Teks lama yang panjang sekali.') && /REVISI/.test(CALLS[0].b.contents[0].parts[0].text), 'revisi: teks lama ikut dikirim & diminta direvisi');
  r = await call({kind:'bagian', sec:'mt', mode:'revisi', cur:'', prompt:'x', ctx, model:M}, {'x-ai-code':'kode-x'}); ok(r.code === 400, 'revisi tanpa teks → 400');

  /* ---- bagian yang butuh fakta ---- */
  r = await call({kind:'bagian', sec:'kes', prompt:'', ctx:{...ctx, hasil:'', keg:''}, model:M}, {'x-ai-code':'kode-x'}); ok(r.code === 400 && /Kesimpulan/.test(r.j.error), 'kesimpulan tanpa hasil/kegiatan/arahan → ditolak (cegah karangan)');
  r = await call({kind:'bagian', sec:'__proto__', ctx, model:M}, {'x-ai-code':'kode-x'}); ok(r.code === 400, 'nama bagian tidak dikenal (termasuk __proto__) → 400');

  /* ---- Anthropic, OpenAI-compatible, temperature ---- */
  CALLS = []; NEXT = {body:{content:[{type:'text', text:'Jawaban Claude.'}]}}; r = await call({kind:'bagian', sec:'penutup', ctx, model:{prov:'anthropic', model:'claude-haiku-5-5', key:'sk-ant-abcdefghijk', temp:0.2}}, {'x-ai-code':'kode-x'});
  ok(r.j.text === 'Jawaban Claude.' && CALLS[0].url === 'https://api.anthropic.com/v1/messages' && CALLS[0].h['x-api-key'] === 'sk-ant-abcdefghijk' && CALLS[0].b.max_tokens > 0 && CALLS[0].b.temperature === 0.2, 'anthropic: endpoint, kunci, max_tokens & temperature');
  CALLS = []; NEXT = {body:{choices:[{message:{content:'Jawaban GPT.'}}]}}; r = await call({kind:'bagian', sec:'penutup', ctx, model:{prov:'openai', model:'gpt-4o-mini', key:'sk-proj-abcdefghijk'}}, {'x-ai-code':'kode-x'});
  ok(r.j.text === 'Jawaban GPT.' && CALLS[0].url === 'https://api.openai.com/v1/chat/completions' && CALLS[0].h.Authorization === 'Bearer sk-proj-abcdefghijk' && CALLS[0].b.temperature === undefined && CALLS[0].b.max_tokens === undefined, 'openai: endpoint & kunci; tanpa temperature/max_tokens (kompatibel model baru)');
  CALLS = []; NEXT = {body:{choices:[{message:{content:[{type:'text', text:'Bagian A. '}, {type:'text', text:'Bagian B.'}]}}]}}; r = await call({kind:'bagian', sec:'penutup', ctx, model:{prov:'openrouter', model:'google/gemini-2.5-flash', key:'sk-or-abcdefghijk'}}, {'x-ai-code':'kode-x'});
  ok(r.j.text === 'Bagian A. Bagian B.' && CALLS[0].url === 'https://openrouter.ai/api/v1/chat/completions', 'openrouter: konten berupa larik bagian digabung');

  /* ---- Base URL kustom & SSRF ---- */
  DNSMAP['llm.contoh.go.id'] = [{address:'203.0.113.7'}]; DNSMAP['dalam.contoh.id'] = [{address:'10.1.2.3'}]; DNSMAP['mix.contoh.id'] = [{address:'8.8.8.8'}, {address:'127.0.0.1'}];
  CALLS = []; NEXT = {body:{choices:[{message:{content:'OK kustom.'}}]}}; r = await call({kind:'bagian', sec:'penutup', ctx, model:{prov:'custom', model:'qwen-2.5', key:'abc123', base:'https://llm.contoh.go.id/v1/'}}, {'x-ai-code':'kode-x'});
  ok(r.code === 200 && CALLS[0].url === 'https://llm.contoh.go.id/v1/chat/completions', 'kustom: Base URL https domain publik diterima (garis miring akhir dibuang)', CALLS[0]?.url);
  for (const [base, nama] of [['http://llm.contoh.go.id/v1', 'http (bukan https)'], ['https://127.0.0.1/v1', 'IP loopback'], ['https://169.254.169.254/latest', 'IP metadata cloud'], ['https://[::1]/v1', 'IPv6 loopback'], ['https://localhost/v1', 'localhost'], ['https://intranet/v1', 'nama tanpa titik'], ['https://dalam.contoh.id/v1', 'domain mengarah ke IP privat'], ['https://mix.contoh.id/v1', 'domain dengan satu IP privat'], ['https://user:pw@llm.contoh.go.id/v1', 'berisi kredensial'], ['https://llm.contoh.go.id:8080/v1', 'port tak lazim'], ['https://tidak-ada.contoh.id/v1', 'domain tak ter-resolve']]) {
    CALLS = []; r = await call({kind:'bagian', sec:'penutup', ctx, model:{prov:'custom', model:'m', key:'k', base}}, {'x-ai-code':'kode-x'}); ok(r.code === 400 && CALLS.length === 0, 'SSRF: ditolak — ' + nama, r.j.error);
  }
  ok(T.safeBase('https://api.contoh.com/v1?x=1') === '' && T.safeBase('https://api.contoh.com/v1') === 'https://api.contoh.com/v1', 'safeBase: query ditolak, jalur biasa diterima');
  ok(['10.0.0.1', '172.16.5.5', '172.31.255.1', '192.168.1.1', '127.0.0.1', '169.254.1.1', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1'].every(T.priv) && !['8.8.8.8', '172.32.0.1', '203.0.113.7', '2001:db8::1'].some(T.priv), 'priv(): rentang IP privat dikenali, IP publik lolos');
  r = await call({kind:'bagian', sec:'penutup', ctx, model:{prov:'custom', model:'m', key:'k', base:''}}, {'x-ai-code':'kode-x'}); ok(r.code === 400 && /Base URL/.test(r.j.error), 'kustom tanpa Base URL → pesan jelas');
  r = await call({kind:'bagian', sec:'penutup', ctx, model:{prov:'xxx', model:'m', key:'k'}}, {'x-ai-code':'kode-x'}); ok(r.code === 400, 'penyedia tak dikenal → 400');
  r = await call({kind:'bagian', sec:'penutup', ctx, model:{prov:'gemini', model:'m m;rm -rf', key:'k'}}, {'x-ai-code':'kode-x'}); ok(r.code === 400, 'ID model berisi karakter aneh → 400');

  /* ---- Kunci: cadangan server, kosong, tidak bocor ---- */
  env({AI_ACCESS_CODE:'kode-x'}); r = await call({kind:'bagian', sec:'penutup', ctx, model:{prov:'gemini', model:'gemini-2.5-flash', key:''}}, {'x-ai-code':'kode-x'}); ok(r.code === 503 && /Kunci API/.test(r.j.error), 'model tanpa kunci & tanpa cadangan server → 503 dengan petunjuk');
  env({AI_ACCESS_CODE:'kode-x', AI_API_KEY_ANTHROPIC:'sk-ant-server-key-123'}); CALLS = []; NEXT = {body:{content:[{type:'text', text:'x'}]}}; r = await call({kind:'bagian', sec:'penutup', ctx, model:{prov:'anthropic', model:'claude-haiku-5-5', key:''}}, {'x-ai-code':'kode-x'});
  ok(r.code === 200 && CALLS[0].h['x-api-key'] === 'sk-ant-server-key-123', 'model tanpa kunci memakai AI_API_KEY_<PENYEDIA> dari server');
  env({AI_ACCESS_CODE:'kode-x', AI_API_KEY:'kunci-umum', AI_PROVIDER:'groq'}); CALLS = []; NEXT = {body:{choices:[{message:{content:'g'}}]}}; r = await call({kind:'bagian', sec:'penutup', ctx, model:{prov:'groq', model:'llama-3.3-70b-versatile', key:''}}, {'x-ai-code':'kode-x'});
  ok(r.code === 200 && CALLS[0].h.Authorization === 'Bearer kunci-umum', 'AI_API_KEY dipakai hanya untuk penyedia AI_PROVIDER');
  r = await call({kind:'bagian', sec:'penutup', ctx, model:{prov:'openai', model:'gpt-4o-mini', key:''}}, {'x-ai-code':'kode-x'}); ok(r.code === 503, 'AI_API_KEY TIDAK dipakai untuk penyedia lain (cegah kunci terkirim ke pihak salah)');
  env({AI_ACCESS_CODE:'kode-x', AI_API_KEY:'kunci-env', AI_PROVIDER:'anthropic', AI_MODEL:'claude-sonnet-5-5'}); CALLS = []; NEXT = {body:{content:[{type:'text', text:'Dari env.'}]}}; r = await call({kind:'bagian', sec:'penutup', ctx}, {'x-ai-code':'kode-x'});
  ok(r.code === 200 && CALLS[0].b.model === 'claude-sonnet-5-5' && CALLS[0].h['x-api-key'] === 'kunci-env', 'tanpa model dari panel admin → konfigurasi variabel lingkungan tetap berfungsi (kompatibel v1.2.7)');
  env({AI_ACCESS_CODE:'kode-x'}); r = await call({kind:'bagian', sec:'penutup', ctx}, {'x-ai-code':'kode-x'}); ok(r.code === 503 && /Pengaturan → Model AI/.test(r.j.error), 'tanpa konfigurasi apa pun → pesan mengarahkan ke Pengaturan → Model AI');
  NEXT = {ok:false, status:401, body:{error:{message:'Incorrect API key provided: ' + M.key + ' sk-proj-abcdefghijklmnop'}}}; r = await call({kind:'bagian', sec:'penutup', ctx, model:M}, {'x-ai-code':'kode-x'});
  ok(r.code === 502 && !JSON.stringify(r.j).includes(M.key) && !/sk-proj-abcdef/.test(r.j.error) && /periksa kunci API/.test(r.j.error), 'galat penyedia: kunci disamarkan & ada petunjuk memeriksa kunci', r.j.error);
  NEXT = new Error('boom'); r = await call({kind:'bagian', sec:'penutup', ctx, model:M}, {'x-ai-code':'kode-x'}); ok(r.code === 502 && /Tidak dapat menghubungi/.test(r.j.error), 'jaringan gagal → 502 pesan jelas');
  const te = new Error('t'); te.name = 'TimeoutError'; te.code = 23; NEXT = te; r = await call({kind:'bagian', sec:'penutup', ctx, model:M}, {'x-ai-code':'kode-x'}); ok(r.code === 504, 'timeout → 504 (bukan galat status tak valid)');
  NEXT = {body:{promptFeedback:{blockReason:'SAFETY'}}}; r = await call({kind:'bagian', sec:'penutup', ctx, model:M}, {'x-ai-code':'kode-x'}); ok(r.code === 502 && /diblokir/.test(r.j.error), 'Gemini memblokir → pesan jelas');
  NEXT = gem('   '); r = await call({kind:'bagian', sec:'penutup', ctx, model:M}, {'x-ai-code':'kode-x'}); ok(r.code === 502, 'jawaban kosong → galat (bukan teks kosong)');

  /* ---- kind "laporan" (semua bagian) ---- */
  CALLS = []; NEXT = gem('```json\n{"latar":"L1\\nL2","mt":"MT","keg":["K1","K2"],"kes":"1. S1\\n2. S2","tl":"T1","penutup":"P"}\n```');
  r = await call({kind:'laporan', ctx:{...ctx, hints:{latar:'fokus anggaran', xx:'abaikan'}}, model:M}, {'x-ai-code':'kode-x'});
  ok(r.code === 200 && r.j.data.latar === 'L1\nL2' && r.j.data.keg === 'K1\nK2' && r.j.data.kes === 'S1\nS2' && r.j.data.dasar === undefined, 'semua bagian: JSON berpagar kode dibaca, larik digabung, Dasar Hukum tidak dibuat otomatis', JSON.stringify(r.j));
  ok(CALLS[0].b.generationConfig.responseMimeType === 'application/json' && CALLS[0].b.contents[0].parts[0].text.includes('Latar Belakang: fokus anggaran') && !CALLS[0].b.contents[0].parts[0].text.includes('abaikan'), 'semua bagian: arahan per bagian ikut dikirim (hanya bagian yang valid)');
  r = await call({kind:'laporan', ctx:{...ctx, hasil:'pendek'}, model:M}, {'x-ai-code':'kode-x'}); ok(r.code === 400, 'semua bagian: hasil terlalu pendek → 400 (perilaku v1.2.7 tetap)');
  NEXT = gem('bukan json sama sekali'); r = await call({kind:'laporan', ctx, model:M}, {'x-ai-code':'kode-x'}); ok(r.code === 502 && /tidak dapat dibaca/.test(r.j.error), 'semua bagian: JSON rusak → pesan "tidak dapat dibaca"');

  /* ---- kind "tes" & peran ---- */
  env({SUPABASE_URL:'https://abcd.supabase.co', SUPABASE_ANON_KEY:'anon'}); NEXT = gem('OK');
  r = await call({kind:'tes', model:M}, {Authorization:'Bearer tok-op'}); ok(r.code === 403, 'uji koneksi: operator ditolak (hanya Administrator)');
  r = await call({kind:'tes', model:M}, {Authorization:'Bearer tok-admin'}); ok(r.code === 200 && r.j.ok && r.j.sample === 'OK' && r.j.model === 'gemini-2.5-flash' && typeof r.j.ms === 'number', 'uji koneksi: Administrator berhasil', JSON.stringify(r.j));
  r = await call({kind:'bagian', sec:'penutup', ctx, model:M}, {Authorization:'Bearer tok-op'}); ok(r.code === 200, 'operator boleh membuat bagian laporan');
  r = await call({kind:'bagian', sec:'penutup', ctx, model:M}, {Authorization:'Bearer tok-lain'}); ok(r.code === 401, 'token tidak dikenal → 401');
  NEXT = {body:{candidates:[{content:{parts:[{text:''}]}}]}}; r = await call({kind:'tes', model:M}, {Authorization:'Bearer tok-admin'}); ok(r.code === 200 && r.j.ok, 'uji koneksi: balasan kosong tetap dianggap terhubung (model berpikir)');

  /* ---- pembatas laju ---- */
  env({AI_ACCESS_CODE:'kode-x'}); NEXT = gem('x'); let last; for (let i = 0; i < 41; i++) last = await call({kind:'bagian', sec:'penutup', ctx, model:M}, {'x-ai-code':'kode-x'}, 'POST', '7.7.7.7'); ok(last.code === 429, 'pembatas laju: permintaan ke-41 dalam 10 menit → 429');
  r = await call(null, {'x-ai-code':'kode-x'}); ok(r.code === 400, 'badan permintaan kosong → 400');
  r = await call('{"kind":"bagian","sec":"penutup","ctx":{"hasil":"x"},"model":{"prov":"gemini","model":"gemini-2.5-flash","key":"k"}}', {'x-ai-code':'kode-x'}); ok(r.code === 200, 'badan permintaan berupa string JSON dibaca juga');

  console.log(`\nHASIL: ${pass} lulus, ${fail} gagal` + (fail ? '\nGAGAL: ' + fails.join(' | ') : '')); process.exit(fail ? 1 : 0);
})();
