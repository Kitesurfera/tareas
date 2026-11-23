-- =====================================================================
-- Resumen de la semana: el aviso del domingo a las 20:00 con lo que viene
-- de lunes a domingo (tareas, planes, renovaciones y viajes)
--
-- Necesita que antes se hayan ejecutado todos los SQL anteriores.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
-- Se puede ejecutar varias veces: si ya estaba aplicado, no cambia nada.
--
-- Qué hace:
--   * avisos_push.ultimo_resumen: la semana (su lunes) del último resumen
--     que recibió cada móvil, para que nadie lo reciba dos veces.
--   * resumen_de_la_semana: las cuentas de cada persona para el aviso
--     (solo las puede pedir el servidor). Solo números y nombres de quien
--     está de viaje: nada de títulos.
--
-- Seguridad: nadie puede llamar a resumen_de_la_semana desde la app; cada
-- persona solo recibe las cuentas de su propio hogar.
-- =====================================================================

begin;

do $$
begin
  if to_regclass('public.calendarios_externos') is null then
    raise exception 'Falta un SQL anterior: ejecuta antes 20261123180000_calendarios_externos.sql';
  end if;
end;
$$;

alter table public.avisos_push add column if not exists ultimo_resumen date;

-- Las cuentas de la semana que empieza el lunes «lunes», para cada móvil.
--   * tareas: pendientes con fecha hasta el domingo (todo el hogar,
--     también lo que viene de antes).
--   * atrasadas: de esas, las que ya tenían que estar hechas (antes de hoy).
--   * tuyas: de esas, las que te tocan (teniendo en cuenta los viajes,
--     igual que la app: lo de quien está fuera lo cubre quien se queda).
--   * planes: los del calendario esa semana, sin hacer.
--   * renovaciones e importe: seguros y suscripciones que se renuevan.
--   * documentos: los que caducan esa semana.
--   * fuera / yo_fuera: quién está de viaje algún día de la semana.
--   * dias_sin_nadie: días de la semana sin nadie en casa.
-- Con «solo_usuario», solo los móviles de esa persona (para «Probar»),
-- aunque ya hayan recibido el resumen. Sin él, se saltan los móviles que
-- ya lo recibieron esa semana.
create or replace function public.resumen_de_la_semana(lunes date, solo_usuario uuid default null)
returns table (
  aviso_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  tareas integer,
  atrasadas integer,
  tuyas integer,
  planes integer,
  renovaciones integer,
  importe numeric,
  documentos integer,
  fuera text[],
  yo_fuera boolean,
  dias_sin_nadie integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with
  hoy as (
    select (now() at time zone 'Europe/Madrid')::date as dia
  ),
  dias as (
    -- Los días que cuentan: de hoy (si es antes) al domingo.
    select d::date as dia
    from generate_series(least(lunes, (select dia from hoy)), lunes + 6, interval '1 day') d
  ),
  fuera_dia as (
    -- Quién está de viaje cada uno de esos días.
    select distinct v.miembro_id, d.dia
    from public.viajes v
    join dias d on d.dia between v.desde and v.hasta
  ),
  sin_nadie as (
    -- Días en los que no queda nadie en casa, por hogar.
    select h.id as hogar_id, d.dia
    from public.hogares h
    cross join dias d
    where not exists (
      select 1 from public.miembros m
      where m.hogar_id = h.id
        and not exists (select 1 from fuera_dia f where f.miembro_id = m.id and f.dia = d.dia)
    )
  ),
  moviles as (
    select a.id, a.endpoint, a.p256dh, a.auth, a.user_id
    from public.avisos_push a
    where case
      when solo_usuario is null then a.ultimo_resumen is distinct from lunes
      else a.user_id = solo_usuario
    end
  ),
  personas as (
    select m.id, m.hogar_id
    from public.miembros m
    where m.user_id in (select user_id from moviles)
  ),
  pendientes as (
    -- Lo pendiente hasta el domingo de las personas que reciben el aviso,
    -- con el día que cuenta para saber quién lo cubre (su fecha, u hoy si
    -- ya pasó).
    select t.hogar_id, t.fecha_limite, t.responsable_id,
           greatest(t.fecha_limite, (select dia from hoy)) as dia
    from public.tareas t
    where not t.completada
      and t.fecha_limite <= lunes + 6
      and t.hogar_id in (select hogar_id from personas)
  ),
  renovaciones as (
    -- Cada seguro o suscripción, las veces que se renueva esa semana.
    select v.hogar_id, v.importe
    from public.vencimientos v
    cross join lateral (
      select case
        when v.frecuencia_meses is null then 0
        else ((extract(year from lunes)::int - extract(year from v.fecha_renovacion)::int) * 12
              + extract(month from lunes)::int - extract(month from v.fecha_renovacion)::int)
             / v.frecuencia_meses
      end as vueltas
    ) b
    cross join lateral generate_series(
      greatest(b.vueltas - 1, 0),
      case when v.frecuencia_meses is null then 0 else greatest(b.vueltas + 1, 0) end
    ) k
    where v.hogar_id in (select hogar_id from personas)
      and (v.fecha_renovacion + make_interval(months => k * coalesce(v.frecuencia_meses, 0)))::date
          between lunes and lunes + 6
  ),
  cuentas as (
    select
      p.id as miembro_id,
      (select count(*) from pendientes t where t.hogar_id = p.hogar_id)::integer as tareas,
      (select count(*) from pendientes t
        where t.hogar_id = p.hogar_id and t.fecha_limite < (select dia from hoy))::integer as atrasadas,
      (select count(*) from pendientes t
        where t.hogar_id = p.hogar_id
          and case
            -- Lo tuyo, si estás en casa (o si no queda nadie en casa).
            when t.responsable_id = p.id then
              not exists (select 1 from fuera_dia f where f.miembro_id = p.id and f.dia = t.dia)
              or exists (select 1 from sin_nadie s where s.hogar_id = p.hogar_id and s.dia = t.dia)
            -- Lo de quien está de viaje, si tú te quedas.
            when t.responsable_id is not null then
              exists (select 1 from fuera_dia f where f.miembro_id = t.responsable_id and f.dia = t.dia)
              and not exists (select 1 from fuera_dia f where f.miembro_id = p.id and f.dia = t.dia)
            else false
          end)::integer as tuyas,
      (select count(*) from public.agenda_planes ap
        where ap.hogar_id = p.hogar_id and not ap.hecho
          and ap.fecha between lunes and lunes + 6)::integer as planes,
      (select count(*) from renovaciones r where r.hogar_id = p.hogar_id)::integer as renovaciones,
      (select coalesce(sum(r.importe), 0) from renovaciones r where r.hogar_id = p.hogar_id) as importe,
      (select count(*) from public.documentos d
        where d.hogar_id = p.hogar_id and d.caduca_el between lunes and lunes + 6)::integer as documentos,
      array(
        select m.nombre_visible from public.miembros m
        where m.hogar_id = p.hogar_id and m.id <> p.id
          and exists (select 1 from fuera_dia f where f.miembro_id = m.id and f.dia >= lunes)
        order by m.creado_en, m.id
      ) as fuera,
      exists (select 1 from fuera_dia f where f.miembro_id = p.id and f.dia >= lunes) as yo_fuera,
      (select count(*) from sin_nadie s where s.hogar_id = p.hogar_id and s.dia >= lunes)::integer as dias_sin_nadie
    from personas p
  )
  select mv.id, mv.endpoint, mv.p256dh, mv.auth,
         c.tareas, c.atrasadas, c.tuyas, c.planes, c.renovaciones, c.importe, c.documentos,
         c.fuera, c.yo_fuera, c.dias_sin_nadie
  from moviles mv
  join public.miembros m on m.user_id = mv.user_id
  join cuentas c on c.miembro_id = m.id
$$;

revoke execute on function public.resumen_de_la_semana(date, uuid) from public, anon, authenticated;
grant execute on function public.resumen_de_la_semana(date, uuid) to service_role;

commit;
