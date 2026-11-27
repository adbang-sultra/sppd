# Checkpoint 12 Nov 2026 — v1.2
(Penomoran disatukan: paket ini sebelumnya bertanda "1.1" di nama zip, "v2.0" di README, dan "v3.0" di SQL.)

## Selesai di v1.2
- [x] Sinkron: versi per baris + kunci optimistis + gabung 3 arah; antrean keluar offline di IndexedDB; render aman-form; gema kiriman sendiri diabaikan
- [x] SQL: push diserialkan (advisory lock), pull berhalaman, `sppd_get`, klaim nomor SPPD, lockout per username+IP, `sppd_audit_list`, log hanya-tambah, kode setup lewat `sppd_set_setup()`
- [x] Login saat server tak terjangkau menampilkan pesan (bukan tombol macet)
- [x] Penyimpanan lokal → IndexedDB per baris (migrasi otomatis); foto & gambar jadi baris terpisah; urutan item stabil (`ts`)
- [x] Rincian biaya, kuitansi, realisasi pagu; bentrok jadwal; penanda tangan per dokumen; salinan pegawai di SPPD; NIP opsional non-ASN; impor CSV berpratinjau
- [x] Cetak: tanda tangan tidak terpotong, baris pengikut, margin putih; efek latar hemat; perangkap fokus dialog; ukuran teks/tombol
- [x] `.gitignore`, `tests/` (69 pemeriksaan: lokal 30, cloud 27, migrasi 12 — semua lulus di PostgreSQL 16 + Chrome headless)

## Belum
- [ ] Rotasi kunci data saat pengguna dihapus (perlu kunci per pengguna/asimetris + migrasi akun)
- [ ] Login baru saat offline (sekarang: sesi yang sedang berjalan tetap hidup saat offline, tetapi masuk dari awal perlu server)
- [ ] Kode masih berbaris panjang (belum diformat ulang agar selisih dengan v1.1 tetap terbaca)
- [ ] Isi SYNC di js/config.js, jalankan SQL di Supabase asli, uji di perangkat nyata & deploy Vercel

## Perbaikan tambahan (v1.2.1)
- [x] Kolom tanggal (form SPPD, laporan, filter): pemilih kalender bisa dipakai — `all:unset` pada `.in` merusak tampilan bawaan `type=date`; CSS dipulihkan (appearance, color-scheme gelap/terang) + klik di mana pun pada kolom membuka kalender (`showPicker`)
- [x] Penyimpanan ke database: perubahan dikirim ke server lebih cepat (120 ms), dikirim paksa saat tab disembunyikan/ditutup, dan ada peringatan penutupan tab bila masih ada yang belum terkirim; mode lokal kini diberi penanda merah + notifikasi "BELUM tersimpan di database"
- [ ] Hubungkan ke Supabase: isi `SYNC.url` & `SYNC.anonKey` di js/config.js (tanpa ini aplikasi tetap mode lokal)

## Perbaikan v1.2.3 (13 Nov 2026)
- [x] Pengaturan Instansi & Tampilan & Tema: bilah tombol Simpan tidak lagi melebar menutupi isi halaman (kartu `sticky-act` meregang setinggi baris grid). Kini satu baris penuh di bawah, tetap menempel di bawah layar.
- [x] Form SPPD: nomor SPPD diketik manual — tombol "Auto" & penomoran otomatis dihapus (keunikan nomor tetap dicek, juga di server pada mode cloud). Kolom "Awalan Nomor SPPD" di Pengaturan dihapus.
- [x] Data Kepala OPD (Pengaturan Instansi): jabatan, nama, pangkat/gol., NIP. Bisa dipilih sebagai penanda tangan Surat Tugas / SPD per SPPD (kelompok "Kepala OPD" di pilihan penanda tangan). Pangkat penanda tangan ikut tercetak bila diisi.
- [x] Cetak & Word: tanda tangan manual (ruang kosong, tanpa kotak TTE/`${ttd}`), catatan kaki dihapus, seluruh isi Arial 12 pt kecuali kop; Lampiran SPD & SPD tetap satu halaman A4.
- [x] tests/run-local.js: 39 pemeriksaan lulus (termasuk uji baru tata letak, Kepala OPD, font, tanpa TTE). tests/run-cloud.js disesuaikan (nomor manual) tetapi belum dijalankan ulang.

