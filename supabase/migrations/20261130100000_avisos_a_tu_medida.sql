-- =====================================================================
-- ⏰ Avisos a tu medida: cada persona elige cómo le llegan los avisos
--
-- Necesita que antes se hayan ejecutado todos los SQL anteriores.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
-- Se puede ejecutar varias veces: si ya estaba aplicado, no cambia nada.
--
-- Qué hace:
--   * ajustes_avisos: lo que elige cada persona (si no ha elegido nada,
--     todo sigue como hasta ahora):
--       - a qué hora le llega el aviso diario (de 6:00 a 23:00; antes,
--         siempre a las 8:00);
--       - un segundo aviso por la tarde, solo si le queda algo de hoy;
--       - días de la semana sin aviso diario (por ejemplo, el domingo);
--       - una pausa hasta una fecha (vacaciones);
--       - si quiere o no el resumen del domingo.
--   * avisos_push.ultimo_aviso_tarde: para no mandar el de la tarde dos
--     veces el mismo día.
--   * pendientes_de_la_tarde: lo que le queda de hoy a cada móvil (con las
--     mismas reglas que el aviso de la mañana: lo tuyo, lo que no es de
--     nadie, los viajes y los encargos de quien ayuda).
--   * recordatorios_del_dia hace lo mismo que antes; solo se ha separado
--     la parte de las tareas para que la use también el aviso de la tarde.
--   * Qué toca a cada hora lo decide el servidor (api/recordatorios.ts),
--     que ahora Vercel llama cada hora.
--
-- Seguridad:
--   * Los ajustes de cada persona solo los ve y cambia ella (ni su pareja).
--     Nadie puede guardar ajustes en nombre de otra persona.
--   * Lo que se manda en los avisos solo lo puede preparar el servidor.
-- =====================================================================

begin;

do $$
begin
  if to_regclass('public.fechas_especiales') is null or to_regclass('public.avisos_push') is null then
    raise exception 'Falta un SQL anterior: ejecuta antes 20261126100000_regalos.sql';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Lo que elige cada persona
-- ---------------------------------------------------------------------

create table if not exists public.ajustes_avisos (
  -- Eres tú: lo pone la base de datos.
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- Hora del aviso diario, en hora de España.
  hora smallint not null default 8 check (hora between 6 and 23),
  -- Segundo aviso por la tarde (solo si queda algo de hoy).
  tarde boolean not null default false,
  hora_tarde smallint not null default 20 check (hora_tarde between 12 and 23),
  -- Días sin aviso diario: 1 = lunes … 7 = domingo.
  dias_libres smallint[] not null default '{}'
    check (dias_libres <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[] and array_position(dias_libres, null) is null),
  -- Sin ningún aviso hasta este día (incluido). Vacío = sin pausa.
  pausa_hasta date,
  -- El resumen de la semana de los domingos.
  resumen_semanal boolean not null default true,
  constraint la_tarde_despues_de_la_manana check (not tarde or hora_tarde > hora)
);

alter table public.ajustes_avisos enable row level security;
revoke all on public.ajustes_avisos from anon, authenticated;
grant select, delete on public.ajustes_avisos to authenticated;
-- user_id no: siempre eres tú (auth.uid()).
grant insert (hora, tarde, hora_tarde, dias_libres, pausa_hasta, resumen_semanal) on public.ajustes_avisos to authenticated;
grant update (hora, tarde, hora_tarde, dias_libres, pausa_hasta, resumen_semanal) on public.ajustes_avisos to authenticated;
grant select on public.ajustes_avisos to service_role;

drop policy if exists "Veo mis ajustes de avisos" on public.ajustes_avisos;
drop policy if exists "Guardo mis ajustes de avisos" on public.ajustes_avisos;
drop policy if exists "Cambio mis ajustes de avisos" on public.ajustes_avisos;
drop policy if exists "Borro mis ajustes de avisos" on public.ajustes_avisos;
create policy "Veo mis ajustes de avisos" on public.ajustes_avisos for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Guardo mis ajustes de avisos" on public.ajustes_avisos for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Cambio mis ajustes de avisos" on public.ajustes_avisos for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Borro mis ajustes de avisos" on public.ajustes_avisos for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 2. El aviso de la tarde, una vez al día como mucho
-- ---------------------------------------------------------------------

alter table public.avisos_push add column if not exists ultimo_aviso_tarde date;
grant update (ultimo_aviso_tarde) on public.avisos_push to service_role;

-- ---------------------------------------------------------------------
-- 3. Las tareas que avisar a cada móvil un día (interna)
--    Lo pendiente hasta ese día que es tuyo o no es de nadie, teniendo en
--    cuenta los viajes, y los encargos de quien ayuda. Es la parte de las
--    tareas que antes estaba dentro de recordatorios_del_dia, sin cambios.
-- ---------------------------------------------------------------------

