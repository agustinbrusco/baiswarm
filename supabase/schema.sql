-- BAISWARM · esquema v2: login con Supabase Auth (usuario + contraseña), código de invitación y RLS.
-- Pegá todo en el SQL Editor y ejecutalo. Se puede correr más de una vez.
--
-- Requisito previo en el panel: Authentication → Sign In / Providers → Email → "Confirm email" desactivado.
-- Después de correrlo: `npm run invite -- --nuevo` genera y fija el código de invitación (necesita SUPABASE_SECRET_KEY en .env).
--
-- Modelo: el usuario elige un nombre de usuario; el mail de Auth es <usuario>@baiswarm.local. Un trigger valida el código
-- de invitación al registrarse y crea la fila en profiles. Solo usuarios con sesión leen y escriben; editar y borrar un post
-- es del autor; votar, sumarse, comentar y vincular pasa por funciones que usan auth.uid(), así nadie firma por otro.

-- ── posts ───────────────────────────────────────────────────────────────────
create table if not exists public.posts (
  id        text primary key,
  kind      text not null default 'proyecto',   -- 'proyecto' | 'insight'
  title     text not null,
  pitch     text not null default '',
  body      text not null default '',
  url       text not null default '',
  track     text not null default 'General',
  author    text not null,                      -- username, lo fija el trigger
  links     jsonb not null default '[]',        -- [{to, type}]
  votes     jsonb not null default '{}',        -- {uid: 1 | -1}
  interest  jsonb not null default '[]',        -- [{id: uid, name, role}]  (solo proyectos)
  comments  jsonb not null default '[]',        -- [{id, uid, who, text, t, parent, deleted?}]
  t         bigint not null                     -- creación, ms desde epoch
);
alter table public.posts add column if not exists author_id uuid references auth.users(id) on delete set null;
create index if not exists posts_author_id_idx on public.posts (author_id);

-- ── profiles: uno por usuario, lo crea el trigger de registro ──────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text not null unique check (username ~ '^[a-z0-9][a-z0-9._-]{1,23}$'),
  role       text not null default '',          -- perfil en texto libre
  created_at timestamptz not null default now()
);

-- ── settings: privada, solo la leen funciones security definer ─────────────
create table if not exists public.settings (key text primary key, value text not null);
insert into public.settings (key, value) values ('invite', 'CAMBIAME') on conflict (key) do nothing;
revoke all on public.settings from anon, authenticated;

-- ── Permisos de tabla (desde abril de 2026 las tablas nuevas no se exponen solas a la API) ──
grant select, insert, update, delete on public.posts to authenticated;
revoke all on public.posts from anon;
grant select on public.profiles to authenticated;
revoke all on public.profiles from anon;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.posts    enable row level security;
alter table public.profiles enable row level security;
alter table public.settings enable row level security;

drop policy if exists "anon select" on public.posts;
drop policy if exists "anon insert" on public.posts;
drop policy if exists "anon update" on public.posts;
drop policy if exists "anon delete" on public.posts;
drop policy if exists "posts select"     on public.posts;
drop policy if exists "posts insert own" on public.posts;
drop policy if exists "posts update own" on public.posts;
drop policy if exists "posts delete own" on public.posts;
-- todos los miembros leen todo: es un foro
create policy "posts select"     on public.posts for select to authenticated using (true);
create policy "posts insert own" on public.posts for insert to authenticated with check (author_id = (select auth.uid()));
create policy "posts update own" on public.posts for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "posts delete own" on public.posts for delete to authenticated using (author_id = (select auth.uid()));

drop policy if exists "profiles select"     on public.profiles;
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles select"     on public.profiles for select to authenticated using (true);
create policy "profiles update own" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- el usuario solo puede cambiar su perfil, no su username (está atado al mail de login).
-- Supabase da UPDATE de tabla por defecto: hay que revocarlo antes de dar el permiso por columna.
revoke update on public.profiles from authenticated;
grant update (role) on public.profiles to authenticated;

-- ── Registro: valida el código de invitación y crea el perfil ──────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_invite   text := (select value from public.settings where key = 'invite');
  v_username text := lower(trim(new.raw_user_meta_data->>'username'));
