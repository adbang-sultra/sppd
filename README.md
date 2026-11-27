# SIM Pegawai & SPPD — v1.4.0

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
| `js/core.js` | utilitas, enkripsi, model baris, penyimpanan lokal (IndexedDB), event delegation |
| `js/cloud.js` | sinkron cloud Supabase (enkripsi ujung-ke-ujung, versi per baris + penggabungan otomatis, cache & antrean keluar di IndexedDB) |
| `supabase/schema-sppd.sql` | skema & fungsi server (jalankan sekali di Supabase) |
| `js/icons.js` | set ikon SVG (tambah ikon: `ICONS.nama='<path …/>'`) |
| `js/fx.js` | efek latar interaktif |
| `js/app.js` · `js/report.js` | halaman & laporan |
| `js/ai.js` · `api/ai.js` | **Asisten AI** (v1.4.0): model AI di Pengaturan + prompt per bagian laporan (browser) · fungsi server Vercel yang memanggil penyedia AI |
| `js/docs.js` · `js/docx-export.js` | kop surat, SPT/SPD/Lampiran, ekspor .docx (`js/vendor/docx.iife.js`, lisensi MIT) |
| `js/ui.js` | menu Tampilan & Tema · `js/auth.js` login, peran, sesi |
| `assets/` | `logo.svg`, `bg.svg`, font |
| `contoh-data/` | CSV contoh pegawai — **tidak ikut diunggah ke Vercel maupun Git** (`.vercelignore`, `.gitignore`) |
| `tests/` | server uji + skenario uji otomatis (lihat `tests/README.md`) — tidak ikut diunggah ke Vercel |

## Penyimpanan Cloud — data bisa dibuka lintas browser & perangkat
Tanpa langkah ini aplikasi berjalan **mode lokal** (data hanya di browser itu). Aktifkan sekali:

1. **Supabase** → buka project (boleh project yang sudah ada; tabel & fungsi memakai awalan `sppd_` sehingga tidak bentrok dengan aplikasi lain).
2. Buka `supabase/schema-sppd.sql` → salin seluruh isinya ke SQL Editor → *Run*. Lalu jalankan **satu baris** ini dengan kode rahasia Anda sendiri (min. 16 karakter):
   ```sql
   select public.sppd_set_setup('tulis-kode-rahasia-anda-di-sini');
   ```
   Kode setup tidak lagi ditulis di dalam file, jadi file SQL aman disimpan di GitHub.
3. Supabase → *Project Settings → API*: salin **Project URL** dan kunci **anon public** ke `js/config.js` bagian `SYNC`:
   ```js
   const SYNC = { url: 'https://xxxx.supabase.co', anonKey: 'eyJhbGciOi...' };
   ```
4. Deploy ulang ke Vercel. Buka aplikasi → layar **Buat Administrator** meminta *Kode setup* (langkah 2).
   - Jika browser itu sudah berisi data lama (mode lokal), pakai **username & kata sandi admin lama** — seluruh data otomatis diunggah.
5. Tambahkan pengguna lain di **Pengguna & Peran**. Akun lama bertanda "Perlu atur ulang sandi" → klik Ubah, isi kata sandi baru.

Selesai — masuk dari Chrome, Edge, Firefox, Safari, HP, atau komputer lain akan menampilkan data yang sama. Ikon awan di bilah atas menunjukkan status (hijau = tersimpan, kuning = menyimpan, merah = offline/gagal; perubahan saat offline dikirim otomatis saat online kembali).