create or replace function public.tareas_para_avisar(dia date)
returns table (
  aviso uuid,
  tarea uuid,
  titulo text,
  orden integer,
  fecha_limite date,
  creado_en timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with fuera as (
    -- Quién está de viaje ese día.
    select distinct v.miembro_id from public.viajes v where tareas_para_avisar.dia between v.desde and v.hasta
  ),
  hogares_con_alguien as (
    -- Hogares en los que queda al menos una persona en casa.
    select distinct m.hogar_id from public.miembros m
    where m.id not in (select miembro_id from fuera)
  ),
  de_mi_hogar as (
    select a.id as aviso, t.id as tarea, t.titulo, 1 as orden, t.fecha_limite, t.creado_en
    from public.avisos_push a
    join public.miembros m on m.user_id = a.user_id
    join public.tareas t on t.hogar_id = m.hogar_id
    where not t.completada
      and t.fecha_limite <= tareas_para_avisar.dia
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
  ),
  de_mis_encargos as (
    -- Quien ayuda con un acceso temporal: sus encargos de ese día.
    select a.id as aviso, t.id as tarea, t.titulo, 1 as orden, t.fecha_limite, t.creado_en
    from public.avisos_push a
    join public.accesos x on x.user_id = a.user_id
    join public.tareas t on t.hogar_id = x.hogar_id
    where not t.completada
      and t.fecha_limite <= tareas_para_avisar.dia
      and public.encargo_vigente(x, t, tareas_para_avisar.dia)
  )
  select * from de_mi_hogar
  union
  select * from de_mis_encargos
$$;

-- Nadie de la app la puede usar (solo las dos funciones de abajo).
revoke execute on function public.tareas_para_avisar(date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. El aviso de la mañana: igual que antes (tareas, planes y fechas
--    especiales), usando la parte de las tareas de arriba.
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
    select distinct v.miembro_id from public.viajes v where recordatorios_del_dia.dia between v.desde and v.hasta
  ),
  planes_de_hoy as (
    -- Los planes del calendario de ese día, para todo el hogar
    -- (menos quien está de viaje).
    select a.id as aviso, ap.id as tarea, '🎉 ' || p.nombre as titulo, 1 as orden, ap.fecha as fecha_limite, ap.creado_en
    from public.avisos_push a
    join public.miembros m on m.user_id = a.user_id
    join public.agenda_planes ap on ap.hogar_id = m.hogar_id
    join public.planes p on p.id = ap.plan_id
    where ap.fecha = recordatorios_del_dia.dia
      and not ap.hecho
      and m.id not in (select miembro_id from fuera)
  ),
  fechas_de_hoy as (
    -- Cumpleaños, aniversarios… de ese día, para todo el hogar. (Aquí
    -- «dia» sería la columna de fechas_especiales: el día que pide el
    -- servidor se escribe entero, recordatorios_del_dia.dia.)
    select a.id as aviso, f.id as tarea,
           case f.tipo when 'cumpleanos' then '🎂 ' when 'aniversario' then '💍 ' else '⭐ ' end
             || f.titulo
             || case
                  when f.anio is null or f.anio >= extract(year from recordatorios_del_dia.dia) then ''
                  when f.tipo = 'cumpleanos' then ' (cumple ' || (extract(year from recordatorios_del_dia.dia)::int - f.anio) || ')'
                  else ' (' || (extract(year from recordatorios_del_dia.dia)::int - f.anio) || ' años)'
                end as titulo,
           0 as orden, recordatorios_del_dia.dia as fecha_limite, f.creado_en
    from public.avisos_push a
    join public.miembros m on m.user_id = a.user_id
    join public.fechas_especiales f on f.hogar_id = m.hogar_id
    where public.es_el_dia(f.dia, f.mes, recordatorios_del_dia.dia)
  ),
  todo as (
    select * from public.tareas_para_avisar(recordatorios_del_dia.dia)
    union
    select * from planes_de_hoy
    union
    select * from fechas_de_hoy
  )
  select a.id, a.endpoint, a.p256dh, a.auth,
         (array_agg(todo.titulo order by todo.orden, todo.fecha_limite, todo.creado_en))[1:3],
         count(*)::integer
  from todo
  join public.avisos_push a on a.id = todo.aviso
  -- Los móviles que ya lo recibieron ese día, no.
  where a.ultimo_envio is distinct from recordatorios_del_dia.dia
  group by a.id, a.endpoint, a.p256dh, a.auth
$$;

revoke execute on function public.recordatorios_del_dia(date) from public, anon, authenticated;
grant execute on function public.recordatorios_del_dia(date) to service_role;

-- ---------------------------------------------------------------------
-- 5. El aviso de la tarde: solo las tareas que siguen pendientes (sin
--    planes ni fechas especiales, que ya salieron por la mañana).
-- ---------------------------------------------------------------------

create or replace function public.pendientes_de_la_tarde(dia date)
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
  select a.id, a.endpoint, a.p256dh, a.auth,
         (array_agg(t.titulo order by t.fecha_limite, t.creado_en))[1:3],
         count(*)::integer
  from public.tareas_para_avisar(pendientes_de_la_tarde.dia) t
  join public.avisos_push a on a.id = t.aviso
  -- Los móviles que ya lo recibieron ese día, no.
  where a.ultimo_aviso_tarde is distinct from pendientes_de_la_tarde.dia
  group by a.id, a.endpoint, a.p256dh, a.auth
$$;

revoke execute on function public.pendientes_de_la_tarde(date) from public, anon, authenticated;
grant execute on function public.pendientes_de_la_tarde(date) to service_role;

commit;