begin
  if v_invite is null or v_invite = 'CAMBIAME' then
    raise exception 'El código de invitación no está configurado';
  end if;
  if (new.raw_user_meta_data->>'invite') is distinct from v_invite then
    raise exception 'Código de invitación incorrecto';
  end if;
  if v_username is null or v_username !~ '^[a-z0-9][a-z0-9._-]{1,23}$' then
    raise exception 'Nombre de usuario inválido';
  end if;
  if new.email is distinct from v_username || '@baiswarm.local' then
    raise exception 'El mail no corresponde al usuario';
  end if;
  insert into public.profiles (id, username, role)
    values (new.id, v_username, left(coalesce(trim(new.raw_user_meta_data->>'role'), ''), 40));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Comprobación previa del código desde el cliente, para dar un mensaje claro antes de registrar.
create or replace function public.check_invite(code text) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.settings where key = 'invite' and value <> 'CAMBIAME' and value = code);
$$;
revoke all on function public.check_invite(text) from public;
grant execute on function public.check_invite(text) to anon, authenticated;

-- ── Autor y fecha los fija la base, no el cliente ───────────────────────────
create or replace function public.posts_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    select username into new.author from public.profiles where id = new.author_id;
    if new.author is null then raise exception 'Hay que iniciar sesión'; end if;
    if new.kind not in ('proyecto', 'insight') then raise exception 'Tipo de post inválido'; end if;
  else
    new.author_id := old.author_id;
    new.author    := old.author;
    new.t         := old.t;
    new.kind      := old.kind;
  end if;
  return new;
end $$;
drop trigger if exists posts_stamp on public.posts;
create trigger posts_stamp before insert or update on public.posts for each row execute function public.posts_stamp();

-- ── Mutaciones de cualquier miembro sobre cualquier post ────────────────────
-- security definer porque la policy de update es solo del autor; cada función exige sesión y usa auth.uid()
-- como identidad, así que nadie puede votar, sumarse o comentar en nombre de otro.

create or replace function public.post_vote(p_id text, p_dir int) returns public.posts
language plpgsql security definer set search_path = public as $$
declare v_uid text := (select auth.uid())::text; v_post public.posts;
begin
  if v_uid is null then raise exception 'Hay que iniciar sesión'; end if;
  if p_dir not in (-1, 1) then raise exception 'Voto inválido'; end if;
  update public.posts
     set votes = case when votes->>v_uid = p_dir::text then votes - v_uid else votes || jsonb_build_object(v_uid, p_dir) end
   where id = p_id returning * into v_post;
  if not found then raise exception 'El post ya no existe'; end if;
  return v_post;
end $$;

create or replace function public.post_toggle_interest(p_id text, p_role text) returns public.posts
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_name text; v_post public.posts;
begin
  if v_uid is null then raise exception 'Hay que iniciar sesión'; end if;
  select username into v_name from public.profiles where id = v_uid;
  if exists (select 1 from public.posts p, jsonb_array_elements(p.interest) e where p.id = p_id and e->>'id' = v_uid::text) then
    update public.posts
       set interest = coalesce((select jsonb_agg(e order by o) from jsonb_array_elements(interest) with ordinality as x(e, o) where e->>'id' <> v_uid::text), '[]'::jsonb)
     where id = p_id returning * into v_post;
  else
    update public.posts
       set interest = interest || jsonb_build_object('id', v_uid, 'name', v_name, 'role', left(coalesce(trim(p_role), ''), 40))
     where id = p_id returning * into v_post;
  end if;
  if not found then raise exception 'El post ya no existe'; end if;
  return v_post;
end $$;

create or replace function public.post_add_comment(p_id text, p_text text, p_parent text default null) returns public.posts
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_name text; v_post public.posts;
begin
  if v_uid is null then raise exception 'Hay que iniciar sesión'; end if;
  if coalesce(trim(p_text), '') = '' then raise exception 'Comentario vacío'; end if;
  select username into v_name from public.profiles where id = v_uid;
  if p_parent is not null and not exists (select 1 from public.posts p, jsonb_array_elements(p.comments) e where p.id = p_id and e->>'id' = p_parent) then
    raise exception 'El comentario al que respondés ya no existe';
  end if;
  update public.posts
     set comments = comments || jsonb_build_object(
       'id', replace(gen_random_uuid()::text, '-', ''), 'uid', v_uid, 'who', v_name,
       'text', left(trim(p_text), 4000), 't', (extract(epoch from clock_timestamp()) * 1000)::bigint, 'parent', p_parent)
   where id = p_id returning * into v_post;
  if not found then raise exception 'El post ya no existe'; end if;
  return v_post;
end $$;

