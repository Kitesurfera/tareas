-- =====================================================================
-- Acceso temporal: dejar que alguien de fuera (quien cuida la mascota,
-- riega las plantas…) vea y haga algunas tareas durante unos días
--
-- Necesita que antes se hayan ejecutado todos los SQL anteriores.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
--
-- Qué hace:
--   * accesos: a quién se da acceso, de qué día a qué día y qué tareas
--     puede ver (por tipo, como «mascota», o una a una: rutinas,
--     tratamientos o tareas sueltas). Cada acceso tiene un enlace secreto.
--   * notas_encargo: las notas que deja quien ayuda.
--   * aceptar_acceso: quien recibe el enlace entra con Google y lo acepta.
--   * mis_encargos: lo que esa persona puede ver (solo sus encargos).
--   * completar_encargo y nota_para_el_hogar: marcar como hecho y dejar notas.
--   * completar_tarea se divide en dos: la parte común («cerrar la tarea»:
--     reprogramar tratamientos, pasar turnos…) va a una función interna,
--     cerrar_tarea, que usan tanto el hogar como quien ayuda.
--   * El aviso de las 8:00 también le llega a quien ayuda, con sus encargos.
--
-- Seguridad:
--   * Quien ayuda NO entra en el hogar: no puede leer ninguna tabla. Solo
--     puede usar aceptar_acceso, mis_encargos, completar_encargo y
--     nota_para_el_hogar, que comprueban que el acceso es suyo, que está
--     dentro de sus fechas y que la tarea es una de las que se le encargaron.
--   * El enlace es largo y al azar (no se puede adivinar) y solo lo puede
--     usar una persona.
--   * Cada hogar solo ve, crea, cambia y quita SUS accesos y notas (RLS).
--   * Un acceso dura como mucho 3 meses.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Piezas auxiliares
-- ---------------------------------------------------------------------

-- El día de hoy en España (el servidor funciona en hora universal).
create function public.hoy_en_espana()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Europe/Madrid')::date
$$;

