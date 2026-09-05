-- Pegá esto en el SQL Editor de tu proyecto de Supabase y ejecutalo. Se puede correr más de una vez.

create table if not exists public.posts (
  id        text primary key,
  kind      text not null default 'proyecto',   -- 'proyecto' | 'insight'
  title     text not null,
  pitch     text not null default '',
  body      text not null default '',
  url       text not null default '',
  track     text not null default 'General',
  author    text not null,
  links     jsonb not null default '[]',        -- [{to, type}]
  votes     jsonb not null default '{}',        -- {nombre: 1 | -1}
  interest  jsonb not null default '[]',        -- [{name, role}]  (solo proyectos)
  comments  jsonb not null default '[]',        -- [{who, text, t}]
  t         bigint not null                     -- creación, ms desde epoch
);

-- Acceso abierto para la anon key. El "cerrado" es el link no público.
-- Cuando agreguemos login, reemplazar estas policies por unas basadas en auth.uid().
alter table public.posts enable row level security;
drop policy if exists "anon select" on public.posts;
drop policy if exists "anon insert" on public.posts;
drop policy if exists "anon update" on public.posts;
drop policy if exists "anon delete" on public.posts;
create policy "anon select" on public.posts for select to anon using (true);
create policy "anon insert" on public.posts for insert to anon with check (true);
create policy "anon update" on public.posts for update to anon using (true) with check (true);
create policy "anon delete" on public.posts for delete to anon using (true);

-- Realtime: que los clientes se enteren de los cambios sin recargar.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'posts') then
    alter publication supabase_realtime add table public.posts;
  end if;
end $$;
