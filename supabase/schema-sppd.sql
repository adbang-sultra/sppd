-- =====================================================================
--  SIM Pegawai & SPPD — Penyimpanan Cloud (Supabase)  v1.2
--  Jalankan di Supabase → SQL Editor → New query → Run.
--  AMAN DIJALANKAN ULANG: pemasangan baru maupun pembaruan dari v1.1
--  memakai file yang sama (data & pengguna lama tidak dihapus).
--
--  Konsep "zero-knowledge":
--   * Semua isi data dienkripsi di browser (AES-256-GCM) SEBELUM dikirim.
--     Server/admin Supabase hanya melihat teks acak — tidak bisa membaca data.
--   * Kata sandi tidak pernah dikirim. Server hanya menyimpan hash dari
--     "kunci otentikasi" turunan PBKDF2 (600.000 iterasi) di browser.
--   * Login, sesi, batas percobaan (lockout) & hak akses per peran
--     diperiksa DI SERVER oleh fungsi di bawah.
--   * Tabel ditutup total (RLS aktif tanpa policy, hak anon dicabut);
--     satu-satunya pintu adalah fungsi RPC sppd_*.
--
--  KODE SETUP tidak lagi ditulis di file ini (agar file aman disimpan di
--  GitHub). Setelah menjalankan file ini, jalankan SATU baris berikut di
--  SQL Editor dengan kode rahasia Anda sendiri (min. 16 karakter):
--
--      select public.sppd_set_setup('tulis-kode-rahasia-anda-di-sini');
--
--  Kode itu diminta saat membuat akun Administrator pertama.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Tabel ----------
create table if not exists public.sppd_meta (
  id          int primary key default 1 check (id = 1),
  setup_hash  text not null,
  pepper      text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  setup_fails int  not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.sppd_users (
  id         text primary key check (id ~ '^[a-z0-9]{4,40}$'),
  u          text not null unique check (u ~ '^[a-z0-9._-]{3,30}$'),
  role       text not null check (role in ('admin','operator','viewer')),
  aktif      boolean not null default true,
  salt       text, it int, wiv text, wk text,       -- kunci data terbungkus (tidak bisa dibuka tanpa kata sandi)
  ah         text,                                  -- sha256(kunci otentikasi); null = perlu atur ulang sandi
  fails      int not null default 0,                -- (tidak dipakai lagi sejak v1.2, lihat sppd_fails)
  lv         int not null default 0,
  lock_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.sppd_sessions (
  th         text primary key,                      -- sha256(token); token asli hanya ada di browser
  uid        text not null references public.sppd_users(id) on delete cascade,
  exp        timestamptz not null,                  -- batas mutlak 10 jam
  idle       timestamptz not null,                  -- batas tidak aktif 20 menit
  created_at timestamptz not null default now()
);

create sequence if not exists public.sppd_ver;

create table if not exists public.sppd_rows (
  k          text primary key check (k ~ '^[a-z]{2,6}(:[a-z0-9]{4,40})?$'),
  v          text,                                  -- ciphertext (JSON {v,z,iv,ct})
  del        boolean not null default false,
  ver        bigint not null,
  by_uid     text,
  updated_at timestamptz not null default now()
);
create index if not exists sppd_rows_ver on public.sppd_rows (ver);

create table if not exists public.sppd_audit (
  id   bigserial primary key,
  at   timestamptz not null default now(),
  uid  text, act text, info text
);

-- v1.2: percobaan masuk dihitung per (username, alamat IP) → orang lain tidak bisa
-- mengunci akun seseorang hanya dengan menebak sandi dari jaringan berbeda.
create table if not exists public.sppd_fails (
  u          text not null,
  ip         text not null,
  fails      int  not null default 0,
  lv         int  not null default 0,
  lock_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (u, ip)
);

-- v1.2: nomor SPPD yang sudah dipakai (hanya hash) → nomor tidak bisa kembar antar perangkat.
create table if not exists public.sppd_nums (
  h      text primary key check (h ~ '^[a-f0-9]{64}$'),
  by_uid text,
  at     timestamptz not null default now()
);

-- ---------- Kunci akses langsung ----------
alter table public.sppd_meta     enable row level security;
alter table public.sppd_users    enable row level security;
alter table public.sppd_sessions enable row level security;
alter table public.sppd_rows     enable row level security;
alter table public.sppd_audit    enable row level security;
alter table public.sppd_fails    enable row level security;
alter table public.sppd_nums     enable row level security;
revoke all on public.sppd_meta, public.sppd_users, public.sppd_sessions, public.sppd_rows, public.sppd_audit, public.sppd_fails, public.sppd_nums from anon, authenticated;
revoke all on sequence public.sppd_ver from anon, authenticated;

-- Fungsi versi lama (tanda tangan berubah di v1.2). Klien lama yang masih tersimpan di
-- cache browser akan gagal sinkron (bukan merusak data) sampai halaman dimuat ulang.
drop function if exists public.sppd_pull(text, bigint);
drop function if exists public.sppd_push(text, json);

-- ---------- Fungsi bantu (internal) ----------
create or replace function public.sppd_h(t text) returns text
language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(t, 'sha256'), 'hex')
$$;

-- Alamat IP pemanggil (dari header yang diisi gateway Supabase); '-' bila tidak tersedia.
create or replace function public.sppd_ip() returns text
language plpgsql stable set search_path = public as $$
declare h text;
begin
  begin
    h := current_setting('request.headers', true)::json->>'x-forwarded-for';
  exception when others then h := null;
  end;
  return left(coalesce(nullif(trim(split_part(coalesce(h, ''), ',', 1)), ''), '-'), 60);
end $$;

create or replace function public.sppd_sess(p_t text) returns public.sppd_users
language plpgsql security definer set search_path = public, extensions as $$
declare s public.sppd_sessions; usr public.sppd_users;
begin
  if p_t is null or length(p_t) <> 64 then raise exception 'SESI' using errcode = '28000'; end if;
  select * into s from public.sppd_sessions where th = public.sppd_h(p_t);
  if not found or s.exp < now() or s.idle < now() then raise exception 'SESI' using errcode = '28000'; end if;
  select * into usr from public.sppd_users where id = s.uid;
  if not found or not usr.aktif then raise exception 'SESI' using errcode = '28000'; end if;
  update public.sppd_sessions set idle = least(exp, now() + interval '20 minutes') where th = s.th;
  return usr;
end $$;

create or replace function public.sppd_newsess(p_uid text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare tok text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  delete from public.sppd_sessions where exp < now() or idle < now();
  delete from public.sppd_fails where updated_at < now() - interval '2 days';
  delete from public.sppd_audit where at < now() - interval '400 days';
  insert into public.sppd_sessions (th, uid, exp, idle) values (public.sppd_h(tok), p_uid, now() + interval '10 hours', now() + interval '20 minutes');
  return tok;
end $$;

create or replace function public.sppd_ujson(usr public.sppd_users) returns json
language sql stable as $$
  select json_build_object('id', usr.id, 'u', usr.u, 'role', usr.role, 'salt', usr.salt, 'it', usr.it, 'wiv', usr.wiv, 'wk', usr.wk, 'kv', 3)
$$;

-- Mengatur / mengganti kode setup. HANYA dari SQL Editor (tidak bisa dipanggil lewat API).
create or replace function public.sppd_set_setup(p_code text) returns text
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_code is null or length(p_code) < 16 then raise exception 'Kode setup minimal 16 karakter'; end if;
  update public.sppd_meta set setup_hash = public.sppd_h(p_code), setup_fails = 0 where id = 1;
  return 'Kode setup tersimpan';
end $$;

-- ---------- API publik ----------
-- Status: sudah ada administrator atau belum
create or replace function public.sppd_status() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('ok', true, 'api', 2, 'ready', exists (select 1 from public.sppd_users))
$$;

-- Salt untuk turunan kunci. Username tak dikenal tetap mendapat salt palsu yang konsisten (anti enumerasi).
create or replace function public.sppd_salt(p_u text) returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare usr public.sppd_users; pep text;
begin
  select * into usr from public.sppd_users where u = lower(p_u) and ah is not null;
  if found then return json_build_object('salt', usr.salt, 'it', usr.it); end if;
  select pepper into pep from public.sppd_meta where id = 1;
  return json_build_object('salt', encode(substr(extensions.hmac(lower(coalesce(p_u, '')), coalesce(pep, 'x'), 'sha256'), 1, 16), 'base64'), 'it', 600000);
end $$;

-- Membuat Administrator pertama (hanya bila belum ada pengguna & kode setup benar)
create or replace function public.sppd_setup(p_code text, p_user json) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare m public.sppd_meta; nid text := p_user->>'id';
begin
  select * into m from public.sppd_meta where id = 1 for update;      -- kunci dulu: dua setup bersamaan tidak bisa lolos
  if not found then return json_build_object('ok', false, 'err', 'meta'); end if;
  if exists (select 1 from public.sppd_users) then return json_build_object('ok', false, 'err', 'sudah'); end if;
  if m.setup_fails >= 20 then return json_build_object('ok', false, 'err', 'kunci'); end if;
  if public.sppd_h(coalesce(p_code, '')) <> m.setup_hash then
    update public.sppd_meta set setup_fails = setup_fails + 1 where id = 1;
    return json_build_object('ok', false, 'err', 'kode');
  end if;
  insert into public.sppd_users (id, u, role, aktif, salt, it, wiv, wk, ah)
  values (nid, lower(p_user->>'u'), 'admin', true, left(p_user->>'salt', 64), (p_user->>'it')::int, left(p_user->>'wiv', 64), left(p_user->>'wk', 200), public.sppd_h(p_user->>'ah'));
  insert into public.sppd_audit (uid, act, info) values (nid, 'setup', public.sppd_ip());
  return json_build_object('ok', true, 'token', public.sppd_newsess(nid));
end $$;

-- Login: verifikasi hash kunci otentikasi + lockout bertahap per (username, IP).
-- Username yang tidak ada diperlakukan sama persis (ikut terkunci) → tidak bisa dipakai menebak username.
create or replace function public.sppd_login(p_u text, p_ah text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare usr public.sppd_users; f public.sppd_fails; un text := left(lower(coalesce(p_u, '')), 30); addr text := public.sppd_ip(); ada boolean;
begin
  select * into f from public.sppd_fails where u = un and ip = addr for update;
  if found and f.lock_until is not null and f.lock_until > now() then
    return json_build_object('ok', false, 'err', 'lock', 'menit', ceil(extract(epoch from f.lock_until - now()) / 60));
  end if;
  select * into usr from public.sppd_users where u = un;
  ada := found;
  if not ada or usr.ah is null or public.sppd_h(coalesce(p_ah, '')) <> usr.ah then
    insert into public.sppd_fails (u, ip, fails) values (un, addr, 1)
    on conflict (u, ip) do update set fails = public.sppd_fails.fails + 1, updated_at = now() returning * into f;
    if f.fails >= 5 then
      update public.sppd_fails set fails = 0, lv = least(lv + 1, 6), lock_until = now() + interval '5 minutes' * power(2, least(lv + 1, 6) - 1), updated_at = now() where u = un and ip = addr;
    end if;
    if ada then insert into public.sppd_audit (uid, act, info) values (usr.id, 'login-gagal', addr); end if;
    return json_build_object('ok', false, 'err', 'auth');
  end if;
  if not usr.aktif then return json_build_object('ok', false, 'err', 'off'); end if;
  delete from public.sppd_fails where u = un and ip = addr;
  insert into public.sppd_audit (uid, act, info) values (usr.id, 'login', addr);
  return json_build_object('ok', true, 'token', public.sppd_newsess(usr.id), 'user', public.sppd_ujson(usr));
end $$;

create or replace function public.sppd_logout(p_t text) returns json
language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from public.sppd_sessions where th = public.sppd_h(coalesce(p_t, ''));
  return json_build_object('ok', true);
end $$;

-- Data sesi (untuk memulihkan sesi setelah muat ulang)
create or replace function public.sppd_me(p_t text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare usr public.sppd_users := public.sppd_sess(p_t);
begin return json_build_object('ok', true, 'user', public.sppd_ujson(usr)); end $$;

-- Ambil perubahan sejak versi tertentu — berhalaman (maks. p_lim baris / ±6 MB per panggilan).
-- 'more' = true → panggil lagi dengan p_since = 'ver' yang dikembalikan.
create or replace function public.sppd_pull(p_t text, p_since bigint, p_lim int) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare usr public.sppd_users := public.sppd_sess(p_t); lim int := least(greatest(coalesce(p_lim, 500), 1), 2000); since bigint := coalesce(p_since, 0); res json; last bigint; mx bigint;
begin
  with c as (
    select k, v, del, ver, sum(coalesce(length(v), 0) + 100) over (order by ver) - (coalesce(length(v), 0) + 100) as sebelum
    from public.sppd_rows where ver > since order by ver limit lim
  ), p as (select * from c where sebelum < 6000000)
  select coalesce(json_agg(json_build_object('k', k, 'v', v, 'd', del, 'ver', ver) order by ver), '[]'::json), max(ver) into res, last from p;
  select coalesce(max(ver), 0) into mx from public.sppd_rows;
  return json_build_object('ok', true, 'role', usr.role, 'ver', coalesce(last, mx), 'more', last is not null and last < mx, 'rows', res);
end $$;

-- Ambil baris tertentu (dipakai saat menyelesaikan bentrok penyuntingan)
create or replace function public.sppd_get(p_t text, p_keys json) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare usr public.sppd_users := public.sppd_sess(p_t);
begin
  if json_typeof(p_keys) <> 'array' or json_array_length(p_keys) > 500 then raise exception 'DATA' using errcode = '22023'; end if;
  return json_build_object('ok', true, 'rows', coalesce((select json_agg(json_build_object('k', k, 'v', v, 'd', del, 'ver', ver)) from public.sppd_rows
    where k in (select json_array_elements_text(p_keys))), '[]'::json));
end $$;

-- Simpan perubahan.
--  * Hak akses diperiksa per koleksi sesuai peran.
--  * Kunci optimistis: tiap baris membawa 'b' = versi yang terakhir dilihat klien. Bila baris di server
--    sudah berubah (versi berbeda) baris itu TIDAK ditimpa dan dilaporkan di 'conflicts' → klien menggabungkan.
--  * Semua push diserialkan (advisory lock) sehingga urutan versi = urutan commit; pull tidak bisa melewatkan baris.
--  * Log aktivitas: hanya boleh menulis catatan milik sendiri untuk hari ini (±1 hari), tidak bisa dihapus.
create or replace function public.sppd_push(p_t text, p_rows json, p_api int) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare usr public.sppd_users := public.sppd_sess(p_t); r json; key text; col text; ex public.sppd_rows; ada boolean;
  n int := 0; skip int := 0; d boolean; b bigint; nv bigint; vers jsonb := '{}'::jsonb; conf jsonb := '[]'::jsonb; hari date := (now() at time zone 'utc')::date;
begin
  if coalesce(p_api, 0) < 2 then raise exception 'VERSI' using errcode = '22023'; end if;
  if json_typeof(p_rows) <> 'array' or json_array_length(p_rows) > 3000 then raise exception 'DATA' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(778201);
  for r in select value from json_array_elements(p_rows) loop
    key := r->>'k'; col := split_part(key, ':', 1); d := coalesce((r->>'d')::boolean, false); b := (r->>'b')::bigint;
    if key is null or key !~ '^[a-z]{2,6}(:[a-z0-9]{4,40})?$' or col <> all (array['emp','prog','sppd','rep','ph','log','cfg','acl','img']) then raise exception 'KUNCI' using errcode = '22023'; end if;
    if not (usr.role = 'admin' or col = 'log' or (usr.role = 'operator' and col in ('emp','prog','sppd','rep','ph'))) then raise exception 'AKSES' using errcode = '42501'; end if;
    if length(coalesce(r->>'v', '')) > 4000000 then raise exception 'BESAR' using errcode = '22023'; end if;
    if col = 'log' then
      if d or key not in ('log:' || left(usr.id, 20) || to_char(hari - 1, 'YYYYMMDD'), 'log:' || left(usr.id, 20) || to_char(hari, 'YYYYMMDD'), 'log:' || left(usr.id, 20) || to_char(hari + 1, 'YYYYMMDD')) then
        skip := skip + 1; continue;
      end if;
      b := null;
    end if;
    select * into ex from public.sppd_rows where k = key for update;
    ada := found;
    if ada and b is not null and ex.ver <> b then conf := conf || to_jsonb(key); continue; end if;
    nv := nextval('public.sppd_ver');
    insert into public.sppd_rows (k, v, del, ver, by_uid) values (key, case when d then null else r->>'v' end, d, nv, usr.id)
    on conflict (k) do update set v = excluded.v, del = excluded.del, ver = excluded.ver, by_uid = excluded.by_uid, updated_at = now();
    vers := vers || jsonb_build_object(key, nv);
    n := n + 1;
  end loop;
  return json_build_object('ok', true, 'n', n, 'skip', skip, 'vers', vers, 'conflicts', conf, 'ver', (select coalesce(max(ver), 0) from public.sppd_rows));
end $$;

-- Nomor SPPD unik: klaim hash nomor baru (dan lepas yang lama). {ok:false, err:'dipakai'} bila sudah dipakai.
create or replace function public.sppd_no_claim(p_t text, p_new text, p_old text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare usr public.sppd_users := public.sppd_sess(p_t); c int;
begin
  if usr.role not in ('admin', 'operator') then raise exception 'AKSES' using errcode = '42501'; end if;
  if p_new is not null and p_new is distinct from p_old then
    if p_new !~ '^[a-f0-9]{64}$' then raise exception 'DATA' using errcode = '22023'; end if;
    insert into public.sppd_nums (h, by_uid) values (p_new, usr.id) on conflict (h) do nothing;
    get diagnostics c = row_count;
    if c = 0 then return json_build_object('ok', false, 'err', 'dipakai'); end if;
  end if;
  if p_old is not null and p_old is distinct from p_new then delete from public.sppd_nums where h = p_old; end if;
  return json_build_object('ok', true);
end $$;

-- Menyamakan daftar nomor terpakai dengan isi data (setelah restore / unggah data lokal). Khusus Administrator.
create or replace function public.sppd_no_reset(p_t text, p_h json) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare usr public.sppd_users := public.sppd_sess(p_t);
begin
  if usr.role <> 'admin' then raise exception 'AKSES' using errcode = '42501'; end if;
  if json_typeof(p_h) <> 'array' or json_array_length(p_h) > 50000 then raise exception 'DATA' using errcode = '22023'; end if;
  delete from public.sppd_nums;
  insert into public.sppd_nums (h, by_uid) select distinct x, usr.id from json_array_elements_text(p_h) x where x ~ '^[a-f0-9]{64}$';
  return json_build_object('ok', true);
end $$;

-- Manajemen pengguna (khusus Administrator)
create or replace function public.sppd_user_list(p_t text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare usr public.sppd_users := public.sppd_sess(p_t);
begin
  if usr.role <> 'admin' then raise exception 'AKSES' using errcode = '42501'; end if;
  return coalesce((select json_agg(json_build_object('id', x.id, 'u', x.u, 'role', x.role, 'aktif', x.aktif, 'auth', x.ah is not null,
    'lock', exists (select 1 from public.sppd_fails f where f.u = x.u and f.lock_until > now())) order by x.u) from public.sppd_users x), '[]'::json);
end $$;

create or replace function public.sppd_user_put(p_t text, p json) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare usr public.sppd_users := public.sppd_sess(p_t); nid text := p->>'id'; nrole text := p->>'role'; non boolean := coalesce((p->>'aktif')::boolean, true);
begin
  if usr.role <> 'admin' then raise exception 'AKSES' using errcode = '42501'; end if;
  if nrole not in ('admin','operator','viewer') then raise exception 'PERAN' using errcode = '22023'; end if;
  if exists (select 1 from public.sppd_users where id = nid) then
    update public.sppd_users set role = nrole, aktif = non, updated_at = now() where id = nid;
    if p->>'ah' is not null then
      update public.sppd_users set salt = left(p->>'salt', 64), it = (p->>'it')::int, wiv = left(p->>'wiv', 64), wk = left(p->>'wk', 200), ah = public.sppd_h(p->>'ah'), fails = 0, lv = 0, lock_until = null where id = nid;
      delete from public.sppd_fails where u = (select u from public.sppd_users where id = nid);     -- atur ulang sandi = buka kunci
      if nid <> usr.id then delete from public.sppd_sessions where uid = nid; end if;
    end if;
    if not non then delete from public.sppd_sessions where uid = nid; end if;
  else
    if p->>'ah' is null then raise exception 'SANDI' using errcode = '22023'; end if;
    insert into public.sppd_users (id, u, role, aktif, salt, it, wiv, wk, ah)
    values (nid, lower(p->>'u'), nrole, non, left(p->>'salt', 64), (p->>'it')::int, left(p->>'wiv', 64), left(p->>'wk', 200), public.sppd_h(p->>'ah'));
  end if;
  if (select count(*) from public.sppd_users where role = 'admin' and aktif) = 0 then raise exception 'ADMIN' using errcode = '22023'; end if;
  insert into public.sppd_audit (uid, act, info) values (usr.id, 'user-put', nid || ':' || nrole || case when non then '' else ':nonaktif' end || case when p->>'ah' is not null then ':sandi' else '' end);
  return json_build_object('ok', true);
end $$;

create or replace function public.sppd_user_del(p_t text, p_id text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare usr public.sppd_users := public.sppd_sess(p_t); nm text;
begin
  if usr.role <> 'admin' or p_id = usr.id then raise exception 'AKSES' using errcode = '42501'; end if;
  select u into nm from public.sppd_users where id = p_id;
  delete from public.sppd_users where id = p_id;
  if (select count(*) from public.sppd_users where role = 'admin' and aktif) = 0 then raise exception 'ADMIN' using errcode = '22023'; end if;
  insert into public.sppd_audit (uid, act, info) values (usr.id, 'user-del', coalesce(nm, p_id));
  return json_build_object('ok', true);
end $$;

-- Ganti kata sandi sendiri (memerlukan kunci otentikasi lama)
create or replace function public.sppd_pw(p_t text, p_old text, p json) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare usr public.sppd_users := public.sppd_sess(p_t);
begin
  if usr.ah is null or public.sppd_h(coalesce(p_old, '')) <> usr.ah then return json_build_object('ok', false, 'err', 'auth'); end if;
  update public.sppd_users set salt = left(p->>'salt', 64), it = (p->>'it')::int, wiv = left(p->>'wiv', 64), wk = left(p->>'wk', 200), ah = public.sppd_h(p->>'ah'), updated_at = now() where id = usr.id;
  delete from public.sppd_sessions where uid = usr.id and th <> public.sppd_h(p_t);
  insert into public.sppd_audit (uid, act) values (usr.id, 'ganti-sandi');
  return json_build_object('ok', true);
end $$;

-- Jejak audit server (login, login gagal, perubahan pengguna, ganti sandi). Khusus Administrator.
create or replace function public.sppd_audit_list(p_t text, p_lim int) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare usr public.sppd_users := public.sppd_sess(p_t);
begin
  if usr.role <> 'admin' then raise exception 'AKSES' using errcode = '42501'; end if;
  return coalesce((select json_agg(json_build_object('at', q.at, 'u', coalesce(q.u, q.uid), 'act', q.act, 'info', q.info) order by q.id desc)
    from (select a.id, a.at, a.uid, a.act, a.info, x.u from public.sppd_audit a left join public.sppd_users x on x.id = a.uid
          order by a.id desc limit least(greatest(coalesce(p_lim, 200), 1), 1000)) q), '[]'::json);
end $$;

-- ---------- Hak eksekusi ----------
-- Hanya fungsi sppd_* yang diubah haknya (tidak mengganggu aplikasi lain di project yang sama)
revoke execute on function public.sppd_h(text), public.sppd_ip(), public.sppd_sess(text), public.sppd_newsess(text), public.sppd_ujson(public.sppd_users), public.sppd_set_setup(text),
  public.sppd_status(), public.sppd_salt(text), public.sppd_setup(text, json), public.sppd_login(text, text),
  public.sppd_logout(text), public.sppd_me(text), public.sppd_pull(text, bigint, int), public.sppd_get(text, json), public.sppd_push(text, json, int),
  public.sppd_no_claim(text, text, text), public.sppd_no_reset(text, json), public.sppd_audit_list(text, int),
  public.sppd_user_list(text), public.sppd_user_put(text, json), public.sppd_user_del(text, text), public.sppd_pw(text, text, json)
  from public, anon, authenticated;
grant execute on function public.sppd_status(), public.sppd_salt(text), public.sppd_setup(text, json), public.sppd_login(text, text),
  public.sppd_logout(text), public.sppd_me(text), public.sppd_pull(text, bigint, int), public.sppd_get(text, json), public.sppd_push(text, json, int),
  public.sppd_no_claim(text, text, text), public.sppd_no_reset(text, json), public.sppd_audit_list(text, int),
  public.sppd_user_list(text), public.sppd_user_put(text, json), public.sppd_user_del(text, text), public.sppd_pw(text, text, json)
  to anon, authenticated;

-- ---------- Baris meta ----------
-- Pemasangan baru: kode setup diisi nilai acak (setup terkunci) sampai Anda menjalankan
--   select public.sppd_set_setup('kode-rahasia-anda');
-- Pembaruan dari v1.1: baris lama (beserta kode setup lama) dipertahankan.
insert into public.sppd_meta (id, setup_hash)
values (1, public.sppd_h(encode(extensions.gen_random_bytes(32), 'hex')))
on conflict (id) do nothing;
