-- =====================================================================
-- Plantas: cada planta con su ficha y sus cuidados (riego, abono,
-- trasplante, poda…), que crean tareas solas como los tratamientos
--
-- Necesita que antes se hayan ejecutado todos los SQL anteriores.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
--
-- Qué hace:
--   * plantas: nombre, tipo («Ficus»), dónde está («Salón») y notas.
--   * cuidados: qué hay que hacerle a cada planta y cada cuánto. Cada
--     cuidado tiene siempre UNA tarea pendiente para la próxima vez
--     (fecha_ultima + frecuencia_dias). Al marcarla como hecha, se apunta
--     la fecha y se crea la siguiente.
--   * Un tipo de tarea nuevo: «plantas» (🪴). También se puede dar acceso
--     temporal a las plantas (por tipo o cuidado a cuidado).
--   * Crear un cuidado cuenta como «pensar» en «En equipo».
--
-- Seguridad:
--   * Cada hogar solo ve, crea, cambia y borra SUS plantas y cuidados (RLS).
--   * La planta y la responsable tienen que ser del mismo hogar (claves
--     compuestas), igual que con las mascotas.
--   * Las tareas de los cuidados son automáticas: no se pueden crear,
--     editar, borrar ni reabrir a mano.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Nuevo tipo de tarea: plantas
-- ---------------------------------------------------------------------

alter table public.tareas drop constraint tareas_categoria_check;
alter table public.tareas add constraint tareas_categoria_check
  check (categoria in ('mascota', 'casa', 'plantas', 'coche', 'papeleo', 'otros'));

-- ---------------------------------------------------------------------
-- Plantas y cuidados
-- ---------------------------------------------------------------------

create table public.plantas (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  nombre text not null check (char_length(trim(nombre)) between 1 and 40),
  tipo text check (tipo is null or char_length(trim(tipo)) between 1 and 60),
  ubicacion text check (ubicacion is null or char_length(trim(ubicacion)) between 1 and 40),
  notas text check (char_length(notas) <= 2000),
  creada_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  constraint plantas_id_hogar unique (id, hogar_id)
);

create index plantas_hogar_id_idx on public.plantas (hogar_id);

create table public.cuidados (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  planta_id uuid not null,
  tipo text not null check (tipo in ('riego', 'abono', 'trasplante', 'poda', 'otro')),
  -- Solo para «otro» («Limpiar las hojas»).
  nombre text check (nombre is null or char_length(trim(nombre)) between 1 and 60),
  fecha_ultima date not null check (fecha_ultima > date '1980-01-01'),
  frecuencia_dias integer not null check (frecuencia_dias between 1 and 3650),
  -- Quién se encarga normalmente (sus tareas heredan esta persona).
  responsable_id uuid,
  notas text check (char_length(notas) <= 2000),
  creada_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  constraint cuidados_id_hogar unique (id, hogar_id),
  constraint otro_con_nombre check (tipo <> 'otro' or nombre is not null),
  -- La planta y la responsable tienen que ser del MISMO hogar.
  constraint planta_del_hogar foreign key (planta_id, hogar_id)
    references public.plantas (id, hogar_id) on delete cascade,
  constraint responsable_del_hogar foreign key (responsable_id, hogar_id)
    references public.miembros (id, hogar_id) on delete set null (responsable_id)
);

create index cuidados_planta_id_idx on public.cuidados (planta_id);

-- Las tareas saben de qué planta y de qué cuidado vienen.
alter table public.tareas add column planta_id uuid;
alter table public.tareas add column cuidado_id uuid;
alter table public.tareas add constraint planta_del_hogar
  foreign key (planta_id, hogar_id) references public.plantas (id, hogar_id) on delete cascade;
alter table public.tareas add constraint cuidado_del_hogar
  foreign key (cuidado_id, hogar_id) references public.cuidados (id, hogar_id) on delete cascade;

create index tareas_planta_id_idx on public.tareas (planta_id);
-- Cada cuidado tiene como mucho UNA tarea pendiente.
create unique index una_pendiente_por_cuidado on public.tareas (cuidado_id) where not completada;

-- Las reglas de tareas «a mano» excluyen también las de los cuidados.
alter policy "Creo tareas en mi hogar" on public.tareas
  with check (
    hogar_id = (select public.mi_hogar_id())
    and tratamiento_id is null and vencimiento_id is null and rutina_id is null and cuidado_id is null
  );
alter policy "Edito las tareas a mano de mi hogar" on public.tareas
  using (
    hogar_id = (select public.mi_hogar_id())
    and tratamiento_id is null and vencimiento_id is null and rutina_id is null and cuidado_id is null
  )
  with check (
    hogar_id = (select public.mi_hogar_id())
    and tratamiento_id is null and vencimiento_id is null and rutina_id is null and cuidado_id is null
  );
