-- =====================================================================
-- Tareas que se repiten (las creadas a mano)
--
-- Necesita que antes se hayan ejecutado todos los SQL anteriores.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
-- Se puede ejecutar varias veces: si ya estaba aplicado, no cambia nada.
--
-- Qué hace:
--   * Una tarea a mano puede repetirse cada X días, semanas, meses o años.
--     Al marcarla como hecha, la base de datos crea la siguiente:
--       - «en su fecha» (repetir_desde = fecha): como el alquiler, el día 1
--         de cada mes aunque se pague el 3. Los meses se cuentan desde la
--         primera fecha, así un día 31 no se va moviendo (31 ene, 28 feb,
--         31 mar…).
--       - «desde que se hace» (repetir_desde = hecha): como cambiar el
--         cepillo de dientes, 3 meses desde el día en que se hizo.
--   * Si se reabre una tarea, se quita la siguiente (si aún no se ha hecho).
--   * «En equipo»: la siguiente vez no cuenta como «pensar» otra vez.
--
-- Seguridad:
--   * Solo las tareas a mano se repiten (las automáticas ya tienen su regla).
--   * La primera fecha (repetir_ancla) y de qué tarea viene la siguiente
--     (repetida_de) los pone la base de datos; desde la app no se cambian.
-- =====================================================================

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tareas' and column_name = 'documento_id'
  ) then
    raise exception 'Falta un SQL anterior: ejecuta antes 20261123160000_documentos.sql';
  end if;
end;
$$;

alter table public.tareas add column if not exists repetir_cada smallint;
alter table public.tareas add column if not exists repetir_unidad text;
alter table public.tareas add column if not exists repetir_desde text;
alter table public.tareas add column if not exists repetir_ancla date;
alter table public.tareas add column if not exists repetida_de uuid;

create index if not exists tareas_repetida_de_idx on public.tareas (repetida_de) where repetida_de is not null;

alter table public.tareas drop constraint if exists se_repite_bien;
alter table public.tareas add constraint se_repite_bien check (
  -- O no se repite (los tres vacíos) o están los tres (un dato vacío no vale:
  -- en SQL dejaría pasar la comprobación).
  num_nonnulls(repetir_cada, repetir_unidad, repetir_desde) = 0
  or (
    num_nonnulls(repetir_cada, repetir_unidad, repetir_desde) = 3
    and repetir_cada between 1 and 365
    and repetir_unidad in ('dias', 'semanas', 'meses', 'anios')
    and repetir_desde in ('fecha', 'hecha')
    -- Para repetirse hace falta una fecha, y solo las tareas a mano.
    and fecha_limite is not null
    and tratamiento_id is null and vencimiento_id is null and rutina_id is null
    and cuidado_id is null and documento_id is null
  )
);

-- Desde la app se eligen cada cuánto y cómo; lo demás lo pone la base de datos.
grant insert (repetir_cada, repetir_unidad, repetir_desde) on public.tareas to authenticated;
grant update (repetir_cada, repetir_unidad, repetir_desde) on public.tareas to authenticated;

-- La primera fecha de la serie: se pone al crearla y se mueve si alguien
-- cambia la fecha o cómo se repite (la siguiente vez la copia tal cual).
create or replace function public.ancla_de_repeticion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.repetir_cada is null then
    new.repetir_ancla := null;
  elsif tg_op = 'INSERT' then
    new.repetir_ancla := coalesce(new.repetir_ancla, new.fecha_limite);
  elsif new.fecha_limite is distinct from old.fecha_limite
     or new.repetir_cada is distinct from old.repetir_cada
     or new.repetir_unidad is distinct from old.repetir_unidad
     or new.repetir_desde is distinct from old.repetir_desde then
    new.repetir_ancla := new.fecha_limite;
  end if;
  return new;
end;
$$;

