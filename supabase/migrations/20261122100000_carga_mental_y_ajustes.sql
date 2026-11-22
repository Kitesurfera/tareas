-- =====================================================================
-- Contador de carga mental y ajustes
--
-- Necesita que antes se hayan ejecutado todos los SQL anteriores.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
--
-- Qué hace:
--   * actividad: un diario donde la base de datos apunta SOLA cada vez que
--     alguien «piensa» algo (crea una tarea, un tratamiento, una rutina o
--     un vencimiento, o apunta algo en la lista de la compra) o «hace»
--     algo (completa una tarea o compra algo de la lista).
--     Se rellena con lo que ya existía, para no empezar de cero.
--   * resumen_carga_mental: cuenta, por persona, lo pensado y lo hecho
--     entre dos fechas (en hora de España).
--   * Cada persona puede cambiar su nombre en la app.
--
-- Seguridad:
--   * Cada hogar solo ve su diario (RLS). Nadie puede escribir en él a
--     mano: solo los disparadores, así nadie puede «inflar» sus números.
--   * Cada persona solo puede cambiar SU nombre, nada más de su ficha.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Diario de actividad
-- ---------------------------------------------------------------------

create table public.actividad (
  id bigint generated always as identity primary key,
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  tipo text not null check (tipo in ('pensar', 'hacer')),
  origen text not null check (origen in ('tarea', 'tratamiento', 'rutina', 'vencimiento', 'compra')),
  origen_id uuid not null,
  creado_en timestamptz not null default now()
);

create index actividad_hogar_fecha_idx on public.actividad (hogar_id, creado_en);
create index actividad_origen_idx on public.actividad (origen, origen_id);

alter table public.actividad enable row level security;
revoke all on public.actividad from anon, authenticated;
grant select on public.actividad to authenticated;

create policy "Veo la actividad de mi hogar"
  on public.actividad for select to authenticated
  using (hogar_id = (select public.mi_hogar_id()));

-- ---------------------------------------------------------------------
-- Disparadores que apuntan en el diario
-- ---------------------------------------------------------------------

-- Pensar: crear una tarea a mano (las automáticas no cuentan: ya contó
-- crear su tratamiento, rutina o vencimiento).
create function public.apuntar_actividad_tarea()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.tratamiento_id is null and new.vencimiento_id is null and new.rutina_id is null
       and new.creada_por is not null then
      insert into public.actividad (hogar_id, user_id, tipo, origen, origen_id)
      values (new.hogar_id, new.creada_por, 'pensar', 'tarea', new.id);
    end if;
  elsif new.completada and not old.completada and new.completada_por is not null then
    -- Hacer: completar cualquier tarea.
    insert into public.actividad (hogar_id, user_id, tipo, origen, origen_id)
    values (new.hogar_id, new.completada_por, 'hacer', 'tarea', new.id);
  elsif old.completada and not new.completada then
    -- Si se reabre, ese «hacer» no cuenta.
    delete from public.actividad
    where origen = 'tarea' and origen_id = new.id and tipo = 'hacer';
  end if;
  return null;
end;
$$;

create trigger apuntar_actividad_tarea
  after insert or update of completada on public.tareas
  for each row execute function public.apuntar_actividad_tarea();

-- Pensar: configurar algo que se repite (tratamiento, rutina, vencimiento).
create function public.apuntar_actividad_al_crear()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.creada_por is not null then
    insert into public.actividad (hogar_id, user_id, tipo, origen, origen_id)
    values (new.hogar_id, new.creada_por, 'pensar', tg_argv[0], new.id);
  end if;
  return null;
end;
$$;

create trigger apuntar_actividad_tratamiento
  after insert on public.tratamientos
  for each row execute function public.apuntar_actividad_al_crear('tratamiento');
create trigger apuntar_actividad_rutina
  after insert on public.rutinas
  for each row execute function public.apuntar_actividad_al_crear('rutina');
create trigger apuntar_actividad_vencimiento
  after insert on public.vencimientos
  for each row execute function public.apuntar_actividad_al_crear('vencimiento');

-- Lista de la compra: apuntar algo es pensar; comprarlo es hacer.
create function public.apuntar_actividad_compra()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.anadido_por is not null then
      insert into public.actividad (hogar_id, user_id, tipo, origen, origen_id)
      values (new.hogar_id, new.anadido_por, 'pensar', 'compra', new.id);
    end if;
  elsif new.comprado and not old.comprado and new.comprado_por is not null then
    insert into public.actividad (hogar_id, user_id, tipo, origen, origen_id)
    values (new.hogar_id, new.comprado_por, 'hacer', 'compra', new.id);
  elsif old.comprado and not new.comprado then
    delete from public.actividad
    where origen = 'compra' and origen_id = new.id and tipo = 'hacer';
  end if;
  return null;
end;
$$;

create trigger apuntar_actividad_compra
  after insert or update of comprado on public.lista_compra
  for each row execute function public.apuntar_actividad_compra();

revoke execute on function public.apuntar_actividad_tarea() from public, anon, authenticated;
revoke execute on function public.apuntar_actividad_al_crear() from public, anon, authenticated;
revoke execute on function public.apuntar_actividad_compra() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Rellenar el diario con lo que ya existía
-- ---------------------------------------------------------------------

insert into public.actividad (hogar_id, user_id, tipo, origen, origen_id, creado_en)
select hogar_id, creada_por, 'pensar', 'tarea', id, creado_en from public.tareas
where tratamiento_id is null and vencimiento_id is null and rutina_id is null and creada_por is not null
union all
select hogar_id, completada_por, 'hacer', 'tarea', id, completada_en from public.tareas
where completada and completada_por is not null
union all
select hogar_id, creada_por, 'pensar', 'tratamiento', id, creado_en from public.tratamientos where creada_por is not null
union all
select hogar_id, creada_por, 'pensar', 'rutina', id, creado_en from public.rutinas where creada_por is not null
union all
select hogar_id, creada_por, 'pensar', 'vencimiento', id, creado_en from public.vencimientos where creada_por is not null
union all
select hogar_id, anadido_por, 'pensar', 'compra', id, creado_en from public.lista_compra where anadido_por is not null
union all
select hogar_id, comprado_por, 'hacer', 'compra', id, comprado_en from public.lista_compra
where comprado and comprado_por is not null and comprado_en is not null;

-- ---------------------------------------------------------------------
-- Resumen para la app
-- ---------------------------------------------------------------------

-- Cuántas cosas ha pensado y hecho cada persona entre «desde» (incluido) y
-- «hasta» (sin incluir), contando los días en hora de España. Usa los
-- permisos de quien la llama: gracias a RLS, solo cuenta TU hogar.
create function public.resumen_carga_mental(desde date, hasta date)
returns table (user_id uuid, tipo text, origen text, cuantas integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.user_id, a.tipo, a.origen, count(*)::integer
  from public.actividad a
  where a.creado_en >= (desde::timestamp at time zone 'Europe/Madrid')
    and a.creado_en < (hasta::timestamp at time zone 'Europe/Madrid')
  group by a.user_id, a.tipo, a.origen
$$;

revoke execute on function public.resumen_carga_mental(date, date) from public, anon;
grant execute on function public.resumen_carga_mental(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- Ajustes: cada persona puede cambiar su nombre (y solo eso)
-- ---------------------------------------------------------------------

grant update (nombre_visible) on public.miembros to authenticated;

create policy "Cambio mi nombre"
  on public.miembros for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

commit;
