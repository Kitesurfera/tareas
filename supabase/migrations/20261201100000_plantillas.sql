-- =====================================================================
-- 📋 Plantillas de tareas y preparativos
--
-- Necesita que antes se hayan ejecutado todos los SQL anteriores.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
-- Se puede ejecutar varias veces: si ya estaba aplicado, no cambia nada.
--
-- Qué hace:
--   * plantillas: las plantillas de vuestro hogar («Nuestra Navidad»,
--     «Barbacoa en el pueblo»…): un nombre, un dibujo, la pregunta de la
--     fecha («¿Cuándo es la mudanza?») y sus tareas, cada una con cuántos
--     días antes o después de esa fecha toca. (Las sugeridas van en la
--     propia app; solo se guardan aquí las vuestras.)
--   * preparativos: cada vez que usáis una plantilla («Mudanza, 15 de
--     marzo»). Sus tareas son tareas normales, con preparativo_id, y así se
--     ve el progreso («4 de 12 hechas»).
--       - Si cambia la fecha, sus tareas pendientes se mueven igual.
--       - Si se borran los preparativos, se borran sus tareas pendientes
--         (las hechas se quedan).
--   * Planes: cada plan puede tener su plantilla (plantilla_id para una
--     vuestra, plantilla_sugerida para una de la app) y «no preguntar más»
--     (sin_preparativos). Si los preparativos van con un plan del
--     calendario y cambiáis el día del plan, las tareas se mueven solas; si
--     lo quitáis del calendario, se borran sus tareas pendientes.
--   * «En equipo»: usar una plantilla cuenta como UNA cosa pensada
--     («Mudanza»), no una por tarea.
--   * usos_ia: también cuenta las plantillas hechas con la IA.
--
-- Seguridad:
--   * Cada hogar solo ve, crea, cambia y borra SUS plantillas y
--     preparativos (RLS). Quien ayuda con un acceso temporal no los ve.
--   * Una tarea, un plan o un preparativo solo pueden apuntar a cosas de su
--     mismo hogar (claves compuestas).
--   * Nadie puede falsear quién lo creó (lo pone la base de datos).
-- =====================================================================

begin;

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'tareas' and column_name = 'repetida_de') then
    raise exception 'Falta un SQL anterior: ejecuta antes 20261128100000_tareas_que_se_repiten.sql';
  end if;
  if to_regclass('public.bandeja') is null then
    raise exception 'Falta un SQL anterior: ejecuta antes 20261127100000_bandeja.sql';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Plantillas
-- ---------------------------------------------------------------------

-- Las tareas de una plantilla: entre 1 y 40, cada una con
-- { "titulo": "Comprar cajas", "categoria": "casa", "dias": -7 }
-- (dias: negativo = antes de la fecha; positivo = después; como mucho dos
-- años). Nada más dentro.
create or replace function public.tareas_de_plantilla_bien(t jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(t) is distinct from 'array' then false
    when jsonb_array_length(t) not between 1 and 40 then false
    else not exists (
      select 1
      from jsonb_array_elements(t) e
      where case
        when jsonb_typeof(e) is distinct from 'object' then true
        when jsonb_typeof(e -> 'titulo') is distinct from 'string' then true
        when char_length(btrim(e ->> 'titulo')) not between 1 and 120 then true
        when coalesce(e ->> 'categoria', '') not in ('mascota', 'casa', 'plantas', 'coche', 'papeleo', 'otros') then true
        when jsonb_typeof(e -> 'dias') is distinct from 'number' then true
        when (e ->> 'dias')::numeric <> trunc((e ->> 'dias')::numeric) then true
        when (e ->> 'dias')::numeric not between -730 and 730 then true
        when exists (select 1 from jsonb_object_keys(e) k where k not in ('titulo', 'categoria', 'dias')) then true
        else false
      end
    )
  end
$$;

create table if not exists public.plantillas (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 60),
  -- Un emoji (algunos ocupan varios caracteres).
  dibujo text not null default '📋' check (char_length(dibujo) between 1 and 16),
  -- La fecha desde la que se cuentan las tareas: «¿Cuándo es la mudanza?».
  pregunta text not null default '¿Para cuándo?' check (char_length(btrim(pregunta)) between 1 and 80),
  tareas jsonb not null check (public.tareas_de_plantilla_bien(tareas)),
  creada_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  constraint plantillas_id_hogar unique (id, hogar_id)
);

