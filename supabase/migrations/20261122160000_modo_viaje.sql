-- =====================================================================
-- Modo viaje: quién está fuera y quién cubre sus tareas
--
-- Necesita que antes se hayan ejecutado todos los SQL anteriores.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
--
-- Qué hace:
--   * viajes: quién se va, de qué día a qué día y (si quieres) adónde.
--     Si se van varias personas a la vez, hay una fila por persona con el
--     mismo «grupo», para poder cambiar o borrar el viaje entero.
--   * guardar_viaje: crea o cambia un viaje de una vez.
--   * recordatorios_del_dia (el aviso de las 8:00) tiene en cuenta los
--     viajes: quien está de viaje no recibe avisos, y quien se queda recibe
--     también los de quien está fuera. Si no queda nadie en casa, los
--     avisos siguen como siempre, para que nada se olvide.
--
--   En la base de datos NO se cambia quién es responsable de nada: al
--   volver del viaje, todo sigue siendo de quien era.
--
-- Seguridad:
--   * Cada hogar solo ve, crea, cambia y borra SUS viajes (RLS).
--   * Solo puede irse de viaje gente del mismo hogar (clave compuesta).
--   * Si alguien sale del hogar, se borran sus viajes.
-- =====================================================================

begin;

create table public.viajes (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  grupo uuid not null,
  miembro_id uuid not null,
  desde date not null,
  hasta date not null,
  destino text check (destino is null or char_length(trim(destino)) between 1 and 60),
  creada_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  constraint miembro_del_hogar foreign key (miembro_id, hogar_id)
    references public.miembros (id, hogar_id) on delete cascade,
  constraint vuelta_despues_de_ida check (hasta >= desde),
  constraint como_mucho_un_anio check (hasta - desde <= 366),
  constraint una_vez_por_viaje unique (grupo, miembro_id)
);

create index viajes_hogar_hasta_idx on public.viajes (hogar_id, hasta);

alter table public.viajes enable row level security;

revoke all on public.viajes from anon, authenticated;
grant select, delete on public.viajes to authenticated;
-- Solo estas columnas se pueden rellenar desde la app (para cambiar un
-- viaje, guardar_viaje lo borra y lo vuelve a crear).
grant insert (hogar_id, grupo, miembro_id, desde, hasta, destino)
  on public.viajes to authenticated;

create policy "Veo los viajes de mi hogar"
  on public.viajes for select to authenticated
  using (hogar_id = (select public.mi_hogar_id()));

create policy "Apunto viajes en mi hogar"
  on public.viajes for insert to authenticated
  with check (hogar_id = (select public.mi_hogar_id()));

create policy "Borro viajes de mi hogar"
  on public.viajes for delete to authenticated
  using (hogar_id = (select public.mi_hogar_id()));

-- ---------------------------------------------------------------------
-- Crear o cambiar un viaje de una vez
-- ---------------------------------------------------------------------

-- viaje_grupo vacío = viaje nuevo. Usa los permisos de quien la llama:
-- RLS hace que solo pueda tocar viajes de SU hogar.
create function public.guardar_viaje(
  viaje_grupo uuid,
  personas uuid[],
  ida date,
  vuelta date,
  lugar text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  mi_hogar uuid := public.mi_hogar_id();
  el_grupo uuid := coalesce(viaje_grupo, gen_random_uuid());
begin
  if mi_hogar is null then
    raise exception 'Primero tienes que crear o unirte a un hogar.';
  end if;
  if personas is null or cardinality(personas) = 0 then
    raise exception 'Elige quién se va de viaje.';
  end if;
  if ida is null or vuelta is null then
    raise exception 'Elige el día de ida y el de vuelta.';
  end if;
  if vuelta < ida then
    raise exception 'El día de vuelta no puede ser antes que el de ida.';
  end if;
  if vuelta - ida > 366 then
    raise exception 'Un viaje puede durar como mucho un año.';
  end if;
  if exists (
    select 1 from unnest(personas) as p (id)
    where not exists (select 1 from public.miembros m where m.id = p.id and m.hogar_id = mi_hogar)
  ) then
    raise exception 'Solo puede irse de viaje gente de tu hogar.';
  end if;

  delete from public.viajes where grupo = el_grupo;
  insert into public.viajes (hogar_id, grupo, miembro_id, desde, hasta, destino)
  select distinct mi_hogar, el_grupo, p.id, ida, vuelta, nullif(trim(lugar), '')
  from unnest(personas) as p (id);
  return el_grupo;
end;
$$;

revoke execute on function public.guardar_viaje(uuid, uuid[], date, date, text) from public, anon;
grant execute on function public.guardar_viaje(uuid, uuid[], date, date, text) to authenticated;

-- ---------------------------------------------------------------------
-- Aviso de las 8:00 teniendo en cuenta los viajes
-- ---------------------------------------------------------------------

create or replace function public.recordatorios_del_dia(dia date)
returns table (
  aviso_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  titulos text[],
  total integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with fuera as (
    -- Quién está de viaje ese día.
    select distinct v.miembro_id from public.viajes v where dia between v.desde and v.hasta
  ),
  hogares_con_alguien as (
    -- Hogares en los que queda al menos una persona en casa.
    select distinct m.hogar_id from public.miembros m
    where m.id not in (select miembro_id from fuera)
  )
  select a.id, a.endpoint, a.p256dh, a.auth,
         (array_agg(t.titulo order by t.fecha_limite, t.creado_en))[1:3],
         count(*)::integer
  from public.avisos_push a
  join public.miembros m on m.user_id = a.user_id
  join public.tareas t on t.hogar_id = m.hogar_id
  where not t.completada
    and t.fecha_limite <= dia
    and a.ultimo_envio is distinct from dia
    and case
      -- Sin nadie en casa: como siempre (lo tuyo y lo que no es de nadie).
      when m.hogar_id not in (select hogar_id from hogares_con_alguien)
        then t.responsable_id is null or t.responsable_id = m.id
      -- Si estás de viaje, no te llega nada.
      when m.id in (select miembro_id from fuera) then false
      -- En casa: lo tuyo, lo que no es de nadie y lo de quien está fuera.
      else t.responsable_id is null
        or t.responsable_id = m.id
        or t.responsable_id in (select miembro_id from fuera)
    end
  group by a.id, a.endpoint, a.p256dh, a.auth
$$;

-- Sigue siendo solo para el servidor.
revoke execute on function public.recordatorios_del_dia(date) from public, anon, authenticated;
grant execute on function public.recordatorios_del_dia(date) to service_role;

commit;
