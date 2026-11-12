/* ============================================================
   EFEK LATAR INTERAKTIF (kanvas). Mengikuti kursor/sentuhan, ledakan cahaya saat ketuk,
   parallax gambar latar. Otomatis berhenti saat tab tidak terlihat & menghormati
   pengaturan "kurangi animasi" perangkat.
   Efek: constellation | waves | bokeh | stars | aurora | none
   ============================================================ */
const FX = (() => {
  const c = $('#fx'), x = c.getContext('2d'), bgi = $('#bgimg');
  let W = 0, H = 0, dpr = 1, raf = 0, mode = 'none', pow = 60, P = [], B = [], t = 0, C = [[20,184,166],[99,102,241]];
  const m = {x:-1e4, y:-1e4, tx:.5, ty:.5, px:.5, py:.5};
  const RM = matchMedia('(prefers-reduced-motion:reduce)');
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const rgba = (a, o) => `rgba(${a[0]},${a[1]},${a[2]},${o})`;
  const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const R = (a, b) => a + Math.random() * (b - a);
  const small = () => W < 700;
  const INK = () => document.documentElement.dataset.mode === 'light' ? '15,23,42' : '255,255,255';
  const N = base => Math.round(base * (pow / 60) * (small() ? .55 : 1));

  function init() {
    P = [];
    const area = W * H;
    if (mode === 'constellation') P = Array.from({length:Math.min(140, N(area / 15000))}, () => ({x:R(0, W), y:R(0, H), vx:R(-.35, .35), vy:R(-.35, .35), r:R(1, 2.4), k:Math.random()}));
    if (mode === 'bokeh') P = Array.from({length:Math.min(46, N(28))}, () => ({x:R(0, W), y:R(0, H), r:R(20, small() ? 70 : 120), v:R(.08, .35), k:Math.random(), ph:R(0, 6.28), z:R(.2, 1)}));
    if (mode === 'stars') P = Array.from({length:Math.min(420, N(area / 5000))}, () => ({x:R(0, W), y:R(0, H), z:R(.15, 1), ph:R(0, 6.28)}));
    if (mode === 'aurora') P = Array.from({length:5}, (_, i) => ({ph:R(0, 6.28), sp:R(.0006, .0014), k:i / 4, r:R(.35, .6)}));
  }
  function size() {
    dpr = Math.min(devicePixelRatio || 1, small() ? 1.25 : 1.5); W = innerWidth; H = innerHeight;
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); x.setTransform(dpr, 0, 0, dpr, 0, 0); init();
  }
  const draw = {
    constellation() {
      const L = small() ? 95 : 125;
      for (let i = 0; i < P.length; i++) {
        const p = P[i]; p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1;
        const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy) || 1;
        if (d < 150) { p.x += dx / d * 1.3; p.y += dy / d * 1.3;
          x.strokeStyle = rgba(mix(C[0], C[1], p.k), .35 * (1 - d / 150)); x.lineWidth = 1; x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(m.x, m.y); x.stroke(); }
        x.fillStyle = rgba(mix(C[0], C[1], p.k), .85); x.beginPath(); x.arc(p.x, p.y, p.r, 0, 6.283); x.fill();
        for (let j = i + 1; j < P.length; j++) { const q = P[j], e = Math.hypot(p.x - q.x, p.y - q.y); if (e < L) { x.strokeStyle = `rgba(${INK()},${.16 * (1 - e / L)})`; x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(q.x, q.y); x.stroke(); } }
      }
    },
    waves() {
      const n = Math.max(3, Math.round(6 * pow / 60)), amp = 26 + (1 - m.py) * 40;
      for (let i = 0; i < n; i++) {
        const k = i / (n - 1 || 1), y0 = H * (.35 + k * .5), col = mix(C[0], C[1], k);
        x.beginPath(); x.lineWidth = 1.6; x.strokeStyle = rgba(col, .25 + .25 * (1 - k));
        for (let px = -10; px <= W + 10; px += 12) {
          const dx = px - m.x, near = Math.exp(-(dx * dx) / 22000) * (m.y > -1 ? 30 : 0);
          const y = y0 + Math.sin(px * .006 + t * .0012 * (1 + k) + i) * amp * (.6 + k * .6) + Math.sin(px * .013 - t * .0009) * 10 - near * Math.sign(y0 - m.y || 1);
          px < 0 ? x.moveTo(px, y) : x.lineTo(px, y);
        }
        x.stroke();
      }
    },
    bokeh() {
      x.globalCompositeOperation = 'lighter';
      for (const p of P) {
        p.y -= p.v; p.x += Math.sin(t * .0006 + p.ph) * .25; if (p.y < -p.r) { p.y = H + p.r; p.x = R(0, W); }
        const ox = (m.px - .5) * 40 * p.z, oy = (m.py - .5) * 40 * p.z, cx = p.x + ox, cy = p.y + oy;
        const a = .12 + .1 * Math.sin(t * .001 + p.ph), g = x.createRadialGradient(cx, cy, 0, cx, cy, p.r), col = mix(C[0], C[1], p.k);
        g.addColorStop(0, rgba(col, a)); g.addColorStop(.6, rgba(col, a * .35)); g.addColorStop(1, rgba(col, 0));
        x.fillStyle = g; x.beginPath(); x.arc(cx, cy, p.r, 0, 6.283); x.fill();
      }
      x.globalCompositeOperation = 'source-over';
    },
    stars() {
      const ox = (m.px - .5), oy = (m.py - .5);
      for (const p of P) {
        p.x -= .05 * p.z; if (p.x < 0) p.x = W;
        const a = .35 + .65 * Math.abs(Math.sin(t * .0015 * p.z + p.ph));
        x.fillStyle = p.z > .8 ? rgba(mix(C[0], [255, 255, 255], .5), a) : `rgba(${INK()},${a * p.z})`;
        x.fillRect(p.x - ox * 60 * p.z, p.y - oy * 60 * p.z, p.z * 2, p.z * 2);
      }
      if (Math.random() < .004 * pow / 60) B.push({x:R(0, W), y:R(0, H * .5), vx:R(6, 10), vy:R(2, 4), life:1, star:1});
    },
    aurora() {
      x.globalCompositeOperation = 'lighter';
      for (const p of P) {
        const cx = W * (.2 + .6 * (.5 + .5 * Math.sin(t * p.sp + p.ph))) + (m.px - .5) * 120, cy = H * (.3 + .4 * (.5 + .5 * Math.cos(t * p.sp * 1.3 + p.ph))) + (m.py - .5) * 80;
        const r = Math.max(W, H) * p.r, g = x.createRadialGradient(cx, cy, 0, cx, cy, r), col = mix(C[0], C[1], p.k);
        g.addColorStop(0, rgba(col, .22 * pow / 60)); g.addColorStop(1, rgba(col, 0)); x.fillStyle = g; x.fillRect(0, 0, W, H);
      }
      x.globalCompositeOperation = 'source-over';
    }
  };
  function bursts() {
    for (let i = B.length - 1; i >= 0; i--) {
      const q = B[i];
      if (q.star) { x.strokeStyle = `rgba(${INK()},${q.life})`; x.lineWidth = 1.5; x.beginPath(); x.moveTo(q.x, q.y); x.lineTo(q.x - q.vx * 8, q.y - q.vy * 8); x.stroke(); q.x += q.vx; q.y += q.vy; q.life -= .02; }
      else if (q.ring) { x.strokeStyle = rgba(C[q.c], q.life * .6); x.lineWidth = 2; x.beginPath(); x.arc(q.x, q.y, (1 - q.life) * 120, 0, 6.283); x.stroke(); q.life -= .025; }
      else { x.fillStyle = rgba(C[q.c], q.life); x.beginPath(); x.arc(q.x, q.y, 2.2 * q.life + .4, 0, 6.283); x.fill(); q.x += q.vx; q.y += q.vy; q.vy += .05; q.vx *= .98; q.life -= .018; }
      if (q.life <= 0) B.splice(i, 1);
    }
  }
  /* v1.2: dibatasi ±30 fps, dijeda selagi dialog terbuka, dan dimatikan otomatis (gambar diam) bila perangkat
     terbukti tidak sanggup — keputusan itu diingat per perangkat (localStorage 'sppd_fxlow'). */
  let lastF = 0, cnt = 0, slowN = 0, low = false; try { low = localStorage.getItem('sppd_fxlow') === '1'; } catch {}
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  const still = () => { stop(); B.length = 0; x.clearRect(0, 0, W, H); draw[mode]?.(); };
  function frame(now) {
    raf = (!RM.matches && !document.hidden && !low) ? requestAnimationFrame(frame) : 0;
    now = now || 0; const d = now - lastF; if (d < 30) return; lastF = now;
    if (document.getElementById('mod')?.firstChild) return;
    t = now; m.px += (m.tx - m.px) * .06; m.py += (m.ty - m.py) * .06;
    if (bgi) bgi.style.transform = `translate3d(${(.5 - m.px) * 24}px,${(.5 - m.py) * 24}px,0) scale(1.06)`;
    x.clearRect(0, 0, W, H); draw[mode]?.(); bursts();
    if (d < 400 && mode !== 'none') { cnt++; if (d > 55) slowN++; if (cnt >= 90) { if (slowN > 54) { low = true; try { localStorage.setItem('sppd_fxlow', '1'); } catch {} still(); } cnt = slowN = 0; } }
  }
  const startLoop = () => { stop(); if (mode === 'none' && !B.length) { x.clearRect(0, 0, W, H); return; } if (low) { still(); return; } raf = requestAnimationFrame(frame); };
  addEventListener('pointermove', e => { m.x = e.clientX; m.y = e.clientY; m.tx = e.clientX / W; m.ty = e.clientY / H; }, {passive:true});
  addEventListener('pointerleave', () => { m.x = m.y = -1e4; });
  document.addEventListener('pointerleave', () => { m.x = m.y = -1e4; });
  addEventListener('pointerdown', e => {
    if (mode === 'none' || low || RM.matches || e.target.closest('input,select,textarea,.paper')) return;
    B.push({x:e.clientX, y:e.clientY, life:1, ring:1, c:0});
    for (let i = 0; i < 14; i++) { const a = R(0, 6.283), s = R(1.2, 3.6); B.push({x:e.clientX, y:e.clientY, vx:Math.cos(a) * s, vy:Math.sin(a) * s - 1, life:1, c:i % 2}); }
    if (!raf) startLoop();
  }, {passive:true});
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(size, 150); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) startLoop(); });
  size();
  return {
    set(fx, power, c1, c2) {
      mode = own(draw, fx) ? fx : 'none'; pow = clamp(power, 10, 100, 60); C = [rgb(hex(c1)), rgb(hex(c2, '#6366f1'))];
      init(); if (RM.matches) { x.clearRect(0, 0, W, H); draw[mode]?.(); return; } startLoop();
    },
    get low() { return low; },
    wake() { low = false; cnt = slowN = 0; try { localStorage.removeItem('sppd_fxlow'); } catch {} startLoop(); },
    list: [['constellation', 'Rasi Bintang', 'Titik terhubung, mengikuti kursor'], ['waves', 'Gelombang', 'Garis ombak bereaksi pada kursor'], ['bokeh', 'Bokeh', 'Bulatan cahaya melayang'], ['stars', 'Langit Malam', 'Bintang berkelip + bintang jatuh'], ['aurora', 'Aurora', 'Cahaya warna bergerak lembut'], ['none', 'Tanpa Efek', 'Hemat baterai']]
  };
})();