**Keamanan mode cloud**
- *Zero-knowledge*: tiap item dienkripsi AES-256-GCM di browser sebelum dikirim — admin Supabase pun hanya melihat teks acak.
- Kata sandi tidak pernah dikirim; server hanya menyimpan hash kunci otentikasi (turunan PBKDF2 600.000×).
- Login, sesi (20 menit tidak aktif / maks. 10 jam), **lockout bertahap** dan **hak akses per peran** diperiksa di server — tidak bisa diakali dari browser. Lockout dihitung per *username + alamat IP*: orang lain yang menebak sandi dari jaringan berbeda hanya mengunci dirinya sendiri, dan username yang tidak ada diperlakukan sama (tidak bisa dipakai menebak username).
- Tabel tertutup (RLS tanpa policy, hak `anon` dicabut); akses hanya lewat fungsi `sppd_*`. Jejak login, login gagal & perubahan pengguna tercatat di tabel `sppd_audit` dan bisa dilihat Administrator di **Pengguna & Peran → Jejak Audit**. Log aktivitas hanya bisa ditambah oleh pemiliknya untuk hari berjalan — tidak bisa menghapus atau menulis ulang hari lampau.
- Simpan **kode setup** & minimal satu akun admin dengan baik: tanpa kata sandi, data tidak dapat dibuka oleh siapa pun (termasuk pengembang).

## Dokumen cetak & Word
- **Kop surat** model Executive Summary Setda Prov. Sultra (lambang kiri, 3 baris, garis tebal). Ubah teks/logo di **Pengaturan Instansi**, atau pilih **Gambar kop jadi** untuk memakai gambar kop resmi utuh.
- **Surat Tugas, SPD, Lampiran SPD** mengikuti contoh SPT (tabel a/b/c, pengikut, *Coret yang tidak perlu, lembar I–VI, PERHATIAN).
- **Tanda tangan manual (basah)**: ruang tanda tangan dibiarkan kosong, tanpa catatan kaki. Penanda tangan per SPPD bisa pejabat bawaan, **Kepala OPD** (data di Pengaturan Instansi → *Data Kepala OPD*), atau penanda tangan lain.
- **Huruf**: seluruh isi dokumen (cetak/PDF maupun Word) **Arial 12 pt**, kecuali kop surat.
- **Laporan Perjalanan** model Bandung: kop hanya halaman 1, nomor halaman kanan atas, dokumentasi 2 foto/halaman.
- **Unduh Word (.docx asli)** di menu Cetak Dokumen: kop di header, tanpa catatan kaki — bisa dibuka di MS Word, WPS, LibreOffice, Google Docs.
- Cetak PDF: pilih "Simpan sebagai PDF", ukuran A4, matikan opsi *Header dan footer* browser.

## Mengganti tampilan kapan saja
Menu **Tampilan & Tema** (Administrator): logo, gambar latar, 8 skema warna + warna bebas, mode gelap/terang/otomatis,
6 efek latar (Rasi Bintang, Gelombang, Bokeh, Langit Malam, Aurora, Tanpa), intensitas, gelap latar, efek kaca, ukuran tampilan,
kelengkungan sudut, ikon tiap menu (ikon garis / emoji / gambar sendiri). Semua dipratinjau langsung, lalu **Simpan Tampilan**.
Tema bisa diekspor/impor sebagai file JSON. Alternatif: ganti file `assets/logo.svg` / `assets/bg.svg` (nama sama) atau edit `js/config.js`.

## Keamanan
- **Enkripsi data**: semua data (pegawai, SPPD, laporan, foto, log, pengaturan) dienkripsi AES-256-GCM. Kunci data dibungkus kata sandi tiap pengguna (PBKDF2-SHA256 600.000 iterasi). Tanpa kata sandi, isi localStorage tidak terbaca.
- **Peran**: peran & status pengguna disimpan di dalam brankas terenkripsi, jadi mengedit penyimpanan browser *tanpa masuk* tidak menaikkan hak akses. Di **mode cloud** peran diperiksa server. Di **mode lokal** semua akun memegang kunci data yang sama dan peran hanya diperiksa aplikasi — pengguna yang paham teknis dan sudah masuk bisa melewatinya; pakai mode cloud bila pembatasan peran harus sungguh-sungguh.
- **CSP ketat**: `script-src 'self'; style-src 'self'` tanpa `unsafe-inline`, tanpa skrip pihak ketiga (Tailwind & font lokal), `form-action 'none'`, `frame-ancestors 'none'`, COOP/COEP/CORP, HSTS, Permissions-Policy.
- **Login**: kunci bertahap (5 gagal → 5, 10, 20 … menit), aturan sandi (≥10 karakter, huruf+angka, tidak memuat username/kata umum), indikator kekuatan.
- **Sesi**: kunci sesi non-extractable di IndexedDB; berakhir setelah 20 menit tidak aktif / maksimal 10 jam; keluar di satu tab = keluar semua tab.
- **Masukan**: semua data dibersihkan saat dimuat/impor/restore (anti XSS & prototype pollution), gambar diperiksa magic bytes lalu di-encode ulang (metadata/EXIF terbuang), anti CSV injection.
- **Backup terenkripsi** dengan kata sandi backup; restore memerlukan konfirmasi kata sandi admin.

