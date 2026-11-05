-- =====================================================================
--  SIM Pegawai & SPPD — Penyimpanan Cloud (Supabase)  v3.0
--  Jalankan SEKALI di Supabase → SQL Editor → New query → Run.
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
--  !!! WAJIB: ganti 'GANTI-DENGAN-KODE-SETUP-RAHASIA' di bagian paling bawah
--      dengan kode rahasia Anda sendiri (min. 16 karakter). Kode ini diminta
--      saat membuat akun Administrator pertama.
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
  fails      int not null default 0,
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

-- ---------- Kunci akses langsung ----------
alter table public.sppd_meta     enable row level security;
alter table public.sppd_users    enable row level security;
alter table public.sppd_sessions enable row level security;
alter table public.sppd_rows     enable row level security;
alter table public.sppd_audit    enable row level security;
revoke all on public.sppd_meta, public.sppd_users, public.sppd_sessions, public.sppd_rows, public.sppd_audit from anon, authenticated;
revoke all on sequence public.sppd_ver from anon, authenticated;

-- ---------- Fungsi bantu (internal) ----------
create or replace function public.sppd_h(t text) returns text
language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(t, 'sha256'), 'hex')
$$;

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
  insert into public.sppd_sessions (th, uid, exp, idle) values (public.sppd_h(tok), p_uid, now() + interval '10 hours', now() + interval '20 minutes');
  return tok;
end $$;

create or replace function public.sppd_ujson(usr public.sppd_users) returns json
language sql stable as $$
  select json_build_object('id', usr.id, 'u', usr.u, 'role', usr.role, 'salt', usr.salt, 'it', usr.it, 'wiv', usr.wiv, 'wk', usr.wk, 'kv', 3)
$$;

-- ---------- API publik ----------
-- Status: sudah ada administrator atau belum
create or replace function public.sppd_status() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('ok', true, 'ready', exists (select 1 from public.sppd_users))
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
  if exists (select 1 from public.sppd_users) then return json_build_object('ok', false, 'err', 'sudah'); end if;
  select * into m from public.sppd_meta where id = 1 for update;
  if not found then return json_build_object('ok', false, 'err', 'meta'); end if;
  if m.setup_fails >= 20 then return json_build_object('ok', false, 'err', 'kunci'); end if;
  if public.sppd_h(coalesce(p_code, '')) <> m.setup_hash then
    update public.sppd_meta set setup_fails = setup_fails + 1 where id = 1;
    perform pg_sleep(1);
    return json_build_object('ok', false, 'err', 'kode');
  end if;
  insert into public.sppd_users (id, u, role, aktif, salt, it, wiv, wk, ah)
  values (nid, lower(p_user->>'u'), 'admin', true, p_user->>'salt', (p_user->>'it')::int, p_user->>'wiv', p_user->>'wk', public.sppd_h(p_user->>'ah'));
  insert into public.sppd_audit (uid, act) values (nid, 'setup');
  return json_build_object('ok', true, 'token', public.sppd_newsess(nid));
end $$;

