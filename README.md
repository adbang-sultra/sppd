# SIM Pegawai & SPPD — v2.0

Aplikasi statis (tanpa server). Deploy ke Vercel: `vercel --prod` di folder ini, atau unggah ke GitHub → Import Project (Framework: **Other**, tanpa build command).
Harus dibuka lewat **HTTPS** (atau localhost) karena memakai Web Crypto.

## Struktur
| File | Isi |
|---|---|
| `index.html` | kerangka (tanpa skrip/gaya inline) |
| `css/theme.css` | variabel warna, mode gelap/terang, skala ukuran, font |
| `css/app.css` | komponen & tata letak (desktop, tablet, ponsel) |
| `css/doc.css` | gaya dokumen cetak (SPD, Lampiran, Surat Tugas, Laporan) |
| `css/tw.css` | Tailwind hasil kompilasi lokal (bukan CDN) |
| `js/config.js` | **tampilan bawaan & preset warna** (ubah di sini bila perlu) |
| `js/core.js` | utilitas, enkripsi, penyimpanan, event delegation |
| `js/icons.js` | set ikon SVG (tambah ikon: `ICONS.nama='<path …/>'`) |
| `js/fx.js` | efek latar interaktif |
| `js/app.js` · `js/report.js` | halaman & laporan |
| `js/docs.js` · `js/docx-export.js` | kop surat, SPT/SPD/Lampiran, ekspor .docx (`js/vendor/docx.iife.js`, lisensi MIT) |
| `js/ui.js` | menu Tampilan & Tema · `js/auth.js` login, peran, sesi |
| `assets/` | `logo.svg`, `bg.svg`, font |
| `contoh-data/` | CSV contoh pegawai — **tidak ikut diunggah ke Vercel** (`.vercelignore`) |

## Dokumen cetak & Word
- **Kop surat** model Executive Summary Setda Prov. Sultra (lambang kiri, 3 baris, garis tebal). Ubah teks/logo di **Pengaturan Instansi**, atau pilih **Gambar kop jadi** untuk memakai gambar kop resmi utuh.
- **Surat Tugas, SPD, Lampiran SPD** mengikuti contoh SPT (tabel a/b/c, pengikut, *Coret yang tidak perlu, lembar I–VI, PERHATIAN).
- **Tanda tangan**: *Elektronik (TTE)* → kotak "Ditandatangani secara elektronik oleh" berisi penanda `${ttd}` + catatan UU ITE/BSrE di kaki halaman; atau *Basah/manual*.
- **Laporan Perjalanan** model Bandung: kop hanya halaman 1, nomor halaman kanan atas, dokumentasi 2 foto/halaman.
- **Unduh Word (.docx asli)** di menu Cetak Dokumen: kop di header, catatan di footer — bisa dibuka di MS Word, WPS, LibreOffice, Google Docs, lalu diunggah ke aplikasi TTE (penanda `${ttd}` diganti QR).
- Cetak PDF: pilih "Simpan sebagai PDF", ukuran A4, matikan opsi *Header dan footer* browser.

## Mengganti tampilan kapan saja
Menu **Tampilan & Tema** (Administrator): logo, gambar latar, 8 skema warna + warna bebas, mode gelap/terang/otomatis,
6 efek latar (Rasi Bintang, Gelombang, Bokeh, Langit Malam, Aurora, Tanpa), intensitas, gelap latar, efek kaca, ukuran tampilan,
kelengkungan sudut, ikon tiap menu (ikon garis / emoji / gambar sendiri). Semua dipratinjau langsung, lalu **Simpan Tampilan**.
Tema bisa diekspor/impor sebagai file JSON. Alternatif: ganti file `assets/logo.svg` / `assets/bg.svg` (nama sama) atau edit `js/config.js`.

## Keamanan
- **Enkripsi data**: semua data (pegawai, SPPD, laporan, foto, log, pengaturan) dienkripsi AES-256-GCM. Kunci data dibungkus kata sandi tiap pengguna (PBKDF2-SHA256 600.000 iterasi). Tanpa kata sandi, isi localStorage tidak terbaca.
- **Peran terlindungi**: peran & status pengguna disimpan di dalam brankas terenkripsi, jadi mengedit localStorage tidak menaikkan hak akses. Setiap aksi dicek perannya.
- **CSP ketat**: `script-src 'self'; style-src 'self'` tanpa `unsafe-inline`, tanpa skrip pihak ketiga (Tailwind & font lokal), `form-action 'none'`, `frame-ancestors 'none'`, COOP/COEP/CORP, HSTS, Permissions-Policy.
- **Login**: kunci bertahap (5 gagal → 5, 10, 20 … menit), aturan sandi (≥10 karakter, huruf+angka, tidak memuat username/kata umum), indikator kekuatan.
- **Sesi**: kunci sesi non-extractable di IndexedDB; berakhir setelah 20 menit tidak aktif / maksimal 10 jam; keluar di satu tab = keluar semua tab.
- **Masukan**: semua data dibersihkan saat dimuat/impor/restore (anti XSS & prototype pollution), gambar diperiksa magic bytes lalu di-encode ulang (metadata/EXIF terbuang), anti CSV injection.
- **Backup terenkripsi** dengan kata sandi backup; restore memerlukan konfirmasi kata sandi admin.

**Batas (jujur):** ini aplikasi tanpa server — data hanya ada di browser perangkat itu. Pengguna yang sah dan sedang login (memegang kunci) secara teknis tetap bisa mengutak-atik lewat DevTools. Untuk multi-perangkat & kontrol penuh di server, pindahkan ke backend (mis. Supabase Auth + RLS).

## Pembaruan dari versi lama
Data lama otomatis dienkripsi saat **Administrator masuk pertama kali**. Akun Operator/Pembaca lama tampil "Perlu atur ulang sandi" → Admin buka **Pengguna & Peran → Ubah**, isi kata sandi baru.
**Lupa kata sandi semua admin = data tidak bisa dibuka.** Rutin lakukan backup.

## Mengubah kelas Tailwind
Bila menambah kelas Tailwind baru di JS: `npx tailwindcss@3.4.17 -i in.css -o css/tw.css --minify` (in.css berisi `@tailwind base; @tailwind components; @tailwind utilities;`).
