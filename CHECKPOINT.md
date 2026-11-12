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