## Perbaikan v1.2.4 (13 Nov 2026)
- [x] Cloud selalu terhubung: perubahan sendiri tetap dikirim seketika; perubahan dari perangkat lain kini diambil tiap 3 detik selama aplikasi terbuka (sebelumnya 15 detik), dan seketika saat pindah menu, kembali ke tab/jendela, atau internet tersambung lagi. Gagal → jeda bertahap lalu coba lagi otomatis. Tombol "Sinkron sekarang" dihapus; status "Terhubung".
- [x] Surat Tugas mengikuti contoh SPT_11_s.d_12_Nov_2026.pdf: "SURAT TUGAS" bergaris bawah, "Nomor :", Dasar, jabatan pemberi tugas di tengah, "MENUGASKAN:", Kepada (Nama/Jabatan/NIP berkelompok/Pangkat-Gol per orang), Selama, Untuk (baris berikutnya pada Maksud → daftar bernomor), penutup menjorok, "Kendari, <tanggal>".
- [x] Blok tanda tangan semua dokumen: rata kiri di kolom kanan (mulai ±42% lebar), seperti contoh — jabatan tidak lagi di tengah.
- [x] Form SPPD: "Maksud Perjalanan" jadi kotak teks multi-baris (maks 1000 karakter). Di SPD & judul laporan ditulis satu paragraf.
- [x] SPD: lebar kolom dikunci agar tetap satu halaman walau maksud panjang. Word: margin atas 2450 / bawah 1000 twip; ST, SPD, Lampiran masing-masing 1 halaman (dicek LibreOffice).
- [x] tests/run-local.js 39 lulus. Pengambilan data 3 detik belum diuji dengan Supabase sungguhan.

## Perbaikan v1.2.5 (13 Nov 2026)
- [x] Surat Tugas: tulisan jabatan pemberi tugas (mis. "KEPALA BIRO ADM. PEMBANGUNAN SETDA PROV. SULTRA") di badan surat dihapus — jabatan tetap ada di blok tanda tangan. Berlaku di cetak & Word.
- [x] Lampiran SPD (halaman kedua Surat Perjalanan Dinas): kop surat dihapus (cetak & Word); tetap satu halaman.
- [x] Laporan Perjalanan Dinas memakai template contoh LAPORAN_WAKATOBI_DOKUMENTASI.docx: kop hanya di halaman 1; judul 2 baris (tanpa cetak tebal); Times New Roman 12 pt, spasi 1,5, rata kiri-kanan, paragraf menjorok; I Pendahuluan (A–D), II Kegiatan, III Hasil, IV Kesimpulan dan Saran (1. Kesimpulan:, 2. Saran — butir •), V Penutup; tanda tangan "Yang melakukan perjalanan dinas," (nama + titik-titik); halaman "Dokumentasi" dengan keterangan foto; nomor halaman di kanan atas mulai halaman 2. Bagian "Rekomendasi" lama diganti "Saran" (data lama `tl` tetap terbaca sebagai Saran).
- [x] Form Laporan: baris diawali "- " menjadi butir (•) di bawah nomor (Kegiatan & Hasil); kolom baru "Keterangan foto" (satu baris = satu foto, disimpan di `rep.fcap`).
- [x] tests/run-local.js: +4 pemeriksaan (ST tanpa jabatan di badan, Lampiran tanpa kop, struktur laporan, font laporan Tinos). Uji kapasitas 12 laporan × 6 foto ([5]) tidak bisa dijalankan di lingkungan tanpa memori cukup — belum diuji ulang.
- Catatan: contoh Wakatobi berukuran Letter dengan margin 2,54 cm; template di aplikasi tetap A4 (margin 2,5 cm).

## Perbaikan v1.2.6 (16 Nov 2026)
- [x] Cetak/Word: Surat Perjalanan Dinas dibuat per orang — pegawai utama + tiap pengikut mendapat SPD sendiri (nama, pangkat/gol, jabatan masing-masing; pangkat pengikut dari data pegawai lewat NIP). Poin 8 (Pengikut) dikosongkan. Paket 'Semua' berurutan: ST → [SPD → Lampiran SPD] per orang → Rincian/Kuitansi → Laporan. Pilihan cetak 'SPD' / 'Lampiran' menghasilkan satu lembar per orang. Nomor SPD sama untuk semua orang (satu data SPPD).
- [x] Form SPPD: Nomor SPPD dan Tanggal SPPD boleh dikosongkan (tidak wajib *). Cek nomor kembar & klaim nomor cloud hanya berjalan bila nomor diisi; nomor yang dikosongkan melepas klaim lama. Daftar/detail menampilkan "(belum bernomor)".
- [x] tests/run-local.js: +3 pemeriksaan.

