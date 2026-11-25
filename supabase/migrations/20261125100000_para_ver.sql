-- =====================================================================
-- Para ver: vuestra lista de películas y series (dentro de Planes)
--
-- Necesita que antes se hayan ejecutado todos los SQL anteriores.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
-- Se puede ejecutar varias veces: si ya estaba aplicado, no cambia nada.
--
-- Qué hace:
--   * para_ver: cada película o serie que queréis ver, con su carátula,
--     año, sinopsis y plataformas (de TMDB, si la buscáis allí), si ya la
--     habéis visto y si os gustó.
--   * ganas_para_ver: las ganas de cada persona de verla, de 0 a 3
--     (😴 nada, 🙂 algo, 😃 bastante, 🤩 muchísimas).
--   * marcar_ganas: la única forma de cambiar las ganas. Cada persona
--     solo puede marcar LAS SUYAS.
--   * ajustes_ver: las plataformas que tenéis (Netflix, HBO Max…), para
--     las sugerencias.
--   * usos_ia: también cuenta las sugerencias pedidas con palabras (para
--     no gastar el cupo gratuito de la IA).
--
-- Seguridad:
--   * Cada hogar solo ve, crea, cambia y borra SU lista (RLS). Quien ayuda
--     con un acceso temporal no ve nada.
--   * Nadie puede marcar las ganas de otra persona, ni falsear quién añadió
--     algo (lo pone la base de datos).
--   * Las ganas son de una película o serie y de una persona del mismo
--     hogar (claves compuestas). Si alguien sale del hogar, se borran las suyas.
-- =====================================================================

begin;

-- Antes de nada: ¿están los SQL anteriores?
do $$
begin
  if to_regclass('public.planes') is null then
    raise exception 'Falta un SQL anterior: ejecuta antes 20261123140000_planes.sql';
  end if;
  if to_regclass('public.usos_ia') is null then
    raise exception 'Falta un SQL anterior: ejecuta antes 20261123120000_usos_ia.sql';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------

create table if not exists public.para_ver (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  tipo text not null check (tipo in ('pelicula', 'serie')),
  titulo text not null check (char_length(trim(titulo)) between 1 and 120),
  anio integer check (anio between 1880 and 2100),
  -- De TMDB (si se buscó allí): su número y la ruta de la carátula
  -- («/abc123.jpg»; la app la pide a image.tmdb.org).
  tmdb_id integer check (tmdb_id > 0),
  poster text check (poster ~ '^/[A-Za-z0-9_-]{1,64}\.(jpg|png)$'),
  sinopsis text check (char_length(sinopsis) <= 1500),
  -- Dónde se puede ver en España («Netflix», «Max»…).
  plataformas text[] not null default '{}'
    check (cardinality(plataformas) <= 12 and char_length(array_to_string(plataformas, '|')) <= 400),
  notas text check (char_length(notas) <= 1000),
  visto boolean not null default false,
  visto_en date,
  nos_gusto boolean, -- vacío = sin decir
  creada_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  constraint para_ver_id_hogar unique (id, hogar_id)
);

-- La misma película o serie de TMDB, una sola vez en vuestra lista.
create unique index if not exists para_ver_tmdb_unico
  on public.para_ver (hogar_id, tipo, tmdb_id) where tmdb_id is not null;
create index if not exists para_ver_hogar_idx on public.para_ver (hogar_id, tipo);

create table if not exists public.ganas_para_ver (
  para_ver_id uuid not null,
  hogar_id uuid not null,
  miembro_id uuid not null,
  nivel smallint not null check (nivel between 0 and 3),
  cambiado_en timestamptz not null default now(),
  primary key (para_ver_id, miembro_id),
  constraint ganas_de_algo_del_hogar foreign key (para_ver_id, hogar_id)
    references public.para_ver (id, hogar_id) on delete cascade,
  constraint ganas_de_alguien_del_hogar foreign key (miembro_id, hogar_id)
    references public.miembros (id, hogar_id) on delete cascade
);

create index if not exists ganas_para_ver_hogar_idx on public.ganas_para_ver (hogar_id);