-- Un código al azar sin letras que se confunden. gen_random_uuid() usa azar
-- criptográfico. 16 caracteres: imposible de adivinar.
create function public.codigo_al_azar(largo integer)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  letras constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := decode(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex');
  codigo text := '';
begin
  for posicion in 0..least(largo, 32) - 1 loop
    codigo := codigo || substr(letras, (get_byte(bytes, posicion) % length(letras)) + 1, 1);
  end loop;
  return codigo;
end;
$$;

grant execute on function public.codigo_al_azar(integer) to authenticated;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------

create table public.accesos (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  -- Cómo la llamáis en casa: «Marta (vecina)».
  nombre text not null check (char_length(trim(nombre)) between 1 and 40),
  codigo text not null unique default public.codigo_al_azar(16),
  -- Quién aceptó el enlace (vacío hasta que alguien lo acepta).
  user_id uuid references auth.users (id) on delete set null,
  desde date not null,
  hasta date not null,
  -- Qué puede ver: tipos enteros de tareas…
  categorias text[] not null default '{}'
    check (categorias <@ array['mascota', 'casa', 'coche', 'papeleo', 'otros']::text[]),
  -- …y/o cosas elegidas una a una.
  tareas uuid[] not null default '{}',
  rutinas uuid[] not null default '{}',
  tratamientos uuid[] not null default '{}',
  creada_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  constraint vuelta_despues_de_ida check (hasta >= desde),
  constraint como_mucho_tres_meses check (hasta - desde <= 92),
  constraint algo_encargado check (
    cardinality(categorias) + cardinality(tareas) + cardinality(rutinas) + cardinality(tratamientos) > 0
  ),
  constraint listas_razonables check (
    cardinality(tareas) <= 200 and cardinality(rutinas) <= 200 and cardinality(tratamientos) <= 200
  )
);

create index accesos_hogar_id_idx on public.accesos (hogar_id);
create index accesos_user_id_idx on public.accesos (user_id);

create table public.notas_encargo (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  acceso_id uuid references public.accesos (id) on delete set null,
  -- Copia del nombre y del título, para que la nota se entienda aunque
  -- luego se quite el acceso o se borre la tarea.
  autora text not null,
  tarea_titulo text,
  texto text not null check (char_length(trim(texto)) between 1 and 500),
  creado_en timestamptz not null default now()
);

create index notas_encargo_hogar_idx on public.notas_encargo (hogar_id, creado_en);

-- ---------------------------------------------------------------------
-- Seguridad de las tablas: solo la gente del hogar (nunca quien ayuda)
-- ---------------------------------------------------------------------

alter table public.accesos enable row level security;
alter table public.notas_encargo enable row level security;

revoke all on public.accesos from anon, authenticated;
revoke all on public.notas_encargo from anon, authenticated;

grant select, delete on public.accesos to authenticated;
-- El código, quién lo aceptó y quién lo creó los pone la base de datos.
grant insert (hogar_id, nombre, desde, hasta, categorias, tareas, rutinas, tratamientos)
  on public.accesos to authenticated;
grant update (nombre, desde, hasta, categorias, tareas, rutinas, tratamientos)
  on public.accesos to authenticated;
-- Las notas solo las escribe completar_encargo / nota_para_el_hogar.
grant select, delete on public.notas_encargo to authenticated;

create policy "Veo los accesos de mi hogar"
  on public.accesos for select to authenticated
  using (hogar_id = (select public.mi_hogar_id()));
create policy "Doy accesos de mi hogar"
  on public.accesos for insert to authenticated
  with check (hogar_id = (select public.mi_hogar_id()));
create policy "Cambio accesos de mi hogar"
  on public.accesos for update to authenticated
  using (hogar_id = (select public.mi_hogar_id()))
  with check (hogar_id = (select public.mi_hogar_id()));
create policy "Quito accesos de mi hogar"
  on public.accesos for delete to authenticated
  using (hogar_id = (select public.mi_hogar_id()));

create policy "Veo las notas de mi hogar"
  on public.notas_encargo for select to authenticated
  using (hogar_id = (select public.mi_hogar_id()));
create policy "Borro las notas de mi hogar"
  on public.notas_encargo for delete to authenticated
  using (hogar_id = (select public.mi_hogar_id()));

-- ---------------------------------------------------------------------
-- ¿Esta tarea es de este encargo, ese día?
-- ---------------------------------------------------------------------

create function public.encargo_vigente(acceso public.accesos, tarea public.tareas, dia date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    tarea.hogar_id = acceso.hogar_id
    and dia between acceso.desde and acceso.hasta
    and (tarea.fecha_limite is null or tarea.fecha_limite <= acceso.hasta)
    and (
      tarea.categoria = any (acceso.categorias)
      or tarea.id = any (acceso.tareas)
      or coalesce(tarea.rutina_id = any (acceso.rutinas), false)
      or coalesce(tarea.tratamiento_id = any (acceso.tratamientos), false)
    ),
    false
  )
$$;

-- ---------------------------------------------------------------------
-- Completar tareas: parte común (interna) + versión del hogar
-- ---------------------------------------------------------------------

-- Marca la tarea como hecha por «quien» y hace lo que toque según su
-- origen. NO comprueba permisos: solo la llaman completar_tarea y
-- completar_encargo, que sí los comprueban.
create function public.cerrar_tarea(la_tarea uuid, hecha_el date, quien uuid)
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
end;
$$;

revoke execute on function public.cerrar_tarea(uuid, date, uuid) from public, anon, authenticated;

-- La de siempre (gente del hogar): comprueba que la tarea es de tu hogar.
create or replace function public.completar_tarea(tarea_id uuid, hecha_el date default current_date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.tareas t where t.id = tarea_id and t.hogar_id = public.mi_hogar_id()
  ) then
    raise exception 'No encontramos esa tarea en tu hogar.';
  end if;
  perform public.cerrar_tarea(tarea_id, hecha_el, auth.uid());
end;
$$;

-- ---------------------------------------------------------------------
-- Lo que puede hacer quien ayuda
-- ---------------------------------------------------------------------

-- Aceptar el enlace. Devuelve el id del acceso.
create function public.aceptar_acceso(codigo_acceso text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  yo uuid := auth.uid();
  acceso public.accesos%rowtype;
begin
  if yo is null then
    raise exception 'Tienes que entrar con tu cuenta primero.';
  end if;
  select * into acceso from public.accesos a
  where a.codigo = upper(trim(codigo_acceso))
  for update;
  if not found then
    raise exception 'Ese enlace de acceso no existe o ya no vale.';
  end if;
  if acceso.hasta < public.hoy_en_espana() then
    raise exception 'Ese acceso ya ha terminado.';
  end if;
  if acceso.hogar_id = public.mi_hogar_id() then
    raise exception 'Ya eres de este hogar: no necesitas acceso temporal.';
  end if;
  if acceso.user_id is not null and acceso.user_id <> yo then
    raise exception 'Este enlace ya lo está usando otra persona. Pide uno nuevo.';
  end if;
  update public.accesos set user_id = yo where id = acceso.id;
  return acceso.id;
end;
$$;

-- Tus encargos (los que no han terminado): de qué hogar, hasta cuándo,
-- qué tareas tienes pendientes, las mascotas de esas tareas y lo que ya
-- has hecho. Antes de que empiece, solo se ven las fechas.
create function public.mis_encargos()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(e.datos order by e.desde), '[]'::jsonb)
  from (
    select a.desde, jsonb_build_object(
      'id', a.id,
      'hogar', h.nombre,
      'nombre', a.nombre,
      'desde', a.desde,
      'hasta', a.hasta,
      'activo', public.hoy_en_espana() between a.desde and a.hasta,
      'tareas', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', t.id,
                 'titulo', t.titulo,
                 'descripcion', t.descripcion,
                 'fecha_limite', t.fecha_limite,
                 'categoria', t.categoria,
                 'mascota', ma.nombre,
                 'notas', coalesce(tr.notas, ru.notas)
               ) order by t.fecha_limite nulls last, t.creado_en)
        from public.tareas t
        left join public.mascotas ma on ma.id = t.mascota_id
        left join public.tratamientos tr on tr.id = t.tratamiento_id
        left join public.rutinas ru on ru.id = t.rutina_id
        where not t.completada and public.encargo_vigente(a, t, public.hoy_en_espana())
      ), '[]'::jsonb),
      'mascotas', case when public.hoy_en_espana() between a.desde and a.hasta then coalesce((
        select jsonb_agg(jsonb_build_object(
                 'nombre', ma.nombre,
                 'especie', ma.especie,
                 'raza', ma.raza,
                 'fecha_nacimiento', ma.fecha_nacimiento,
                 'notas', ma.notas
               ) order by ma.nombre)
        from public.mascotas ma
        where ma.hogar_id = a.hogar_id
          and ('mascota' = any (a.categorias) or exists (
            select 1 from public.tareas t
            where t.mascota_id = ma.id and public.encargo_vigente(a, t, public.hoy_en_espana())
          ))
      ), '[]'::jsonb) else '[]'::jsonb end,
      'hechas', coalesce((
        select jsonb_agg(jsonb_build_object('titulo', t.titulo, 'completada_en', t.completada_en)
                         order by t.completada_en desc)
        from (
          select t.titulo, t.completada_en from public.tareas t
          where t.hogar_id = a.hogar_id and t.completada and t.completada_por = auth.uid()
            and t.completada_en >= a.desde
          order by t.completada_en desc
          limit 20
        ) t
      ), '[]'::jsonb)
    ) as datos
    from public.accesos a
    join public.hogares h on h.id = a.hogar_id
    where a.user_id = auth.uid() and a.hasta >= public.hoy_en_espana()
  ) e
