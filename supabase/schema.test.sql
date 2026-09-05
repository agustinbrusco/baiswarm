-- Pruebas del esquema en un Postgres de Supabase local (npm run sql-test). Simula registro por trigger, RLS
-- y las funciones post_*. Cada bloque falla con una excepción si algo no da; el runner corta en el primer error.
-- auth.uid() de la imagen local lee request.jwt.claim.sub o request.jwt.claims según la versión: se fijan las dos.
\set ON_ERROR_STOP on
begin;

update public.settings set value = 'test-invite' where key = 'invite';

-- helper: actuar como un usuario (rol authenticated + claims) o como anon
create or replace function pg_temp.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', case when p_uid is null then 'anon' else 'authenticated' end, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  perform set_config('request.jwt.claims', case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
end $$;

-- registro: dos usuarios por el trigger sobre auth.users, y uno con código incorrecto que tiene que fallar
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@baiswarm.local', '{"username":"ana","role":"Interp","invite":"test-invite"}'),
  ('00000000-0000-0000-0000-00000000000b', 'beto@baiswarm.local', '{"username":"beto","role":"Policy","invite":"test-invite"}');
do $$ begin
  if (select count(*) from public.profiles where username in ('ana', 'beto')) <> 2 then raise exception 'el trigger no creó los perfiles'; end if;
  begin
    insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-00000000000c', 'caro@baiswarm.local', '{"username":"caro","invite":"otro"}');
    raise exception 'registro con código incorrecto no falló';
  exception when others then
    if sqlerrm not like '%invitaci%' then raise; end if;
  end;
  raise notice 'ok: registro por trigger e invitación';
end $$;

-- anon no lee posts
do $$ declare n int; begin
  perform pg_temp.act_as(null);
  begin
    select count(*) into n from public.posts;
    raise exception 'anon pudo leer posts';
  exception when insufficient_privilege then null;
  end;
  perform set_config('role', 'postgres', true);
  raise notice 'ok: anon sin acceso';
end $$;

-- ana publica; el trigger fija autor; beto no puede editar ni borrar
do $$ declare r public.posts; n int; begin
  perform pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
  insert into public.posts (id, kind, title, body, author, author_id, t) values ('p1', 'proyecto', 'Proyecto', 'cuerpo', 'impostor', '00000000-0000-0000-0000-00000000000b', 1)
    returning * into r;
  if r.author <> 'ana' or r.author_id <> '00000000-0000-0000-0000-00000000000a' then raise exception 'el trigger no fijó el autor: % %', r.author, r.author_id; end if;
  perform pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
  update public.posts set title = 'hackeado' where id = 'p1'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'beto editó un post ajeno'; end if;
  delete from public.posts where id = 'p1'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'beto borró un post ajeno'; end if;
  perform set_config('role', 'postgres', true);
  raise notice 'ok: autor por trigger y RLS de edición';
end $$;