alter policy "Borro las tareas a mano de mi hogar" on public.tareas
  using (
    hogar_id = (select public.mi_hogar_id())
    and tratamiento_id is null and vencimiento_id is null and rutina_id is null and cuidado_id is null
  );

-- ---------------------------------------------------------------------
-- Seguridad: RLS y permisos
-- ---------------------------------------------------------------------

alter table public.plantas enable row level security;
alter table public.cuidados enable row level security;

revoke all on public.plantas, public.cuidados from anon, authenticated;

grant select, delete on public.plantas, public.cuidados to authenticated;
grant insert (hogar_id, nombre, tipo, ubicacion, notas) on public.plantas to authenticated;
grant update (nombre, tipo, ubicacion, notas) on public.plantas to authenticated;
grant insert (hogar_id, planta_id, tipo, nombre, fecha_ultima, frecuencia_dias, responsable_id, notas)
  on public.cuidados to authenticated;
grant update (tipo, nombre, fecha_ultima, frecuencia_dias, responsable_id, notas)
  on public.cuidados to authenticated;

create policy "Veo las plantas de mi hogar" on public.plantas for select to authenticated
  using (hogar_id = (select public.mi_hogar_id()));
create policy "Añado plantas en mi hogar" on public.plantas for insert to authenticated
  with check (hogar_id = (select public.mi_hogar_id()));
create policy "Edito las plantas de mi hogar" on public.plantas for update to authenticated
  using (hogar_id = (select public.mi_hogar_id())) with check (hogar_id = (select public.mi_hogar_id()));
create policy "Borro las plantas de mi hogar" on public.plantas for delete to authenticated
  using (hogar_id = (select public.mi_hogar_id()));

create policy "Veo los cuidados de mi hogar" on public.cuidados for select to authenticated
  using (hogar_id = (select public.mi_hogar_id()));
create policy "Añado cuidados en mi hogar" on public.cuidados for insert to authenticated
  with check (hogar_id = (select public.mi_hogar_id()));
create policy "Edito los cuidados de mi hogar" on public.cuidados for update to authenticated
  using (hogar_id = (select public.mi_hogar_id())) with check (hogar_id = (select public.mi_hogar_id()));
create policy "Borro los cuidados de mi hogar" on public.cuidados for delete to authenticated
  using (hogar_id = (select public.mi_hogar_id()));

-- ---------------------------------------------------------------------
-- La regla automática (igual que con los tratamientos)
-- ---------------------------------------------------------------------