$$;

-- Marcar como hecha una tarea encargada (y, si quieres, dejar una nota).
create function public.completar_encargo(tarea_id uuid, hecha_el date default null, nota text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hoy date := public.hoy_en_espana();
  tarea public.tareas%rowtype;
  acceso public.accesos%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Tienes que entrar con tu cuenta primero.';
  end if;
  select * into tarea from public.tareas t where t.id = tarea_id;
  if found then
    select * into acceso from public.accesos a
    where a.user_id = auth.uid() and public.encargo_vigente(a, tarea, hoy)
    limit 1;
  end if;
  if tarea.id is null or acceso.id is null then
    raise exception 'No encontramos esa tarea entre tus encargos.';
  end if;
  if char_length(trim(coalesce(nota, ''))) > 500 then
    raise exception 'La nota es demasiado larga (como mucho 500 letras).';
  end if;

  perform public.cerrar_tarea(tarea.id, coalesce(hecha_el, hoy), auth.uid());

  if nullif(trim(nota), '') is not null then
    insert into public.notas_encargo (hogar_id, acceso_id, autora, tarea_titulo, texto)
    values (acceso.hogar_id, acceso.id, acceso.nombre, tarea.titulo, trim(nota));
  end if;
end;
$$;

-- Una nota para el hogar sin marcar nada («Luna ha comido poco»).
create function public.nota_para_el_hogar(acceso_id uuid, texto text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  acceso public.accesos%rowtype;
begin
  select * into acceso from public.accesos a
  where a.id = acceso_id and a.user_id = auth.uid()
    and public.hoy_en_espana() between a.desde and a.hasta;
  if not found then
    raise exception 'No encontramos ese encargo, o ya ha terminado.';
  end if;
  if char_length(trim(coalesce(texto, ''))) not between 1 and 500 then
    raise exception 'Escribe una nota (como mucho 500 letras).';
  end if;
  insert into public.notas_encargo (hogar_id, acceso_id, autora, texto)
  values (acceso.hogar_id, acceso.id, acceso.nombre, trim(texto));
end;
$$;

revoke execute on function public.encargo_vigente(public.accesos, public.tareas, date) from public, anon, authenticated;
revoke execute on function public.hoy_en_espana() from public, anon;
revoke execute on function public.aceptar_acceso(text) from public, anon;
revoke execute on function public.mis_encargos() from public, anon;
revoke execute on function public.completar_encargo(uuid, date, text) from public, anon;
revoke execute on function public.nota_para_el_hogar(uuid, text) from public, anon;
grant execute on function public.hoy_en_espana() to authenticated;
grant execute on function public.aceptar_acceso(text) to authenticated;
grant execute on function public.mis_encargos() to authenticated;
grant execute on function public.completar_encargo(uuid, date, text) to authenticated;
grant execute on function public.nota_para_el_hogar(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Aviso de las 8:00: también para quien ayuda
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
  ),
  de_mi_hogar as (
    select a.id as aviso, t.id as tarea, t.titulo, t.fecha_limite, t.creado_en
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
  ),
  de_mis_encargos as (
    -- Quien ayuda con un acceso temporal: sus encargos de ese día.
    select a.id as aviso, t.id as tarea, t.titulo, t.fecha_limite, t.creado_en
    from public.avisos_push a
    join public.accesos x on x.user_id = a.user_id
    join public.tareas t on t.hogar_id = x.hogar_id
    where not t.completada
      and t.fecha_limite <= dia
      and a.ultimo_envio is distinct from dia
      and public.encargo_vigente(x, t, dia)
  ),
  todo as (
    select * from de_mi_hogar
    union
    select * from de_mis_encargos
  )
  select a.id, a.endpoint, a.p256dh, a.auth,
         (array_agg(todo.titulo order by todo.fecha_limite, todo.creado_en))[1:3],
         count(*)::integer
  from todo
  join public.avisos_push a on a.id = todo.aviso
  group by a.id, a.endpoint, a.p256dh, a.auth
$$;

revoke execute on function public.recordatorios_del_dia(date) from public, anon, authenticated;
grant execute on function public.recordatorios_del_dia(date) to service_role;

commit;
