/* Server uji lokal SIM-SPPD.
   - Menyajikan aplikasi dengan header keamanan yang sama seperti vercel.json (CSP dsb.).
   - Mode "cloud": /rest/v1/rpc/* diteruskan ke PostgreSQL ASLI (lewat psql, sebagai role anon) — jadi yang
     diuji adalah supabase/schema-sppd.sql yang sebenarnya, bukan tiruan.
   Pakai:  node tests/server.js <port> <local|cloud>
   Env  :  PGHOST PGPORT PGUSER PGDATABASE (basis data uji yang sudah dimuati schema-sppd.sql) */
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), {execFile} = require('child_process');
const root = path.resolve(process.env.ROOT || path.join(__dirname, '..')), port = +process.argv[2] || 8801, mode = process.argv[3] || 'local';
const vj = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const H = {}; vj.headers[0].headers.forEach(h => H[h.key] = h.value);
H['Content-Security-Policy'] = H['Content-Security-Policy'].replace('; upgrade-insecure-requests', '');   // hanya untuk http://localhost
delete H['Strict-Transport-Security'];
const MIME = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2', '.json':'application/json'};
/* tanda tangan fungsi RPC (nama parameter → tipe), meniru pencocokan PostgREST */
const SIG = {sppd_status:{}, sppd_salt:{p_u:'text'}, sppd_setup:{p_code:'text', p_user:'json'}, sppd_login:{p_u:'text', p_ah:'text'}, sppd_logout:{p_t:'text'}, sppd_me:{p_t:'text'},
  sppd_pull:{p_t:'text', p_since:'bigint', p_lim:'int'}, sppd_get:{p_t:'text', p_keys:'json'}, sppd_push:{p_t:'text', p_rows:'json', p_api:'int'},
  sppd_no_claim:{p_t:'text', p_new:'text', p_old:'text'}, sppd_no_reset:{p_t:'text', p_h:'json'}, sppd_audit_list:{p_t:'text', p_lim:'int'},
  sppd_user_list:{p_t:'text'}, sppd_user_put:{p_t:'text', p:'json'}, sppd_user_del:{p_t:'text', p_id:'text'}, sppd_pw:{p_t:'text', p_old:'text', p:'json'}};
if (process.env.API === '1') { SIG.sppd_pull = {p_t:'text', p_since:'bigint'}; SIG.sppd_push = {p_t:'text', p_rows:'json'}; }     // tanda tangan fungsi v1.1 (uji migrasi)
const S = {fail:false, calls:{}, slow:0};
let seq = 0;
const psql = (script, cb) => execFile('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '-'], {maxBuffer:256e6}, cb).stdin.end(script);
function rpc(fn, body, ip, cb) {
  const sig = SIG[fn], keys = Object.keys(body);
  if (!sig || keys.length !== Object.keys(sig).length || keys.some(k => !(k in sig))) return cb(404, {code:'PGRST202', message:`Could not find the function public.${fn}(${keys.join(', ')}) in the schema cache`});
  const f = path.join(os.tmpdir(), `sppd-rpc-${process.pid}-${++seq}.json`); fs.writeFileSync(f, JSON.stringify(body));
  const args = Object.entries(sig).map(([k, t]) => `${k} => ` + (t === 'json' ? `(:'j'::json)->'${k}'` : t === 'text' ? `(:'j'::json)->>'${k}'` : `((:'j'::json)->>'${k}')::${t}`)).join(', ');
  const script = `\\set j \`cat ${f}\`\n\\set h '{"x-forwarded-for":"${ip}"}'\nbegin;\n\\o /dev/null\nselect set_config('request.headers', :'h', true);\n\\o\nset local role anon;\nselect public.${fn}(${args});\ncommit;\n`;
  psql(script, (err, out, se) => {
    fs.unlink(f, () => {});
    if (err) { const m = /ERROR:\s+(.*)/.exec(se || ''); return cb(400, {message:m ? m[1].trim() : String(se || err).slice(0, 300)}); }
    cb(200, out.trim() || 'null');
  });
}
http.createServer((q, s) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/__ctl') {          // kendali uji: ?fail=1|0 (putus koneksi) · ?slow=ms · ?sql=... (dijalankan sebagai pemilik basis data)
    if (u.searchParams.has('fail')) S.fail = u.searchParams.get('fail') === '1';
    if (u.searchParams.has('slow')) S.slow = +u.searchParams.get('slow') || 0;
    const sql = u.searchParams.get('sql');
    const done = out => { s.writeHead(200, {'Content-Type':'application/json'}); s.end(JSON.stringify({fail:S.fail, calls:S.calls, out})); };
    return sql ? psql(sql + '\n', (e, out, se) => done(e ? 'ERR ' + se : out.trim())) : done('');
  }
  if (u.pathname.startsWith('/rest/v1/rpc/')) {
    if (mode !== 'cloud') { s.writeHead(404); return s.end(); }
    if (S.fail) return q.socket.destroy();
    let b = ''; q.on('data', d => b += d); q.on('end', () => {
      const fn = u.pathname.split('/').pop(); S.calls[fn] = (S.calls[fn] || 0) + 1; let body = {}; try { body = b ? JSON.parse(b) : {}; } catch {}
      setTimeout(() => rpc(fn, body, String(q.headers['x-test-ip'] || '10.0.0.1').replace(/[^0-9a-f.:]/gi, ''), (code, out) => { s.writeHead(code, {'Content-Type':'application/json'}); s.end(typeof out === 'string' ? out : JSON.stringify(out)); }), S.slow);
    });
    return;
  }
  const p = u.pathname === '/' ? '/index.html' : u.pathname;
  if (mode === 'cloud' && p === '/js/config.js') { const t = fs.readFileSync(path.join(root, p), 'utf8').replace(/const SYNC = \{[\s\S]*?\};/, `const SYNC = {url:'http://localhost:${port}', anonKey:'${'k'.repeat(40)}', dev:true};`); s.writeHead(200, {...H, 'Content-Type':'text/javascript', 'Cache-Control':'no-store'}); return s.end(t); }
  const f = path.join(root, path.normalize(p));
  if (!f.startsWith(root) || f.startsWith(__dirname) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404, H); return s.end('nf'); }
  s.writeHead(200, {...H, 'Content-Type':MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control':'no-store'}); fs.createReadStream(f).pipe(s);
}).listen(port, () => console.log('SIM-SPPD uji:', mode, 'http://localhost:' + port));