create index if not exists plantillas_hogar_idx on public.plantillas (hogar_id);

-- ---------------------------------------------------------------------
-- 2. Preparativos (cada vez que se usa una plantilla)
-- ---------------------------------------------------------------------

-- Para poder enlazar unos preparativos con un plan del calendario de su
-- mismo hogar.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agenda_planes_id_hogar') then
    alter table public.agenda_planes add constraint agenda_planes_id_hogar unique (id, hogar_id);
  end if;
end;
$$;

create table if not exists public.preparativos (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 80),
  dibujo text not null default '📋' check (char_length(dibujo) between 1 and 16),
  -- El día clave (la mudanza, la barbacoa…).
  fecha date not null check (fecha between date '2000-01-01' and date '2100-01-01'),
  -- De qué plantilla vuestra salió (vacío si fue una sugerida o se borró).
  plantilla_id uuid,
  -- El plan del calendario con el que va (si va con uno).
  agenda_plan_id uuid,
  creada_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  constraint preparativos_id_hogar unique (id, hogar_id),
  constraint plantilla_del_hogar foreign key (plantilla_id, hogar_id)
    references public.plantillas (id, hogar_id) on delete set null (plantilla_id),
  constraint plan_del_calendario_del_hogar foreign key (agenda_plan_id, hogar_id)
    references public.agenda_planes (id, hogar_id) on delete set null (agenda_plan_id)
);

create index if not exists preparativos_hogar_idx on public.preparativos (hogar_id, fecha);
-- Un plan del calendario, como mucho unos preparativos.
create unique index if not exists unos_preparativos_por_plan on public.preparativos (agenda_plan_id) where agenda_plan_id is not null;

-- Las tareas de unos preparativos.
alter table public.tareas add column if not exists preparativo_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'preparativo_del_hogar') then
    alter table public.tareas add constraint preparativo_del_hogar foreign key (preparativo_id, hogar_id)
      references public.preparativos (id, hogar_id) on delete set null (preparativo_id);
  end if;
end;
$$;
create index if not exists tareas_preparativo_idx on public.tareas (preparativo_id);

-- ---------------------------------------------------------------------
-- 3. Planes con plantilla
-- ---------------------------------------------------------------------

