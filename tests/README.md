# Pengujian otomatis SIM-SPPD

Skenario dijalankan di Chrome headless (Playwright). Mode cloud diuji terhadap **PostgreSQL asli** yang dimuati
`supabase/schema-sppd.sql`; `server.js` meniru cara PostgREST/Supabase memanggil fungsi `sppd_*` (sebagai role `anon`).

## Prasyarat
- Node.js 18+, modul `playwright` (`npm i playwright`), Chrome/Chromium (`CHROME=/jalur/chrome` bila bukan `/usr/bin/google-chrome`)
- PostgreSQL 14+ dengan ekstensi `pgcrypto`, dan perintah `psql`

## Menyiapkan basis data uji (sekali)
```sh
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGDATABASE=sppd_uji
psql -d postgres -c "create role anon nologin" -c "create role authenticated nologin" -c "create database sppd_uji"
psql -c "create schema if not exists extensions; grant usage on schema extensions to public; grant usage on schema public to anon, authenticated"
psql -f supabase/schema-sppd.sql
psql -c "select public.sppd_set_setup('kode-setup-uji-1234567890')"
```

## Menjalankan
```sh
node tests/server.js 8801 local &      # aplikasi mode lokal
node tests/server.js 8802 cloud &      # aplikasi mode cloud → PostgreSQL di atas
node tests/run-local.js contoh-data/pegawai-biro-adm-pembangunan.csv     # 30 pemeriksaan
node tests/run-cloud.js                                                    # 27 pemeriksaan (±4 menit; mengosongkan tabel sppd_* di basis data uji)
OLD=/jalur/ke/sim-sppd-v1.1 node tests/run-migrasi.js                      # 12 pemeriksaan; perlu salinan v1.1
```
Hasil cetak PDF/Word dan tangkapan layar disimpan di folder sementara (atur dengan `OUT=...`).

**Jangan** arahkan `PGDATABASE` ke basis data produksi: `run-cloud.js` mengosongkan tabel `sppd_*`.
