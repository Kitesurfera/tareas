-- =====================================================================
-- Turnos que rotan en las rutinas de casa
--
-- Necesita que antes se hayan ejecutado todos los SQL anteriores.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
--
-- Cómo funciona:
--   * Cada rutina puede tener «turnos» activados.
--   * Al marcarla como hecha, la siguiente vez le toca a la persona que
--     va DESPUÉS de quien la ha hecho (por orden de llegada al hogar,
--     y al llegar al final se vuelve a empezar).
--   * Si haces la rutina en el turno de otra persona, cuenta como tu
--     turno: así nadie hace dos seguidas por haber echado una mano.
-- =====================================================================

begin;

alter table public.rutinas add column turnos boolean not null default false;

-- Se puede activar y desactivar desde la app.
grant insert (turnos), update (turnos) on public.rutinas to authenticated;

-- completar_tarea: igual que antes, y además rota el turno de las rutinas.
create or replace function public.completar_tarea(tarea_id uuid, hecha_el date default current_date)
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
  select * into tarea
  from public.tareas t
  where t.id = tarea_id and t.hogar_id = public.mi_hogar_id()
  for update;

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
  set completada = true, completada_por = auth.uid(), completada_en = now()
  where id = tarea.id;

  if tarea.tratamiento_id is not null then
    update public.tratamientos set fecha_ultima = hecha_el where id = tarea.tratamiento_id;
  end if;

  if tarea.rutina_id is not null then
    select * into rutina from public.rutinas where id = tarea.rutina_id for update;
    siguiente_responsable := rutina.responsable_id;

    if rutina.turnos then
      select m.id into quien_la_hizo
      from public.miembros m
      where m.user_id = auth.uid() and m.hogar_id = rutina.hogar_id;

      -- La gente del hogar en orden de llegada; buscamos a quien va
      -- después de quien la ha hecho (y tras la última, la primera).
      with orden as (
        select m.id,
               row_number() over (order by m.creado_en, m.id) as puesto,
               count(*) over () as total
        from public.miembros m
        where m.hogar_id = rutina.hogar_id
      )
      select coalesce(
        (select despues.id
           from orden actual
           join orden despues on despues.puesto = actual.puesto % actual.total + 1
          where actual.id = quien_la_hizo),
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
end;
$$;

revoke execute on function public.completar_tarea(uuid, date) from public, anon;
grant execute on function public.completar_tarea(uuid, date) to authenticated;

commit;