alter table public.planes add column if not exists plantilla_id uuid;
-- Una de las sugeridas de la app («barbacoa», «viaje»…).
alter table public.planes add column if not exists plantilla_sugerida text;
-- «No volver a preguntar» al programar este plan.
alter table public.planes add column if not exists sin_preparativos boolean not null default false;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plantilla_del_plan_del_hogar') then
    alter table public.planes add constraint plantilla_del_plan_del_hogar foreign key (plantilla_id, hogar_id)
      references public.plantillas (id, hogar_id) on delete set null (plantilla_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'plantilla_sugerida_bien') then
    alter table public.planes add constraint plantilla_sugerida_bien
      check (plantilla_sugerida ~ '^[a-z0-9-]{1,40}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'una_plantilla_por_plan') then
    alter table public.planes add constraint una_plantilla_por_plan
      check (num_nonnulls(plantilla_id, plantilla_sugerida) <= 1);
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Seguridad: RLS y permisos
-- ---------------------------------------------------------------------

alter table public.plantillas enable row level security;
alter table public.preparativos enable row level security;
revoke all on public.plantillas, public.preparativos from anon, authenticated;

-- Solo estas columnas se pueden escribir desde la app (creada_por y
-- creado_en los pone la base de datos; con qué plan van unos preparativos
-- no se cambia después).
grant select, delete on public.plantillas, public.preparativos to authenticated;
grant insert (hogar_id, nombre, dibujo, pregunta, tareas) on public.plantillas to authenticated;
grant update (nombre, dibujo, pregunta, tareas) on public.plantillas to authenticated;
grant insert (hogar_id, nombre, dibujo, fecha, plantilla_id, agenda_plan_id) on public.preparativos to authenticated;
grant update (nombre, dibujo, fecha) on public.preparativos to authenticated;
grant insert (preparativo_id) on public.tareas to authenticated;
grant insert (plantilla_id, plantilla_sugerida, sin_preparativos) on public.planes to authenticated;
grant update (plantilla_id, plantilla_sugerida, sin_preparativos) on public.planes to authenticated;

-- Las mismas cuatro reglas para las dos tablas: solo lo de mi hogar.
do $$
declare
  t text;
begin
  foreach t in array array['plantillas', 'preparativos'] loop
    execute format('drop policy if exists "Veo lo de mi hogar" on public.%I', t);
    execute format('drop policy if exists "Añado en mi hogar" on public.%I', t);
    execute format('drop policy if exists "Cambio lo de mi hogar" on public.%I', t);
    execute format('drop policy if exists "Borro lo de mi hogar" on public.%I', t);
    execute format(
      'create policy "Veo lo de mi hogar" on public.%I for select to authenticated
         using (hogar_id = (select public.mi_hogar_id()))', t);
    execute format(
      'create policy "Añado en mi hogar" on public.%I for insert to authenticated
         with check (hogar_id = (select public.mi_hogar_id()))', t);
    execute format(
      'create policy "Cambio lo de mi hogar" on public.%I for update to authenticated
         using (hogar_id = (select public.mi_hogar_id()))
         with check (hogar_id = (select public.mi_hogar_id()))', t);
    execute format(
      'create policy "Borro lo de mi hogar" on public.%I for delete to authenticated
         using (hogar_id = (select public.mi_hogar_id()))', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Usar una plantilla: crea los preparativos y todas sus tareas de una
--    vez (o todo o nada). Funciona con los permisos de quien la usa (las
--    reglas de siempre de las tareas).
--    las_tareas: [{ "titulo", "categoria", "fecha_limite", "responsable_id" }]
-- ---------------------------------------------------------------------

create or replace function public.crear_preparativos(
  nombre text,
  dibujo text,
  fecha date,
  las_tareas jsonb,
  plantilla uuid default null,
  agenda_plan uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  hogar uuid := public.mi_hogar_id();
  nuevo uuid;
begin
  if hogar is null then
    raise exception 'Tienes que entrar con tu cuenta y ser de un hogar.';
  end if;
  if jsonb_typeof(las_tareas) is distinct from 'array' or jsonb_array_length(las_tareas) not between 1 and 60 then
    raise exception 'Elige entre 1 y 60 tareas.';
  end if;
  if agenda_plan is not null and exists (select 1 from public.preparativos p where p.agenda_plan_id = crear_preparativos.agenda_plan) then
    raise exception 'Ese plan ya tiene sus preparativos.';
  end if;

  insert into public.preparativos (hogar_id, nombre, dibujo, fecha, plantilla_id, agenda_plan_id)
  values (hogar, btrim(crear_preparativos.nombre), coalesce(nullif(btrim(crear_preparativos.dibujo), ''), '📋'),
          crear_preparativos.fecha, crear_preparativos.plantilla, crear_preparativos.agenda_plan)
  returning id into nuevo;

  insert into public.tareas (hogar_id, titulo, categoria, fecha_limite, responsable_id, preparativo_id)
  select hogar, btrim(t.titulo), coalesce(t.categoria, 'otros'), t.fecha_limite, t.responsable_id, nuevo
  from jsonb_to_recordset(las_tareas) as t(titulo text, categoria text, fecha_limite date, responsable_id uuid);

  return nuevo;
end;
$$;

revoke execute on function public.crear_preparativos(text, text, date, jsonb, uuid, uuid) from public, anon;
grant execute on function public.crear_preparativos(text, text, date, jsonb, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Mover y borrar
-- ---------------------------------------------------------------------

-- Si cambia la fecha de unos preparativos, sus tareas pendientes se mueven
-- los mismos días (las que tenían fecha).
create or replace function public.mover_tareas_de_preparativos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.fecha is distinct from old.fecha then
    update public.tareas t
    set fecha_limite = t.fecha_limite + (new.fecha - old.fecha)
    where t.preparativo_id = new.id
      and t.hogar_id = new.hogar_id
      and not t.completada
      and t.fecha_limite is not null;
  end if;
  return null;
end;
$$;

drop trigger if exists mover_tareas_de_preparativos on public.preparativos;
create trigger mover_tareas_de_preparativos
  after update of fecha on public.preparativos
  for each row execute function public.mover_tareas_de_preparativos();

-- Si se borran unos preparativos, se borran sus tareas pendientes (las
-- hechas se quedan, como tareas normales).
create or replace function public.borrar_tareas_de_preparativos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.tareas t
  where t.preparativo_id = old.id and t.hogar_id = old.hogar_id and not t.completada;
  return old;
end;
$$;

drop trigger if exists borrar_tareas_de_preparativos on public.preparativos;
create trigger borrar_tareas_de_preparativos
  before delete on public.preparativos
  for each row execute function public.borrar_tareas_de_preparativos();

-- Un plan del calendario cambia de día (sin estar hecho) → sus
-- preparativos también (y, con ellos, sus tareas).
create or replace function public.mover_preparativos_del_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.fecha is distinct from old.fecha and not new.hecho and not old.hecho then
    update public.preparativos p
    set fecha = new.fecha
    where p.agenda_plan_id = new.id and p.hogar_id = new.hogar_id;
  end if;
  return null;
end;
$$;

drop trigger if exists mover_preparativos_del_plan on public.agenda_planes;
create trigger mover_preparativos_del_plan
  after update of fecha on public.agenda_planes
  for each row execute function public.mover_preparativos_del_plan();

-- Un plan se quita del calendario (o se borra el plan) → se borran sus
-- preparativos (y sus tareas pendientes).
create or replace function public.borrar_preparativos_del_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.preparativos p where p.agenda_plan_id = old.id and p.hogar_id = old.hogar_id;
  return old;
end;
$$;

drop trigger if exists borrar_preparativos_del_plan on public.agenda_planes;
create trigger borrar_preparativos_del_plan
  before delete on public.agenda_planes
  for each row execute function public.borrar_preparativos_del_plan();

revoke execute on function public.mover_tareas_de_preparativos() from public, anon, authenticated;
revoke execute on function public.borrar_tareas_de_preparativos() from public, anon, authenticated;
revoke execute on function public.mover_preparativos_del_plan() from public, anon, authenticated;
revoke execute on function public.borrar_preparativos_del_plan() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. «En equipo»: usar una plantilla es UNA cosa pensada
-- ---------------------------------------------------------------------

alter table public.actividad drop constraint if exists actividad_origen_check;
alter table public.actividad add constraint actividad_origen_check
  check (origen in ('tarea', 'tratamiento', 'rutina', 'vencimiento', 'compra', 'cuidado', 'plan', 'documento', 'fecha', 'preparativo'));

-- Igual que antes, pero las tareas de unos preparativos no cuentan una a
-- una como «pensar» (cuentan los preparativos, abajo). Hacerlas, sí.
create or replace function public.apuntar_actividad_tarea()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.tratamiento_id is null and new.vencimiento_id is null and new.rutina_id is null
       and new.cuidado_id is null and new.documento_id is null and new.repetida_de is null
       and new.preparativo_id is null
       and new.creada_por is not null then
      insert into public.actividad (hogar_id, user_id, tipo, origen, origen_id, titulo)
      values (new.hogar_id, new.creada_por, 'pensar', 'tarea', new.id, new.titulo);
    end if;
  elsif new.completada and not old.completada and new.completada_por is not null then
    insert into public.actividad (hogar_id, user_id, tipo, origen, origen_id, titulo)
    values (new.hogar_id, new.completada_por, 'hacer', 'tarea', new.id, new.titulo);
  elsif old.completada and not new.completada then
    delete from public.actividad
    where origen = 'tarea' and origen_id = new.id and tipo = 'hacer';
  end if;
  return null;
end;
$$;

create or replace function public.apuntar_actividad_preparativo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.creada_por is not null then
    insert into public.actividad (hogar_id, user_id, tipo, origen, origen_id, titulo)
    values (new.hogar_id, new.creada_por, 'pensar', 'preparativo', new.id, new.nombre);
  end if;
  return null;
end;
$$;

drop trigger if exists apuntar_actividad_preparativo on public.preparativos;
create trigger apuntar_actividad_preparativo
  after insert on public.preparativos
  for each row execute function public.apuntar_actividad_preparativo();

revoke execute on function public.apuntar_actividad_preparativo() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. La IA también cuenta las plantillas que hace
-- ---------------------------------------------------------------------

alter table public.usos_ia drop constraint if exists usos_ia_tipo_check;
alter table public.usos_ia add constraint usos_ia_tipo_check check (tipo in ('tarea', 'ver', 'cabeza', 'plantilla'));

commit;