-- votos, interés, comentarios anidados y votos en comentarios
do $$ declare r public.posts; c1 text; c2 text; begin
  perform pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
  r := public.post_vote('p1', 1);  if r.votes->>'00000000-0000-0000-0000-00000000000b' <> '1' then raise exception 'voto no quedó'; end if;
  r := public.post_vote('p1', 1);  if r.votes ? '00000000-0000-0000-0000-00000000000b' then raise exception 'voto no se sacó'; end if;
  r := public.post_vote('p1', -1); if r.votes->>'00000000-0000-0000-0000-00000000000b' <> '-1' then raise exception 'voto negativo no quedó'; end if;
  r := public.post_toggle_interest('p1', 'Policy'); if jsonb_array_length(r.interest) <> 1 or r.interest->0->>'name' <> 'beto' then raise exception 'interés no quedó'; end if;
  r := public.post_add_comment('p1', 'hola', null); c1 := r.comments->0->>'id';
  if r.comments->0->>'who' <> 'beto' then raise exception 'comentario sin autor'; end if;
  perform pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
  r := public.post_add_comment('p1', 'respuesta', c1); c2 := r.comments->1->>'id';
  if r.comments->1->>'parent' <> c1 then raise exception 'respuesta sin parent'; end if;
  -- votos en comentarios: toggle, solo positivos, sobre el comentario correcto
  r := public.post_vote_comment('p1', c1);
  if r.comments->0->'votes' <> jsonb_build_object('00000000-0000-0000-0000-00000000000a', 1) then raise exception 'voto en comentario no quedó: %', r.comments->0; end if;
  if r.comments->1 ? 'votes' then raise exception 'el voto tocó otro comentario'; end if;
  r := public.post_vote_comment('p1', c1);
  if r.comments->0->'votes' <> '{}'::jsonb then raise exception 'voto en comentario no se sacó: %', r.comments->0->'votes'; end if;
  perform pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
  r := public.post_vote_comment('p1', c1);
  perform pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
  r := public.post_vote_comment('p1', c1);
  if (select count(*) from jsonb_object_keys(r.comments->0->'votes')) <> 2 then raise exception 'dos votos esperados: %', r.comments->0->'votes'; end if;
  begin
    perform public.post_vote_comment('p1', 'no-existe');
    raise exception 'votar un comentario inexistente no falló';
  exception when others then if sqlerrm not like '%ya no existe%' then raise; end if;
  end;
  -- ana no puede borrar el comentario de beto; beto lo borra y queda marcado porque tiene respuesta
  begin
    perform public.post_remove_comment('p1', c1);
    raise exception 'ana borró un comentario ajeno';
  exception when others then if sqlerrm not like '%tus comentarios%' then raise; end if;
  end;
  perform pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
  r := public.post_remove_comment('p1', c1);
  if jsonb_array_length(r.comments) <> 2 or (r.comments->0->>'deleted')::boolean is not true or r.comments->0->>'text' <> '' then raise exception 'borrado con respuestas no marcó: %', r.comments->0; end if;
  begin
    perform public.post_vote_comment('p1', c1);
    raise exception 'se pudo votar un comentario eliminado';
  exception when others then if sqlerrm not like '%ya no existe%' then raise; end if;
  end;
  perform pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
  r := public.post_remove_comment('p1', c2);
  if jsonb_array_length(r.comments) <> 1 then raise exception 'borrado sin respuestas no eliminó'; end if;
  perform set_config('role', 'postgres', true);
  raise notice 'ok: votos, interés, comentarios y votos en comentarios';
end $$;

-- vínculos: tipos válidos por clase de post, sin duplicar
do $$ declare r public.posts; begin
  perform pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
  insert into public.posts (id, kind, title, body, t) values ('i1', 'insight', 'Insight', 'cuerpo', 2);
  r := public.post_add_link('i1', 'p1', 'informa'); r := public.post_add_link('i1', 'p1', 'informa');
  if jsonb_array_length(r.links) <> 1 then raise exception 'vínculo duplicado'; end if;
  begin
    perform public.post_add_link('i1', 'p1', 'deriva');
    raise exception 'vínculo de tipo inválido aceptado';
  exception when others then if sqlerrm like '%inválido aceptado%' then raise; end if;
  end;
  r := public.post_remove_link('i1', 'p1', 'informa');
  if jsonb_array_length(r.links) <> 0 then raise exception 'vínculo no se quitó'; end if;
  perform set_config('role', 'postgres', true);
  raise notice 'ok: vínculos';
end $$;

-- anon no puede llamar a las funciones
do $$ begin
  perform pg_temp.act_as(null);
  begin
    perform public.post_vote('p1', 1);
    raise exception 'anon pudo votar';
  exception when insufficient_privilege then null;
  end;
  perform set_config('role', 'postgres', true);
  raise notice 'ok: funciones cerradas a anon';
end $$;

rollback;