create table if not exists public.ajustes_ver (
  hogar_id uuid primary key references public.hogares (id) on delete cascade,
  -- Los números de TMDB de vuestras plataformas (8 = Netflix…).
  plataformas integer[] not null default '{}' check (cardinality(plataformas) <= 30),
  cambiado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Seguridad: RLS y permisos
-- ---------------------------------------------------------------------

alter table public.para_ver enable row level security;
alter table public.ganas_para_ver enable row level security;
alter table public.ajustes_ver enable row level security;

revoke all on public.para_ver, public.ganas_para_ver, public.ajustes_ver from anon, authenticated;

-- para_ver: solo estas columnas se pueden escribir desde la app
-- (creada_por y creado_en los pone la base de datos).
grant select, delete on public.para_ver to authenticated;
grant insert (hogar_id, tipo, titulo, anio, tmdb_id, poster, sinopsis, plataformas, notas, visto, visto_en, nos_gusto)
  on public.para_ver to authenticated;
grant update (titulo, anio, plataformas, notas, visto, visto_en, nos_gusto) on public.para_ver to authenticated;

-- ganas_para_ver: desde la app solo se leen. Se cambian con marcar_ganas.
grant select on public.ganas_para_ver to authenticated;

-- ajustes_ver: se guardan con «upsert» (crear o cambiar la fila del hogar).
grant select on public.ajustes_ver to authenticated;
grant insert (hogar_id, plataformas) on public.ajustes_ver to authenticated;
grant update (hogar_id, plataformas) on public.ajustes_ver to authenticated;

drop policy if exists "Veo lo de mi hogar" on public.para_ver;
drop policy if exists "Añado en mi hogar" on public.para_ver;
drop policy if exists "Cambio lo de mi hogar" on public.para_ver;
drop policy if exists "Borro lo de mi hogar" on public.para_ver;
create policy "Veo lo de mi hogar" on public.para_ver for select to authenticated
  using (hogar_id = (select public.mi_hogar_id()));
create policy "Añado en mi hogar" on public.para_ver for insert to authenticated
  with check (hogar_id = (select public.mi_hogar_id()));
create policy "Cambio lo de mi hogar" on public.para_ver for update to authenticated
  using (hogar_id = (select public.mi_hogar_id())) with check (hogar_id = (select public.mi_hogar_id()));
create policy "Borro lo de mi hogar" on public.para_ver for delete to authenticated
  using (hogar_id = (select public.mi_hogar_id()));

drop policy if exists "Veo lo de mi hogar" on public.ganas_para_ver;
create policy "Veo lo de mi hogar" on public.ganas_para_ver for select to authenticated
  using (hogar_id = (select public.mi_hogar_id()));

drop policy if exists "Veo lo de mi hogar" on public.ajustes_ver;
drop policy if exists "Añado en mi hogar" on public.ajustes_ver;
drop policy if exists "Cambio lo de mi hogar" on public.ajustes_ver;
create policy "Veo lo de mi hogar" on public.ajustes_ver for select to authenticated
  using (hogar_id = (select public.mi_hogar_id()));
create policy "Añado en mi hogar" on public.ajustes_ver for insert to authenticated
  with check (hogar_id = (select public.mi_hogar_id()));
create policy "Cambio lo de mi hogar" on public.ajustes_ver for update to authenticated
  using (hogar_id = (select public.mi_hogar_id())) with check (hogar_id = (select public.mi_hogar_id()));

-- La fecha del último cambio la pone la base de datos.
create or replace function public.ajustes_ver_cambiados()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.cambiado_en := now();
  return new;
end;
$$;

drop trigger if exists ajustes_ver_cambiados on public.ajustes_ver;
create trigger ajustes_ver_cambiados
  before update on public.ajustes_ver
  for each row execute function public.ajustes_ver_cambiados();

-- ---------------------------------------------------------------------
-- marcar_ganas: tus ganas de ver algo de tu lista (de 0 a 3), o
-- quitarlas (nivel vacío). Siempre las TUYAS: la persona la saca de tu
-- sesión, no de lo que mande la app.
-- ---------------------------------------------------------------------

create or replace function public.marcar_ganas(para_ver_id uuid, nivel smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  yo record;
begin
  select m.id, m.hogar_id into yo
  from public.miembros m
  where m.user_id = auth.uid();
  if yo.id is null then
    raise exception 'Tienes que entrar con tu cuenta y ser de un hogar.';
  end if;
  if not exists (
    select 1 from public.para_ver v where v.id = marcar_ganas.para_ver_id and v.hogar_id = yo.hogar_id
  ) then
    raise exception 'No encontramos esa película o serie en tu hogar.';
  end if;

  if marcar_ganas.nivel is null then
    delete from public.ganas_para_ver g
    where g.para_ver_id = marcar_ganas.para_ver_id and g.miembro_id = yo.id;
    return;
  end if;
  if marcar_ganas.nivel not between 0 and 3 then
    raise exception 'Las ganas van de 0 a 3.';
  end if;

  insert into public.ganas_para_ver (para_ver_id, hogar_id, miembro_id, nivel)
  values (marcar_ganas.para_ver_id, yo.hogar_id, yo.id, marcar_ganas.nivel)
  on conflict on constraint ganas_para_ver_pkey
  do update set nivel = excluded.nivel, cambiado_en = now();
end;
$$;

revoke execute on function public.marcar_ganas(uuid, smallint) from public, anon;
grant execute on function public.marcar_ganas(uuid, smallint) to authenticated;
revoke execute on function public.ajustes_ver_cambiados() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- usos_ia: también las sugerencias pedidas con palabras («ver»)
-- ---------------------------------------------------------------------

alter table public.usos_ia drop constraint if exists usos_ia_tipo_check;
alter table public.usos_ia add constraint usos_ia_tipo_check check (tipo in ('tarea', 'ver'));

commit;
