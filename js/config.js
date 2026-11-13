/* ============================================================
   KONFIGURASI TAMPILAN BAWAAN
   Bisa diubah di sini, atau kapan saja lewat menu "Tampilan & Tema" (Administrator).
   - logo / bg   : ganti file di folder assets/ (nama sama) atau unggah lewat menu.
   - fx          : efek latar: 'constellation' | 'waves' | 'bokeh' | 'stars' | 'aurora' | 'none'
   - preset      : nama skema warna dari PRESETS di bawah
   - mode        : 'dark' | 'light' | 'auto' (ikut perangkat)
   - icons       : ikon menu khusus, contoh { dash:{t:'svg',v:'home'}, emp:{t:'txt',v:'👥'} }
   ============================================================ */
const APP_VER = '1.2.4';

const BRAND = {
  appName: 'SIM Pegawai & SPPD',
  subtitle: 'Sistem Informasi Perjalanan Dinas',
  logo: 'assets/logo.svg',
  bg: 'assets/bg.svg',
  fx: 'constellation',
  fxPower: 60,          // intensitas efek 10–100
  preset: 'samudra',
  mode: 'dark',
  accent: '#14b8a6',
  accent2: '#6366f1',
  dim: 35,              // gelapkan latar 0–80 (%)
  blur: 16,             // efek kaca 0–30 (px)
  scale: 100,           // ukuran tampilan 85–120 (%)
  radius: 18,           // kelengkungan sudut 6–28 (px)
  icons: {}
};

/* Skema warna siap pakai: [nama, warna utama, warna sekunder, warna dasar latar] */
const PRESETS = {
  samudra:  ['Samudra',      '#14b8a6', '#6366f1', '#06121f'],
  senja:    ['Senja',        '#f97316', '#e11d48', '#1a0b14'],
  hutan:    ['Hutan Tropis', '#22c55e', '#0ea5e9', '#06140e'],
  royal:    ['Royal',        '#8b5cf6', '#f59e0b', '#110a1f'],
  merah:    ['Merah Putih',  '#ef4444', '#f43f5e', '#170809'],
  langit:   ['Langit',       '#0ea5e9', '#22d3ee', '#06111d'],
  grafit:   ['Grafit',       '#64748b', '#94a3b8', '#0b0f15'],
  emas:     ['Emas Anoa',    '#eab308', '#14b8a6', '#14110a']
};

/* ============================================================
   PENYIMPANAN CLOUD (lintas peramban & perangkat)
   Isi setelah menjalankan supabase/schema-sppd.sql di project Supabase Anda.
   Ambil dari Supabase → Project Settings → API:
     url     : Project URL, mis. 'https://abcdxyz.supabase.co'
     anonKey : kunci "anon public" (aman ditaruh di sini — data tetap terenkripsi
               dan semua akses diperiksa oleh fungsi di server)
   Kosongkan keduanya untuk mode lokal (data hanya di browser ini).
   ============================================================ */
const SYNC = {
  url: 'https://wvzvpcddtpzkmlgxgdtk.supabase.co',
  anonKey: 'sb_publishable_m3H7cayGw4750WmvrQaV8w_4hiUWY-F'
};