**Batas (jujur):** pada mode lokal data hanya ada di browser itu — aktifkan Penyimpanan Cloud. Kunci data (satu untuk semua pengguna) **belum dirotasi** saat pengguna dihapus: aksesnya ke server langsung dicabut, tetapi bila ia sempat menyalin kunci *dan* kelak memperoleh salinan basis data, isinya bisa dibaca. Rotasi kunci memerlukan perombakan ke kunci per pengguna (belum dikerjakan). Pada mode cloud, hak akses ditegakkan server; namun pengguna sah yang sedang login tetap memegang kunci data sesuai perannya (wajar untuk enkripsi ujung-ke-ujung).

## Yang baru di v1.2
**Sinkron cloud**
- Ketikan yang belum disimpan (Laporan, Pengaturan) tidak lagi terhapus saat data diperbarui dari perangkat/tab lain.
- Dua perangkat mengubah data yang sama: perubahan **digabung per kolom**; bila kolom yang sama diubah berdua, pengguna diberi tahu. Tidak ada lagi timpa-diam-diam.
- Perubahan saat offline disimpan terenkripsi di perangkat (antrean keluar) dan dikirim saat online — juga setelah tab ditutup, dimuat ulang, atau keluar. Muat ulang saat offline tidak lagi melempar ke layar masuk.
- Nomor SPPD dijamin unik antarperangkat (diklaim di server saat disimpan); nomor otomatis dihitung **per tahun**.
- Foto laporan & gambar kop/logo/latar disimpan sebagai baris tersendiri: mengubah teks laporan tidak mengunggah ulang foto. Pengambilan data berhalaman.

**Penyimpanan lokal** pindah dari localStorage (±5 MB) ke IndexedDB, satu baris per item. Migrasi otomatis saat masuk pertama kali.

**Fitur SPPD**
- **Rincian biaya** per SPPD → dokumen *Rincian Biaya Perjalanan Dinas* & *Kuitansi* (cetak/PDF/Word), total biaya dan **realisasi terhadap pagu** di Rekapitulasi, peringatan bila melebihi sisa pagu.
- Peringatan **bentrok jadwal** (pegawai/pengikut yang sama pada tanggal beririsan).
- **Penanda tangan per dokumen** (mis. Kepala Biro untuk Surat Tugas, PPK untuk SPD) — daftarnya di Pengaturan Instansi; nama Bendahara Pengeluaran untuk kuitansi.
- Data pegawai **disalin ke SPPD** saat disimpan: dokumen lama tidak berubah bila pangkat/jabatan pegawai berubah.
- Pegawai non-ASN boleh tanpa NIP; NIP PNS/PPPK harus 18 digit dan tidak boleh kembar.
- Impor CSV: pemisah (`,` `;` tab) dideteksi otomatis, ada **pratinjau** dan alasan tiap baris yang dilewati.

**Cetak, tampilan, aksesibilitas**: blok tanda tangan tidak terpotong antarhalaman; baris pengikut kosong tetap setinggi baris; margin tetap putih di mode gelap; efek latar dibatasi ±30 fps, dijeda saat dialog terbuka, dan berhenti sendiri di perangkat lambat; fokus keyboard tidak keluar dari dialog; teks terkecil & tombol ikon diperbesar.

