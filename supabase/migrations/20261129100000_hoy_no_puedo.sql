-- =====================================================================
-- «🙋 Hoy no puedo»: pedir a otra persona de casa que se encargue de
-- tus tareas (las de hoy o las que elijas)
--
-- Necesita que antes se hayan ejecutado todos los SQL anteriores.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
-- Se puede ejecutar varias veces: si ya estaba aplicado, no cambia nada.
--
-- Qué hace:
--   * peticiones_ayuda: quién pide ayuda, a quién, con qué tareas y un
--     mensaje opcional («🤒 estoy mala»). Se crea con pedir_ayuda y se
--     contesta con responder_ayuda (o se cancela con cancelar_ayuda).
--   * Si la otra persona acepta, esas tareas pasan a ser suyas SOLO ESTA
--     VEZ: la tarea apunta de quién era (prestada_de) y, si se repite, la
--     siguiente vuelve a ser de quien la tenía.
--   * El aviso al móvil lo manda el servidor (api/aviso-ayuda.ts), una
--     vez al pedir y otra al contestar.
--   * Si quien cubría se va del hogar, lo prestado vuelve a quien lo tenía.
--
-- Seguridad:
--   * Una petición solo la ven quien la pide y a quien se la piden (ni
--     otras personas del hogar, ni otros hogares).
--   * Solo se puede pedir ayuda con tareas pendientes que son tuyas (o de
--     nadie) y a alguien de tu hogar; solo contesta la persona a quien se
--     pide. Como mucho 10 peticiones al día por persona.
-- =====================================================================

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tareas' and column_name = 'repetida_de'
  ) then
    raise exception 'Falta un SQL anterior: ejecuta antes 20261128100000_tareas_que_se_repiten.sql';
  end if;
end;
$$;

-- De quién era una tarea que otra persona ha aceptado hacer (solo esa vez).
alter table public.tareas add column if not exists prestada_de uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'prestada_de_alguien_del_hogar') then
    alter table public.tareas add constraint prestada_de_alguien_del_hogar
      foreign key (prestada_de, hogar_id) references public.miembros (id, hogar_id) on delete set null (prestada_de);
  end if;
end;
$$;

create table if not exists public.peticiones_ayuda (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  de_miembro uuid not null,
  para_miembro uuid not null,
  tareas uuid[] not null check (cardinality(tareas) between 1 and 30),
  mensaje text check (char_length(mensaje) <= 200),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'rechazada', 'cancelada')),
  creado_en timestamptz not null default now(),
  respondida_en timestamptz,
  -- Cuándo mandó el servidor el aviso al pedir y al contestar (una vez cada uno).
  avisada_en timestamptz,
  respuesta_avisada_en timestamptz,
  constraint a_otra_persona check (de_miembro <> para_miembro),
  constraint pide_alguien_del_hogar foreign key (de_miembro, hogar_id)
    references public.miembros (id, hogar_id) on delete cascade,
  constraint a_alguien_del_hogar foreign key (para_miembro, hogar_id)
    references public.miembros (id, hogar_id) on delete cascade
);

create index if not exists peticiones_ayuda_hogar_idx on public.peticiones_ayuda (hogar_id, creado_en);

alter table public.peticiones_ayuda enable row level security;
revoke all on public.peticiones_ayuda from anon, authenticated;
grant select on public.peticiones_ayuda to authenticated;

drop policy if exists "Veo las peticiones que son conmigo" on public.peticiones_ayuda;
create policy "Veo las peticiones que son conmigo" on public.peticiones_ayuda for select to authenticated
  using (
    hogar_id = (select public.mi_hogar_id())
    and (de_miembro = (select public.mi_miembro_id()) or para_miembro = (select public.mi_miembro_id()))
  );

-- Lo que necesita el servidor para mandar los avisos (y apuntar que ya los mandó).
grant select on public.peticiones_ayuda to service_role;
grant update (avisada_en, respuesta_avisada_en) on public.peticiones_ayuda to service_role;
grant select (id, user_id, hogar_id, nombre_visible) on public.miembros to service_role;

-- ---------------------------------------------------------------------
-- Pedir, contestar y cancelar
-- ---------------------------------------------------------------------