## Perbaikan v1.2.7 (17 Nov 2026)
- [x] Laporan: tombol "Buat Isi Laporan dengan AI" (api/ai.js; env AI_API_KEY dst — lihat README). Hasil AI mengisi textarea biasa (bisa diedit); bagian terisi tidak ditimpa kecuali dicentang. Tes memakai tiruan /api/ai di tests/server.js (kode uji 'kode-uji').
- [x] Peran baru 'kepala' (Pimpinan): koleksi baru `apr` (id, sppdId, doc st|spd|lap, mode ttd|manual, by, nama, jab, nip, at); NIP + gambar tanda tangan disimpan di record ACL pengguna. Menu Persetujuan; TTD elektronik tampil di cetak & Word (ST, SPD+Lampiran, Laporan); opsi manual = penanda status. SQL: peran 'kepala' + kolom 'apr' (BELUM diuji di PostgreSQL — psql tidak tersedia di lingkungan pengembangan).
- [x] Data SPPD/Rekap/Dashboard: pengikut ikut dihitung (orang(s)); CSV ada kolom Pengikut.
- [x] Menu gabungan: peng (Instansi + Tampilan & Tema, 2 kolom) dan akses (Pengguna + Backup satu halaman); alamat lama #set/#tampil/#user/#bak dialihkan.
- Belum diuji: tes cloud (run-cloud), tes kapasitas [5], Word di MS Word/WPS.

## Perbaikan v1.2.8
- [x] Lampiran SPD (lembar belakang): baris II–V (Tiba di / Berangkat dari) diperlebar untuk ruang tanda tangan — cetak 26 mm, Word 1300 twips (±23 mm). Tetap satu halaman di cetak dan Word.

## v1.2.9
- [x] Anti-cache: berkas css/js di index.html diberi ?v=<versi> dan Cache-Control /(css|js) menjadi max-age=0, must-revalidate — agar perubahan langsung terlihat setelah deploy. (Ubah ?v= tiap rilis.)

## v1.3.0
- [x] Lembar belakang SPD (Lampiran) dibuat ulang mengikuti FORMAT_SPPD_BARU_2025.xlsx (sheet "Belakang"): I (Berangkat dari + (Tempat Kedudukan) + tanda tangan pejabat), II–V (Tiba di | Berangkat dari, masing-masing dengan ruang tanda tangan + garis nama + NIP.), VI (Tiba di | "Telah diperiksa…"), VII Catatan Lain, VIII PERHATIAN, kotak Paraf Hierarki (Asisten Adm. Umum, Kepala Biro Umum, Kepala Bagian Tata Usaha) dan tanda tangan di kanan bawah. Arial 8,5 pt (pengecilan proporsional seperti fit-to-page Excel) agar tetap satu halaman di cetak dan Word. Teks PERHATIAN memakai jabatan & provinsi dari Pengaturan.
- Tes font: lembar belakang (.paper.lamp) dikecualikan dari aturan Arial 12 pt.

## v1.3.1
- [x] Perbaikan hasil cetak Lampiran SPD: lebar kolom sebelumnya memakai atribut style (diblokir CSP `style-src 'self'` di produksi) sehingga kolom jadi sama lebar. Kini lewat kelas CSS (.ca/.cb/.cc). Tes baru memeriksa lebar kolom di bawah CSP. CATATAN RILIS: jangan pakai atribut style= di HTML dokumen; skrip uji visual jangan memakai bypassCSP.

## v1.3.2
- [x] Lampiran SPD: Paraf Hierarki dihapus; huruf disamakan dengan dokumen lain (Arial 12 pt — pengecualian lamp di CSS/tes dicabut); angka romawi "I." kini di dalam sel yang sama dengan blok tanda tangan kepala biro, sejajar baris "Berangkat dari" (cetak & Word). Tetap satu halaman: cetak memakai line-height 1.04; Word memakai jarak baris tetap 12 pt (exact), margin atas/bawah 12 mm khusus lembar belakang, kolom nomor dilebarkan (VIII.).

## v1.3.3
- [x] Lembar belakang SPD: huruf diperkecil ke Arial 10 pt (satu jenis & ukuran untuk seluruh isi; tes baru memeriksanya) agar ruang tanda tangan lebih luas: cetak blok II–VI 30 mm, ruang di atas garis nama ±10 mm, ruang tanda tangan kepala biro bawah 18 mm; Word: baris min 1900 twips, ruang nama ±11 mm, margin atas/bawah kembali 15 mm. Tetap satu halaman.

## v1.3.4
- [x] Seluruh isi dokumen cetak & Word kini satu jenis dan ukuran huruf: Arial 12 pt (Surat Tugas, SPD, Lampiran SPD, Rincian/Kuitansi, Laporan). Laporan tidak lagi Times New Roman/Tinos; Lampiran SPD kembali 12 pt (jarak baris dirapatkan agar satu halaman; ruang tanda tangan ±8–10 mm). Kop surat tetap berhuruf kop (Times/Cooper) sebagai identitas. Tes font tidak lagi mengecualikan Laporan dan Lampiran.