## Memperbarui dari v1.1
1. **Backup dulu** (menu Backup & Restore → Backup Terenkripsi).
2. Mode cloud: jalankan ulang `supabase/schema-sppd.sql` di SQL Editor (aman diulang; pengguna, data, dan kode setup lama dipertahankan).
3. Unggah berkas v1.2 ke Vercel. Minta semua pengguna **memuat ulang halaman**: tab yang masih memakai v1.1 akan gagal sinkron (sengaja ditolak server agar tidak menimpa data) sampai dimuat ulang.
4. Tidak ada langkah lain: akun & kata sandi tetap, data lokal dipindah ke IndexedDB otomatis, laporan lama dipindah ke format baru saat laporan itu diubah.

## Pengujian
`tests/` berisi pemeriksaan otomatis: antarmuka mode lokal (`run-local.js`, termasuk blok **[AI-1.4]** untuk Model AI & prompt per bagian), fungsi server AI tanpa browser (`run-ai.js`, 59 pemeriksaan), mode cloud terhadap PostgreSQL asli (`run-cloud.js`) dan migrasi dari v1.1 (`run-migrasi.js`). Cara menjalankan ada di `tests/README.md`. Yang **belum** diuji: penyedia AI sungguhan (yang diuji memakai balasan tiruan — jalankan *Uji koneksi* di Pengaturan → Model AI setelah deploy), project Supabase sungguhan (yang diuji PostgreSQL 16 lokal + peniru PostgREST; `run-cloud.js` belum dijalankan ulang setelah v1.4.0), dan perangkat fisik.

## Pembaruan dari versi sebelum enkripsi
Data lama otomatis dienkripsi saat **Administrator masuk pertama kali**. Akun Operator/Pembaca lama tampil "Perlu atur ulang sandi" → Admin buka **Pengguna & Peran → Ubah**, isi kata sandi baru.
**Lupa kata sandi semua admin = data tidak bisa dibuka.** Rutin lakukan backup.

## Mengubah kelas Tailwind
Bila menambah kelas Tailwind baru di JS: `npx tailwindcss@3.4.17 -i in.css -o css/tw.css --minify` (in.css berisi `@tailwind base; @tailwind components; @tailwind utilities;`).


## Fitur v1.2.7

### Asisten AI untuk Laporan (diperbarui di v1.4.0)

**1. Tambah model AI di panel admin.** Menu **Pengaturan → tab Model AI** (Administrator): **Tambah Model** → isi *Nama tampilan*, *Penyedia* (Google Gemini, Anthropic/Claude, OpenAI, Groq, OpenRouter, atau *Kompatibel OpenAI* dengan Base URL sendiri), *ID model* (salin persis dari dokumentasi penyedia) dan *Kunci API* → **Simpan**. Ikon petir = **Uji koneksi**, bintang = jadikan **Bawaan**; model bisa dinonaktifkan atau dihapus. Mengganti/menambah model tidak lagi memerlukan ubah variabel lingkungan maupun deploy ulang.

**2. Prompt per bagian laporan.** Menu **Laporan Perjalanan**: setiap bagian — Latar Belakang, Dasar Hukum, Maksud dan Tujuan, Waktu Pelaksanaan, Kegiatan, Hasil yang Dicapai, Kesimpulan, Saran, Penutup — punya kotak **arahan (prompt)** sendiri.
- Tulis arahan (boleh dikosongkan; AI lalu menyusun dari data perjalanan) → **Buat** (atau tekan Enter) → hasil masuk ke kolom bagian itu dan **bisa diedit** seperti isian biasa.
- **Revisi** memperbaiki teks yang sudah ada sesuai arahan (mis. "persingkat", "tambahkan koordinasi dengan Bappeda"); tombol **↻** mengembalikan isi sebelum hasil AI.
- Pilihan **Model AI** ada di kotak *Asisten AI* di atas form; **Buat Semua Bagian** (dari v1.2.7) tetap ada dan kini ikut memakai arahan per bagian bila diisi.
- Arahan tiap bagian ikut **tersimpan bersama laporan** (tombol Simpan) dan muncul lagi saat laporan dibuka.
- **Dasar Hukum**: AI hanya menuliskan peraturan yang Anda sebut di arahan (atau saran peraturan nasional yang ia yakini ada) dan dilarang mengarang nomor/tahun/judul. Tetap **periksa semua nomor, tahun, dan judul peraturan** sebelum menyimpan. Surat Tugas dan SPPD sudah otomatis tercantum, tidak perlu ditulis.