create or replace function public.pedir_ayuda(para uuid, las_tareas uuid[], mensaje text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  yo uuid := public.mi_miembro_id();
  mi_hogar uuid := public.mi_hogar_id();
  nueva uuid;
  texto text := nullif(trim(regexp_replace(coalesce(mensaje, ''), '\s+', ' ', 'g')), '');
begin
  if yo is null or mi_hogar is null then
    raise exception 'Tienes que entrar con tu cuenta y ser de un hogar.';
  end if;
  if para = yo then
    raise exception 'Pídeselo a otra persona de casa.';
  end if;
  if not exists (select 1 from public.miembros m where m.id = para and m.hogar_id = mi_hogar) then
    raise exception 'Esa persona no está en tu hogar.';
  end if;
  if las_tareas is null or cardinality(las_tareas) = 0 then
    raise exception 'Elige al menos una tarea.';
  end if;
  if cardinality(las_tareas) > 30 then
    raise exception 'Como mucho 30 tareas cada vez.';
  end if;
  if exists (
    select unnest(las_tareas)
    except
    select t.id from public.tareas t
    where t.hogar_id = mi_hogar and not t.completada and (t.responsable_id = yo or t.responsable_id is null)
  ) then
    raise exception 'Solo puedes pedir ayuda con tus tareas pendientes.';
  end if;
  if char_length(texto) > 200 then
    raise exception 'El mensaje es demasiado largo (como mucho 200 letras).';
  end if;
  if (select count(*) from public.peticiones_ayuda p where p.de_miembro = yo and p.creado_en > now() - interval '1 day') >= 10 then
    raise exception 'Ya has pedido ayuda muchas veces hoy. Habladlo en persona 💚';
  end if;

  insert into public.peticiones_ayuda (hogar_id, de_miembro, para_miembro, tareas, mensaje)
  values (mi_hogar, yo, para, (select array_agg(distinct x) from unnest(las_tareas) x), texto)
  returning id into nueva;
  return nueva;
end;
$$;

-- Contesta quien recibe la petición. Si acepta, las tareas (las que sigan
-- pendientes y sigan siendo de quien pidió, o de nadie) pasan a ser suyas.
-- Devuelve cuántas tareas ha cogido.
create or replace function public.responder_ayuda(peticion uuid, acepta boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.peticiones_ayuda%rowtype;
  cogidas integer := 0;
begin
  select * into p from public.peticiones_ayuda x
  where x.id = peticion and x.para_miembro = public.mi_miembro_id()
  for update;
  if not found then
    raise exception 'No encontramos esa petición.';
  end if;
  if p.estado <> 'pendiente' then
    raise exception 'Esa petición ya no está pendiente.';
  end if;

  if acepta then
    update public.tareas t
    set prestada_de = case when t.responsable_id = p.de_miembro then coalesce(t.prestada_de, p.de_miembro) else t.prestada_de end,
        responsable_id = p.para_miembro
    where t.id = any (p.tareas)
      and t.hogar_id = p.hogar_id
      and not t.completada
      and (t.responsable_id = p.de_miembro or t.responsable_id is null);
    get diagnostics cogidas = row_count;
  end if;

  update public.peticiones_ayuda
  set estado = case when acepta then 'aceptada' else 'rechazada' end, respondida_en = now()
  where id = p.id;
  return cogidas;
end;
$$;

create or replace function public.cancelar_ayuda(peticion uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.peticiones_ayuda
  set estado = 'cancelada', respondida_en = now()
  where id = peticion and de_miembro = public.mi_miembro_id() and estado = 'pendiente';
  if not found then
    raise exception 'Esa petición ya no está pendiente.';
  end if;
end;
$$;

revoke execute on function public.pedir_ayuda(uuid, uuid[], text) from public, anon;
revoke execute on function public.responder_ayuda(uuid, boolean) from public, anon;
revoke execute on function public.cancelar_ayuda(uuid) from public, anon;
grant execute on function public.pedir_ayuda(uuid, uuid[], text) to authenticated;
grant execute on function public.responder_ayuda(uuid, boolean) to authenticated;
grant execute on function public.cancelar_ayuda(uuid) to authenticated;

-- Si alguien se va del hogar, lo que había cogido «solo esta vez» vuelve a
-- quien lo tenía (antes de que la base de datos lo deje sin responsable).
create or replace function public.devolver_tareas_prestadas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tareas
  set responsable_id = prestada_de, prestada_de = null
  where responsable_id = old.id and prestada_de is not null and prestada_de <> old.id and not completada;
  return old;
end;
$$;

drop trigger if exists devolver_tareas_prestadas on public.miembros;
create trigger devolver_tareas_prestadas
  before delete on public.miembros
  for each row execute function public.devolver_tareas_prestadas();

revoke execute on function public.devolver_tareas_prestadas() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- cerrar_tarea: igual que antes, pero la siguiente vez de una tarea que
-- se repite vuelve a ser de quien la tenía (si se prestó esta vez)
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

  -- Tarea a mano que se repite: la siguiente vez, igual que esta (y de quien
  -- la tenía, si esta vez la hizo otra persona por «Hoy no puedo»).
  if tarea.repetir_cada is not null and tarea.fecha_limite is not null then
    insert into public.tareas (
      hogar_id, titulo, descripcion, fecha_limite, responsable_id, categoria, mascota_id,
      creada_por, repetir_cada, repetir_unidad, repetir_desde, repetir_ancla, repetida_de
    )
    values (
      tarea.hogar_id, tarea.titulo, tarea.descripcion, public.siguiente_repeticion(tarea, hecha_el),
      coalesce(tarea.prestada_de, tarea.responsable_id), tarea.categoria, tarea.mascota_id,
      tarea.creada_por, tarea.repetir_cada, tarea.repetir_unidad, tarea.repetir_desde,
      case when tarea.repetir_desde = 'fecha' then tarea.repetir_ancla end, tarea.id
    );
  end if;
end;
$$;

revoke execute on function public.cerrar_tarea(uuid, date, uuid) from public, anon, authenticated;

commit;