## v1.3.5
- [x] Lembar belakang SPD: ruang tanda tangan diperluas tanpa mengubah huruf (tetap Arial 12 pt, sama dengan bagian lain). Cetak: halaman bernama `@page lamp` margin atas/bawah 8 mm, baris II–VI 31 mm, ruang di atas garis nama 9 mm, kv3 tanpa padding; Word: margin atas/bawah 8,5 mm, ruang nama ±7 mm. Tetap satu halaman di cetak & Word (diuji LibreOffice, CSP aktif).

## v1.4.0 (26 Nov 2026)
- [x] **Model AI di panel admin**: Pengaturan → tab **Model AI** (Administrator) — tambah/ubah/hapus/nonaktifkan/jadikan bawaan/uji koneksi. Tiap model: nama tampilan, penyedia (Gemini, Anthropic, OpenAI, Groq, OpenRouter, kompatibel OpenAI + Base URL), ID model, kunci API (boleh kosong → kunci server `AI_API_KEY_<PENYEDIA>`), temperature (opsional), aktif. Disimpan di `cfg.ai` (terenkripsi; dibersihkan `cleanAI`). Alamat `#ai` membuka tab ini. Reset Identitas tidak menghapus model.
- [x] **Prompt per bagian laporan**: 9 bagian (Latar Belakang, Dasar Hukum, Maksud dan Tujuan, Waktu Pelaksanaan, Kegiatan, Hasil, Kesimpulan, Saran, Penutup) masing-masing punya kotak arahan + tombol **Buat** / **Revisi** / **Urungkan** (↻), Enter = Buat. Hasil masuk ke kolom biasa (bisa diedit). Arahan tersimpan di `rep.ap` (dibersihkan `cleanAP`). Pilihan model di kotak Asisten AI; "Buat Semua Bagian" (v1.2.7, aksi `aiLap`) tetap ada dan memakai arahan per bagian bila diisi.
- [x] `api/ai.js` ditulis ulang: jenis permintaan `bagian` | `laporan` | `tes`; model dikirim dari browser, cadangan variabel lingkungan; temperature/max_tokens tidak dikirim kecuali diatur (kompatibel model baru); Base URL kustom wajib https + domain publik (cek IP privat lewat DNS); kunci disamarkan pada pesan galat; kode status galat tidak lagi bisa tidak valid (timeout → 504); pembatas laju 40/10 menit.
- [x] **Backup**: Backup biasa (JSON tanpa enkripsi) tidak lagi memuat kunci API model AI (`bakData(true)`); Backup Terenkripsi tetap memuatnya. Restore tidak menghapus model/kunci yang sedang dipakai bila backup tidak memuatnya (`aiMergeRestore`). Reset Identitas juga mempertahankan model AI.
- [x] File baru: `js/ai.js`; `tests/run-ai.js` (uji `api/ai.js` tanpa browser: 59 pemeriksaan). `tests/run-local.js`: blok baru [AI-1.4] + `waitForFunction` diganti `until` (tidak bisa dipakai di Playwright baru karena CSP tanpa unsafe-eval). `tests/server.js`: tiruan /api/ai mendukung `bagian` & `tes`.
- Catatan batas: kunci API yang disimpan di panel admin ikut terenkripsi bersama data, tetapi pengguna sah yang paham teknis dapat membacanya dari browsernya (lihat README). Model/nama versi penyedia AI berubah-ubah — ID model diisi admin, bukan dikunci di kode (saran di formulir hanya contoh).
- Hasil uji (26 Nov 2026): `run-ai.js` 59/59 lulus; `run-local.js` 106/106 lulus (Chromium 131 headless, Playwright 1.49; blok [AI-1.4] ± 40 pemeriksaan baru). Dua kegagalan tes lama ditemukan & diperbaiki di sisi tes saja: balapan waktu autofokus dialog (±60 ms) pada tes "nomor & tanggal SPPD kosong", dan `waitForFunction` yang ditolak CSP. Kode asli v1.3.8 gagal sama persis di tes itu sebelum perbaikan tes.
- Pelajaran UI: jangan taruh kotak centang di dalam dialog — penangan klik global (`data-act="ovClose"` pada overlay) men-`preventDefault` klik sehingga kotak centang tidak bisa diubah; pakai `<select>`.
- Belum diuji: penyedia AI sungguhan (yang diuji: fetch & DNS tiruan) — jalankan *Uji koneksi* setelah deploy; mode cloud (`run-cloud.js`, butuh PostgreSQL) dan `run-migrasi.js` belum dijalankan ulang setelah v1.4.0; MS Word/WPS.
