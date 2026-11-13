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