drop trigger if exists ancla_de_repeticion on public.tareas;
create trigger ancla_de_repeticion
  before insert or update on public.tareas
  for each row execute function public.ancla_de_repeticion();

revoke execute on function public.ancla_de_repeticion() from public, anon, authenticated;

-- Cuándo toca la siguiente vez de una tarea que se repite.
create or replace function public.siguiente_repeticion(t public.tareas, hecha_el date)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when t.repetir_desde = 'hecha' then
      case t.repetir_unidad
        when 'dias' then hecha_el + t.repetir_cada
        when 'semanas' then hecha_el + 7 * t.repetir_cada
        when 'meses' then (hecha_el + make_interval(months => t.repetir_cada))::date
        else (hecha_el + make_interval(years => t.repetir_cada))::date
      end
    else
      case t.repetir_unidad
        when 'dias' then t.fecha_limite + t.repetir_cada
        when 'semanas' then t.fecha_limite + 7 * t.repetir_cada
        -- Meses y años desde la primera fecha: un 31 sigue siendo 31 cuando se puede.
        when 'meses' then (coalesce(t.repetir_ancla, t.fecha_limite) + make_interval(months =>
          ((extract(year from t.fecha_limite) - extract(year from coalesce(t.repetir_ancla, t.fecha_limite))) * 12
            + extract(month from t.fecha_limite) - extract(month from coalesce(t.repetir_ancla, t.fecha_limite)))::int
          + t.repetir_cada))::date
        else (coalesce(t.repetir_ancla, t.fecha_limite) + make_interval(years =>
          (extract(year from t.fecha_limite) - extract(year from coalesce(t.repetir_ancla, t.fecha_limite)))::int
          + t.repetir_cada))::date
      end
  end
$$;