-- con respuestas se marca eliminado para no romper el hilo; sin respuestas se borra
create or replace function public.post_remove_comment(p_id text, p_cid text) returns public.posts
language plpgsql security definer set search_path = public as $$
declare v_uid text := (select auth.uid())::text; v_post public.posts;
begin
  if v_uid is null then raise exception 'Hay que iniciar sesión'; end if;
  if not exists (select 1 from public.posts p, jsonb_array_elements(p.comments) e where p.id = p_id and e->>'id' = p_cid and e->>'uid' = v_uid) then
    raise exception 'Solo podés borrar tus comentarios';
  end if;
  if exists (select 1 from public.posts p, jsonb_array_elements(p.comments) e where p.id = p_id and e->>'parent' = p_cid) then
    update public.posts
       set comments = coalesce((select jsonb_agg(case when e->>'id' = p_cid then e || '{"text":"","deleted":true}'::jsonb else e end order by o)
                                 from jsonb_array_elements(comments) with ordinality as x(e, o)), '[]'::jsonb)
     where id = p_id returning * into v_post;
  else
    update public.posts
       set comments = coalesce((select jsonb_agg(e order by o) from jsonb_array_elements(comments) with ordinality as x(e, o) where e->>'id' <> p_cid), '[]'::jsonb)
     where id = p_id returning * into v_post;
  end if;
  return v_post;
end $$;

create or replace function public.post_add_link(p_id text, p_to text, p_type text) returns public.posts
language plpgsql security definer set search_path = public as $$
declare v_from text; v_to text; v_post public.posts;
begin
  if auth.uid() is null then raise exception 'Hay que iniciar sesión'; end if;
  if p_id = p_to then raise exception 'Un post no puede vincularse a sí mismo'; end if;
  select kind into v_from from public.posts where id = p_id;
  select kind into v_to   from public.posts where id = p_to;
  if v_from is null or v_to is null then raise exception 'El post ya no existe'; end if;
  if not ((p_type = 'informa'     and v_from = 'insight'  and v_to = 'proyecto')
       or (p_type = 'relacionada' and v_from = 'insight'  and v_to = 'insight')
       or (p_type = 'apoya'       and v_from = 'proyecto' and v_to = 'insight')
       or (p_type in ('deriva', 'compite') and v_from = 'proyecto' and v_to = 'proyecto')) then
    raise exception 'Vínculo no permitido entre esos tipos';
  end if;
  update public.posts
     set links = case when exists (select 1 from jsonb_array_elements(links) e where e->>'to' = p_to and e->>'type' = p_type)
                      then links else links || jsonb_build_object('to', p_to, 'type', p_type) end
   where id = p_id returning * into v_post;
  return v_post;
end $$;

create or replace function public.post_remove_link(p_id text, p_to text, p_type text) returns public.posts
language plpgsql security definer set search_path = public as $$
declare v_post public.posts;
begin
  if auth.uid() is null then raise exception 'Hay que iniciar sesión'; end if;
  update public.posts
     set links = coalesce((select jsonb_agg(e order by o) from jsonb_array_elements(links) with ordinality as x(e, o) where not (e->>'to' = p_to and e->>'type' = p_type)), '[]'::jsonb)
   where id = p_id returning * into v_post;
  if not found then raise exception 'El post ya no existe'; end if;
  return v_post;
end $$;

-- Solo usuarios con sesión pueden llamar a las mutaciones.
revoke all on function public.post_vote(text, int)                     from public, anon;
revoke all on function public.post_toggle_interest(text, text)         from public, anon;
revoke all on function public.post_add_comment(text, text, text)       from public, anon;
revoke all on function public.post_remove_comment(text, text)          from public, anon;
revoke all on function public.post_add_link(text, text, text)          from public, anon;
revoke all on function public.post_remove_link(text, text, text)       from public, anon;
grant execute on function public.post_vote(text, int)                  to authenticated;
grant execute on function public.post_toggle_interest(text, text)      to authenticated;
grant execute on function public.post_add_comment(text, text, text)    to authenticated;
grant execute on function public.post_remove_comment(text, text)       to authenticated;
grant execute on function public.post_add_link(text, text, text)       to authenticated;
grant execute on function public.post_remove_link(text, text, text)    to authenticated;

-- ── Realtime: los clientes con sesión se enteran de los cambios ────────────
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'posts') then
    alter publication supabase_realtime add table public.posts;
  end if;
end $$;