-- Login: verifikasi hash kunci otentikasi + lockout bertahap
create or replace function public.sppd_login(p_u text, p_ah text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare usr public.sppd_users;
begin
  select * into usr from public.sppd_users where u = lower(p_u) for update;
  if not found then perform pg_sleep(0.4); return json_build_object('ok', false, 'err', 'auth'); end if;
  if usr.lock_until is not null and usr.lock_until > now() then
    return json_build_object('ok', false, 'err', 'lock', 'menit', ceil(extract(epoch from usr.lock_until - now()) / 60));
  end if;
  if usr.ah is null or public.sppd_h(coalesce(p_ah, '')) <> usr.ah then
    update public.sppd_users set fails = fails + 1 where id = usr.id returning * into usr;
    if usr.fails >= 5 then
      update public.sppd_users set fails = 0, lv = least(lv + 1, 6), lock_until = now() + interval '5 minutes' * power(2, least(lv + 1, 6) - 1) where id = usr.id;
    end if;
    insert into public.sppd_audit (uid, act) values (usr.id, 'login-gagal');
    return json_build_object('ok', false, 'err', 'auth');
  end if;
  if not usr.aktif then return json_build_object('ok', false, 'err', 'off'); end if;
  update public.sppd_users set fails = 0, lv = 0, lock_until = null where id = usr.id;
  insert into public.sppd_audit (uid, act) values (usr.id, 'login');
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

-- Ambil perubahan sejak versi tertentu
create or replace function public.sppd_pull(p_t text, p_since bigint) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare usr public.sppd_users := public.sppd_sess(p_t);
begin
  return json_build_object('ok', true, 'role', usr.role,
    'ver', (select coalesce(max(ver), 0) from public.sppd_rows),
    'rows', coalesce((select json_agg(json_build_object('k', k, 'v', v, 'd', del, 'ver', ver) order by ver) from public.sppd_rows where ver > coalesce(p_since, 0)), '[]'::json));
end $$;

-- Simpan perubahan (hak akses diperiksa per koleksi sesuai peran)
create or replace function public.sppd_push(p_t text, p_rows json) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare usr public.sppd_users := public.sppd_sess(p_t); r json; key text; col text; ex public.sppd_rows; n int := 0; skip int := 0; d boolean;
begin
  if json_typeof(p_rows) <> 'array' or json_array_length(p_rows) > 3000 then raise exception 'DATA' using errcode = '22023'; end if;
  for r in select value from json_array_elements(p_rows) loop
    key := r->>'k'; col := split_part(key, ':', 1); d := coalesce((r->>'d')::boolean, false);
    if key is null or key !~ '^[a-z]{2,6}(:[a-z0-9]{4,40})?$' or col <> all (array['emp','prog','sppd','rep','log','cfg','acl']) then raise exception 'KUNCI' using errcode = '22023'; end if;
    if not (usr.role = 'admin' or col = 'log' or (usr.role = 'operator' and col in ('emp','prog','sppd','rep'))) then raise exception 'AKSES' using errcode = '42501'; end if;
    if length(coalesce(r->>'v', '')) > 4000000 then raise exception 'BESAR' using errcode = '22023'; end if;
    if col = 'log' and usr.role <> 'admin' then
      select * into ex from public.sppd_rows where k = key;
      if found and ex.by_uid is distinct from usr.id then skip := skip + 1; continue; end if;
    end if;
    insert into public.sppd_rows (k, v, del, ver, by_uid) values (key, case when d then null else r->>'v' end, d, nextval('public.sppd_ver'), usr.id)
    on conflict (k) do update set v = excluded.v, del = excluded.del, ver = excluded.ver, by_uid = excluded.by_uid, updated_at = now();
    n := n + 1;
  end loop;
  return json_build_object('ok', true, 'n', n, 'skip', skip, 'ver', (select coalesce(max(ver), 0) from public.sppd_rows));
end $$;

-- Manajemen pengguna (khusus Administrator)
create or replace function public.sppd_user_list(p_t text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare usr public.sppd_users := public.sppd_sess(p_t);
begin
  if usr.role <> 'admin' then raise exception 'AKSES' using errcode = '42501'; end if;
  return coalesce((select json_agg(json_build_object('id', id, 'u', u, 'role', role, 'aktif', aktif, 'auth', ah is not null, 'lock', lock_until > now()) order by u) from public.sppd_users), '[]'::json);
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
      update public.sppd_users set salt = p->>'salt', it = (p->>'it')::int, wiv = p->>'wiv', wk = p->>'wk', ah = public.sppd_h(p->>'ah'), fails = 0, lv = 0, lock_until = null where id = nid;
      if nid <> usr.id then delete from public.sppd_sessions where uid = nid; end if;
    end if;
    if not non then delete from public.sppd_sessions where uid = nid; end if;
  else
    if p->>'ah' is null then raise exception 'SANDI' using errcode = '22023'; end if;
    insert into public.sppd_users (id, u, role, aktif, salt, it, wiv, wk, ah)
    values (nid, lower(p->>'u'), nrole, non, p->>'salt', (p->>'it')::int, p->>'wiv', p->>'wk', public.sppd_h(p->>'ah'));
  end if;
  if (select count(*) from public.sppd_users where role = 'admin' and aktif) = 0 then raise exception 'ADMIN' using errcode = '22023'; end if;
  insert into public.sppd_audit (uid, act, info) values (usr.id, 'user-put', nid || ':' || nrole);
  return json_build_object('ok', true);
end $$;

create or replace function public.sppd_user_del(p_t text, p_id text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare usr public.sppd_users := public.sppd_sess(p_t);
begin
  if usr.role <> 'admin' or p_id = usr.id then raise exception 'AKSES' using errcode = '42501'; end if;
  delete from public.sppd_users where id = p_id;
  if (select count(*) from public.sppd_users where role = 'admin' and aktif) = 0 then raise exception 'ADMIN' using errcode = '22023'; end if;
  insert into public.sppd_audit (uid, act, info) values (usr.id, 'user-del', p_id);
  return json_build_object('ok', true);
end $$;

-- Ganti kata sandi sendiri (memerlukan kunci otentikasi lama)
create or replace function public.sppd_pw(p_t text, p_old text, p json) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare usr public.sppd_users := public.sppd_sess(p_t);
begin
  if usr.ah is null or public.sppd_h(coalesce(p_old, '')) <> usr.ah then return json_build_object('ok', false, 'err', 'auth'); end if;
  update public.sppd_users set salt = p->>'salt', it = (p->>'it')::int, wiv = p->>'wiv', wk = p->>'wk', ah = public.sppd_h(p->>'ah'), updated_at = now() where id = usr.id;
  delete from public.sppd_sessions where uid = usr.id and th <> public.sppd_h(p_t);
  insert into public.sppd_audit (uid, act) values (usr.id, 'ganti-sandi');
  return json_build_object('ok', true);
end $$;

-- ---------- Hak eksekusi ----------
-- Hanya fungsi sppd_* yang diubah haknya (tidak mengganggu aplikasi lain di project yang sama)
revoke execute on function public.sppd_h(text), public.sppd_sess(text), public.sppd_newsess(text), public.sppd_ujson(public.sppd_users),
  public.sppd_status(), public.sppd_salt(text), public.sppd_setup(text, json), public.sppd_login(text, text),
  public.sppd_logout(text), public.sppd_me(text), public.sppd_pull(text, bigint), public.sppd_push(text, json),
  public.sppd_user_list(text), public.sppd_user_put(text, json), public.sppd_user_del(text, text), public.sppd_pw(text, text, json)
  from public, anon, authenticated;
grant execute on function public.sppd_status(), public.sppd_salt(text), public.sppd_setup(text, json), public.sppd_login(text, text),
  public.sppd_logout(text), public.sppd_me(text), public.sppd_pull(text, bigint), public.sppd_push(text, json),
  public.sppd_user_list(text), public.sppd_user_put(text, json), public.sppd_user_del(text, text), public.sppd_pw(text, text, json)
  to anon, authenticated;

-- ---------- KODE SETUP (GANTI!) ----------
insert into public.sppd_meta (id, setup_hash)
values (1, public.sppd_h('GANTI-DENGAN-KODE-SETUP-RAHASIA'))
on conflict (id) do nothing;
-- Untuk mengganti kode setup nanti:
--   update public.sppd_meta set setup_hash = public.sppd_h('kode-baru'), setup_fails = 0 where id = 1;