revoke execute on function public.siguiente_repeticion(public.tareas, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- cerrar_tarea: igual que antes y, si la tarea se repite, crea la siguiente
-- ---------------------------------------------------------------------

create or replace function public.cerrar_tarea(la_tarea uuid, hecha_el date, quien uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tarea public.tareas%rowtype;
  vencimiento public.vencimientos%rowtype;
  rutina public.rutinas%rowtype;
  quien_la_hizo uuid;
  siguiente_responsable uuid;
  siguiente date;
  vueltas integer := 0;
begin
  select * into tarea from public.tareas t where t.id = la_tarea for update;

  if not found then
    raise exception 'No encontramos esa tarea en tu hogar.';
  end if;
  if tarea.completada then
    raise exception 'Esa tarea ya estaba hecha.';
  end if;
  -- +1 día de margen: la base de datos usa la hora UTC y en España ya
  -- puede ser «mañana».
  if hecha_el is null or hecha_el > current_date + 1 or hecha_el <= date '1980-01-01' then
    raise exception 'Elige una fecha que no sea futura.';
  end if;

  update public.tareas
  set completada = true, completada_por = quien, completada_en = now()
  where id = tarea.id;

  if tarea.tratamiento_id is not null then
    update public.tratamientos set fecha_ultima = hecha_el where id = tarea.tratamiento_id;
  end if;

  if tarea.cuidado_id is not null then
    update public.cuidados set fecha_ultima = hecha_el where id = tarea.cuidado_id;
  end if;

  if tarea.rutina_id is not null then
    select * into rutina from public.rutinas where id = tarea.rutina_id for update;
    siguiente_responsable := rutina.responsable_id;

    if rutina.turnos then
      -- Si la hace alguien de fuera del hogar (acceso temporal), no hay
      -- nadie aquí: el turno sigue como si la hubiera hecho a quien le tocaba.
      select m.id into quien_la_hizo
      from public.miembros m
      where m.user_id = quien and m.hogar_id = rutina.hogar_id;

      -- Las participantes (o todo el hogar) en orden de llegada. El turno
      -- pasa a quien va después de quien la ha hecho; si quien la ha hecho
      -- no participa, a quien va después de la persona a la que le tocaba.
      -- Tras la última, la primera.
      with orden as (
        select m.id,
               row_number() over (order by m.creado_en, m.id) as puesto,
               count(*) over () as total
        from public.miembros m
        where m.hogar_id = rutina.hogar_id
          and (rutina.participantes is null or m.id = any (rutina.participantes))
      )
      select coalesce(
        (select despues.id
           from orden actual
           join orden despues on despues.puesto = actual.puesto % actual.total + 1
          where actual.id = coalesce(
            (select id from orden where id = quien_la_hizo),
            rutina.responsable_id
          )),
        (select id from orden where puesto = 1)
      ) into siguiente_responsable;
    end if;

    update public.rutinas
    set fecha_ultima = hecha_el, responsable_id = siguiente_responsable
    where id = rutina.id;
  end if;

  if tarea.vencimiento_id is not null then
    select * into vencimiento from public.vencimientos where id = tarea.vencimiento_id for update;
    if vencimiento.frecuencia_meses is null then
      -- No se repite: apuntamos que este aviso ya está hecho.
      update public.vencimientos set revisado_para = vencimiento.fecha_renovacion
      where id = vencimiento.id;
    else
      -- Salta a la siguiente renovación que todavía no haya pasado.
      loop
        vueltas := vueltas + 1;
        siguiente := (vencimiento.fecha_renovacion
          + make_interval(months => vencimiento.frecuencia_meses * vueltas))::date;
        exit when siguiente > current_date;
      end loop;
      update public.vencimientos set fecha_renovacion = siguiente where id = vencimiento.id;
    end if;
  end if;

  -- Tarea a mano que se repite: la siguiente vez, igual que esta.
  if tarea.repetir_cada is not null and tarea.fecha_limite is not null then
    insert into public.tareas (
      hogar_id, titulo, descripcion, fecha_limite, responsable_id, categoria, mascota_id,
      creada_por, repetir_cada, repetir_unidad, repetir_desde, repetir_ancla, repetida_de
    )
    values (
      tarea.hogar_id, tarea.titulo, tarea.descripcion, public.siguiente_repeticion(tarea, hecha_el),
      tarea.responsable_id, tarea.categoria, tarea.mascota_id,
      tarea.creada_por, tarea.repetir_cada, tarea.repetir_unidad, tarea.repetir_desde,
      case when tarea.repetir_desde = 'fecha' then tarea.repetir_ancla end, tarea.id
    );
  end if;
end;
$$;

revoke execute on function public.cerrar_tarea(uuid, date, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- reabrir_tarea: igual que antes y, si se repetía, quita la siguiente vez
-- (si todavía no se ha hecho)
-- ---------------------------------------------------------------------

create or replace function public.reabrir_tarea(tarea_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tarea public.tareas%rowtype;
begin
  select * into tarea
  from public.tareas t
  where t.id = tarea_id and t.hogar_id = public.mi_hogar_id()
  for update;

  if not found then
    raise exception 'No encontramos esa tarea en tu hogar.';
  end if;
  if tarea.tratamiento_id is not null or tarea.vencimiento_id is not null
     or tarea.rutina_id is not null or tarea.cuidado_id is not null
     or tarea.documento_id is not null then
    raise exception 'Las tareas automáticas no se pueden reabrir: cambia la fecha en su tratamiento, rutina, cuidado, vencimiento o documento.';
  end if;
  if not tarea.completada then
    return;
  end if;

  update public.tareas
  set completada = false, completada_por = null, completada_en = null
  where id = tarea.id;

  delete from public.tareas t
  where t.repetida_de = tarea.id and not t.completada and t.hogar_id = tarea.hogar_id;
end;
$$;

-- ---------------------------------------------------------------------
-- «En equipo»: la siguiente vez de una tarea que se repite no es «pensar»
-- (ya se pensó al crearla)
-- ---------------------------------------------------------------------

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

commit;