-- «Regar: Ficus», «Abonar: Potos», «Limpiar las hojas: Monstera»…
create function public.titulo_de_cuidado(tipo text, nombre text, planta text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case tipo
    when 'riego' then 'Regar'
    when 'abono' then 'Abonar'
    when 'trasplante' then 'Trasplantar'
    when 'poda' then 'Podar'
    else trim(nombre)
  end || ': ' || trim(planta)
$$;

-- Cada vez que se crea o cambia un cuidado: actualiza su tarea pendiente
-- o, si no tiene, crea la siguiente.
create function public.sincronizar_tarea_del_cuidado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  planta text;
begin
  select p.nombre into planta from public.plantas p where p.id = new.planta_id;

  update public.tareas
  set titulo = public.titulo_de_cuidado(new.tipo, new.nombre, planta),
      fecha_limite = new.fecha_ultima + new.frecuencia_dias,
      responsable_id = new.responsable_id
  where cuidado_id = new.id and not completada;

  if not found then
    insert into public.tareas
      (hogar_id, titulo, fecha_limite, responsable_id, categoria, planta_id, cuidado_id, creada_por)
    values
      (new.hogar_id, public.titulo_de_cuidado(new.tipo, new.nombre, planta),
       new.fecha_ultima + new.frecuencia_dias, new.responsable_id, 'plantas',
       new.planta_id, new.id, new.creada_por);
  end if;

  return null;
end;
$$;

create trigger tarea_al_crear_o_cambiar_cuidado
  after insert or update on public.cuidados
  for each row execute function public.sincronizar_tarea_del_cuidado();

-- Si cambia el nombre de la planta, también el de sus tareas pendientes.
create function public.renombrar_tareas_de_la_planta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tareas t
  set titulo = public.titulo_de_cuidado(c.tipo, c.nombre, new.nombre)
  from public.cuidados c
  where t.cuidado_id = c.id and c.planta_id = new.id and not t.completada;
  return null;
end;
$$;

create trigger renombrar_tareas_al_cambiar_planta
  after update of nombre on public.plantas
  for each row execute function public.renombrar_tareas_de_la_planta();

revoke execute on function public.sincronizar_tarea_del_cuidado() from public, anon, authenticated;
revoke execute on function public.renombrar_tareas_de_la_planta() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Completar y reabrir: ahora también con cuidados
-- ---------------------------------------------------------------------

-- Igual que antes, más: si la tarea es de un cuidado, apunta la fecha en
-- el cuidado (y la regla de arriba crea la siguiente).
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
end;
$$;

revoke execute on function public.cerrar_tarea(uuid, date, uuid) from public, anon, authenticated;

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
     or tarea.rutina_id is not null or tarea.cuidado_id is not null then
    raise exception 'Las tareas automáticas no se pueden reabrir: cambia la fecha en su tratamiento, rutina, cuidado o vencimiento.';
  end if;
  if not tarea.completada then
    return;
  end if;

  update public.tareas
  set completada = false, completada_por = null, completada_en = null
  where id = tarea.id;
end;
$$;

-- ---------------------------------------------------------------------
-- «En equipo»: crear un cuidado es «pensar»
-- ---------------------------------------------------------------------

alter table public.actividad drop constraint actividad_origen_check;
alter table public.actividad add constraint actividad_origen_check
  check (origen in ('tarea', 'tratamiento', 'rutina', 'vencimiento', 'compra', 'cuidado'));

-- Las tareas automáticas de los cuidados no cuentan como «pensar» (ya
-- contó crear el cuidado), igual que las de tratamientos y rutinas.
create or replace function public.apuntar_actividad_tarea()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.tratamiento_id is null and new.vencimiento_id is null and new.rutina_id is null
       and new.cuidado_id is null and new.creada_por is not null then
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

create function public.apuntar_actividad_cuidado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.creada_por is not null then
    insert into public.actividad (hogar_id, user_id, tipo, origen, origen_id, titulo)
    values (new.hogar_id, new.creada_por, 'pensar', 'cuidado', new.id,
            public.titulo_de_cuidado(new.tipo, new.nombre,
              (select p.nombre from public.plantas p where p.id = new.planta_id)));
  end if;
  return null;
end;
$$;

create trigger apuntar_actividad_cuidado
  after insert on public.cuidados
  for each row execute function public.apuntar_actividad_cuidado();

revoke execute on function public.apuntar_actividad_cuidado() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Acceso temporal: también para las plantas
-- ---------------------------------------------------------------------

alter table public.accesos add column cuidados uuid[] not null default '{}';
grant insert (cuidados), update (cuidados) on public.accesos to authenticated;

alter table public.accesos drop constraint accesos_categorias_check;
alter table public.accesos add constraint accesos_categorias_check
  check (categorias <@ array['mascota', 'casa', 'plantas', 'coche', 'papeleo', 'otros']::text[]);
alter table public.accesos drop constraint algo_encargado;
alter table public.accesos add constraint algo_encargado check (
  cardinality(categorias) + cardinality(tareas) + cardinality(rutinas)
  + cardinality(tratamientos) + cardinality(cuidados) > 0
);
alter table public.accesos drop constraint listas_razonables;
alter table public.accesos add constraint listas_razonables check (
  cardinality(tareas) <= 200 and cardinality(rutinas) <= 200
  and cardinality(tratamientos) <= 200 and cardinality(cuidados) <= 200
);

create or replace function public.encargo_vigente(acceso public.accesos, tarea public.tareas, dia date)
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
      or coalesce(tarea.cuidado_id = any (acceso.cuidados), false)
    ),
    false
  )
$$;

revoke execute on function public.encargo_vigente(public.accesos, public.tareas, date) from public, anon, authenticated;

-- Igual que antes, más: de cada tarea, su planta y las notas del cuidado;
-- y la ficha de las plantas de sus encargos.
create or replace function public.mis_encargos()
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
                 'planta', pl.nombre,
                 'notas', coalesce(tr.notas, ru.notas, cu.notas)
               ) order by t.fecha_limite nulls last, t.creado_en)
        from public.tareas t
        left join public.mascotas ma on ma.id = t.mascota_id
        left join public.plantas pl on pl.id = t.planta_id
        left join public.tratamientos tr on tr.id = t.tratamiento_id
        left join public.rutinas ru on ru.id = t.rutina_id
        left join public.cuidados cu on cu.id = t.cuidado_id
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
      'plantas', case when public.hoy_en_espana() between a.desde and a.hasta then coalesce((
        select jsonb_agg(jsonb_build_object(
                 'nombre', pl.nombre,
                 'tipo', pl.tipo,
                 'ubicacion', pl.ubicacion,
                 'notas', pl.notas
               ) order by pl.nombre)
        from public.plantas pl
        where pl.hogar_id = a.hogar_id
          and ('plantas' = any (a.categorias) or exists (
            select 1 from public.tareas t
            where t.planta_id = pl.id and public.encargo_vigente(a, t, public.hoy_en_espana())
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

commit;