**Penyimpanan & keamanan kunci API.** Kunci disimpan **terenkripsi bersama data aplikasi** (bukan di kode/GitHub), hanya Administrator yang bisa melihat/mengubahnya, dan daftar hanya menampilkan 4 digit terakhir. Batas jujur: akun yang bisa masuk memegang kunci data sesuai perannya, sehingga pengguna yang paham teknis pada prinsipnya dapat membaca kunci itu dari browsernya. Karena itu pakai **kunci khusus aplikasi** dengan batas kuota di sisi penyedia. Alternatif yang lebih tertutup: kosongkan kolom kunci di panel admin dan simpan kunci di server (variabel `AI_API_KEY_<PENYEDIA>` di bawah) — kunci itu tidak pernah sampai ke browser. Browser tidak pernah menghubungi penyedia AI langsung; semua lewat `/api/ai`. Base URL buatan sendiri hanya diterima bila `https://` dengan nama domain publik (alamat IP, localhost, dan jaringan privat ditolak).

Fungsi server: `api/ai.js` (Vercel Serverless). Variabel lingkungan (Vercel → Settings → Environment Variables, lalu *Redeploy*) — **semuanya opsional kecuali salah satu cara otorisasi**:

| Variabel | Keterangan |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | mode cloud: sesi Admin/Operator diperiksa ke Supabase (Admin/Operator boleh membuat bagian laporan; hanya Admin yang boleh uji koneksi) |
| `AI_ACCESS_CODE` | mode lokal: kode akses yang diketik pengguna saat pertama memakai fitur AI |
| `AI_API_KEY_GEMINI` · `_ANTHROPIC` · `_OPENAI` · `_GROQ` · `_OPENROUTER` · `_CUSTOM` | kunci cadangan per penyedia, dipakai bila model di panel admin dibiarkan tanpa kunci |
| `AI_API_KEY`, `AI_PROVIDER`, `AI_MODEL`, `AI_BASE_URL` | konfigurasi lama (v1.2.7): dipakai bila **belum ada model** di panel admin. `AI_API_KEY` hanya dipakai untuk penyedia `AI_PROVIDER` |

Yang dikirim ke penyedia AI hanya data maksud, tujuan, tanggal, serta teks isian laporan dan arahan yang diketik; nama/NIP pegawai tidak dikirim oleh aplikasi (jangan mengetik data pribadi di arahan). Hasil AI wajib diperiksa manusia.

### Akun Pimpinan (Kepala OPD) & tanda tangan elektronik
- Admin: **Pengguna & Backup → Tambah/Ubah pengguna** → peran *Pimpinan (Kepala OPD)* → isi **NIP** (dicocokkan dengan penanda tangan SPPD) dan unggah **gambar tanda tangan**.
- Pimpinan masuk → menu **Persetujuan** → **Setujui & TTD** pada Surat Tugas / SPD / Laporan miliknya. Gambar tanda tangan + catatan "Disetujui secara elektronik" otomatis tampil di cetak dan Word. Persetujuan gugur bila penanda tangan SPPD diganti.
- Bila surat/laporan ditandatangani basah: Admin/Operator memakai **Tandai disetujui (manual)** — hanya menandai status, tanpa gambar tanda tangan.
- Batas: ini tanda tangan berupa gambar + jejak persetujuan, **bukan** tanda tangan digital bersertifikat. Di mode lokal peran hanya diperiksa aplikasi di browser; pembatasan sungguhan memerlukan Penyimpanan Cloud.
- **Pengguna cloud: jalankan ulang `supabase/schema-sppd.sql` di SQL Editor** (menambah peran `kepala` dan koleksi `apr`; aman dijalankan ulang) sebelum membuat akun Pimpinan.

### Lain-lain
- Menu **Pengaturan** = Instansi + Tampilan & Tema (tab); **Pengguna & Backup** = satu halaman.
- Data SPPD, Rekapitulasi, dan Dashboard menghitung **pengikut**; biaya SPPD dibagi rata per orang pada tabel Pegawai/Jabatan.
