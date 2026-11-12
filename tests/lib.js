/* Alat bantu skenario uji (Playwright). NODE_PATH harus memuat modul 'playwright'; CHROME = jalur Chrome/Chromium. */
const {chromium} = require('playwright');
const PW = 'UjiCoba-Sandi-2026x';
let pass = 0, fail = 0; const fails = [];
const ok = (cond, name, info = '') => { cond ? pass++ : (fail++, fails.push(name)); console.log((cond ? '  LULUS  ' : '  GAGAL  ') + name + (info !== '' ? '  → ' + info : '')); return cond; };
const launch = () => chromium.launch({executablePath:process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox', '--no-proxy-server']});
async function page(ctx) { const p = await ctx.newPage(); p.errs = []; p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) p.errs.push(m.text().slice(0, 300)); }); p.on('pageerror', e => p.errs.push('pageerror: ' + String(e.stack || e).slice(0, 300))); return p; }
const toasts = p => p.$$eval('#toast .tst', a => a.map(x => x.textContent));
async function setup(p, url, code) { await p.goto(url); await p.waitForSelector('#a_n'); if (code) await p.fill('#a_c', code); await p.fill('#a_n', 'Admin Uji'); await p.fill('#a_u', 'admin'); await p.fill('#a_p', PW); await p.fill('#a_p2', PW); await p.click('#a_b'); await p.waitForSelector('#app:not([hidden])', {timeout:30000}); }
async function login(p, u = 'admin', pw = PW) { await p.waitForSelector('#a_u'); await p.fill('#a_u', u); await p.fill('#a_p', pw); await p.click('#a_b'); await p.waitForSelector('#app:not([hidden])', {timeout:30000}); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* tunggu sampai fungsi di halaman bernilai benar */
async function until(p, fn, arg, ms = 25000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await sleep(400); } return false; }
const done = () => { console.log(`\nHASIL: ${pass} lulus, ${fail} gagal` + (fail ? '\nGAGAL: ' + fails.join(' | ') : '')); return fail; };
/* foto sintetis mirip foto kamera (3000×2000) dibuat di halaman lalu diproses lewat jalur unggah aplikasi */
const mkFotos = (p, idx, n = 6) => p.evaluate(async ([idx, n]) => {
  const mk = async seed => { const c = document.createElement('canvas'); c.width = 3000; c.height = 2000; const g = c.getContext('2d'); let r = seed * 9301 + 49297; const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
    const gr = g.createLinearGradient(0, 0, 3000, 2000); gr.addColorStop(0, `hsl(${rnd() * 360},50%,60%)`); gr.addColorStop(1, `hsl(${rnd() * 360},40%,30%)`); g.fillStyle = gr; g.fillRect(0, 0, 3000, 2000);
    for (let i = 0; i < 900; i++) { g.fillStyle = `hsla(${rnd() * 360},${30 + rnd() * 50}%,${20 + rnd() * 60}%,${.3 + rnd() * .6})`; g.beginPath(); g.ellipse(rnd() * 3000, rnd() * 2000, 10 + rnd() * 160, 10 + rnd() * 120, rnd() * 3, 0, 6.3); g.fill(); }
    const im = g.getImageData(0, 0, 3000, 2000), d = im.data; for (let i = 0; i < d.length; i += 4) { const z = (rnd() - .5) * 28; d[i] += z; d[i + 1] += z; d[i + 2] += z; } g.putImageData(im, 0, 0);
    return new File([await new Promise(k => c.toBlob(k, 'image/jpeg', .92))], 'f.jpg', {type:'image/jpeg'}); };
  const out = []; for (let i = 0; i < n; i++) out.push(await reencode(await mk(idx * 10 + i + 1), 1000, 'image/jpeg', .72, 15e6)); return out;
}, [idx, n]);
module.exports = {PW, ok, launch, page, toasts, setup, login, sleep, until, done, mkFotos};
