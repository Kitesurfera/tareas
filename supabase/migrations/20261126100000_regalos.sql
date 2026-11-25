-- =====================================================================
-- Regalos: fechas especiales, listas de deseos e ideas de regalo
-- (en la pestaña Tareas)
--
-- Necesita que antes se hayan ejecutado todos los SQL anteriores.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
-- Se puede ejecutar varias veces: si ya estaba aplicado, no cambia nada.
--
-- Qué hace:
--   * personas_regalo: la gente a la que regaláis (mamá, amigos…), con
--     sus gustos (talla, colores…).
--   * fechas_especiales: cumpleaños, aniversarios y otras fechas, que se
--     repiten cada año. Salen en el calendario del inicio y en el aviso de
--     las 8:00 de ese día («🎂 Cumpleaños de mamá (cumple 60)»).
--   * deseos: la lista de deseos de cada persona del hogar. Solo la cambia
--     su dueña; las demás la ven.
--   * reservas_deseo: «🎁 Lo regalo yo» en la lista de otra persona. La
--     dueña de la lista NO lo ve (es sorpresa).
--   * ideas_regalo: ideas para regalar a alguien. Si son para alguien del
--     hogar, esa persona NO las ve (las demás sí).
--   * «En equipo»: apuntar una fecha especial cuenta como «pensar».
--
-- Seguridad:
--   * Cada hogar solo ve lo suyo (RLS). Quien ayuda con un acceso temporal
--     no ve nada.
--   * Las reglas de las sorpresas están en la base de datos: aunque alguien
--     pida los datos «a mano», no le llegan las ideas para ella ni quién le
--     regala qué de su lista.
--   * Nadie puede escribir en la lista de deseos de otra persona, ni
--     reservar en su nombre, ni falsear quién creó algo.
-- =====================================================================

begin;

do $$
begin
  if to_regclass('public.agenda_planes') is null then
    raise exception 'Falta un SQL anterior: ejecuta antes 20261123140000_planes.sql';
  end if;
  if to_regclass('public.documentos') is null then
    raise exception 'Falta un SQL anterior: ejecuta antes 20261123160000_documentos.sql';
  end if;
end;
$$;

-- Tu id en «miembros» (o vacío si no eres de ningún hogar).
create or replace function public.mi_miembro_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id from public.miembros m where m.user_id = auth.uid()
$$;

revoke execute on function public.mi_miembro_id() from public, anon;
grant execute on function public.mi_miembro_id() to authenticated;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------

create table if not exists public.personas_regalo (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  nombre text not null check (char_length(trim(nombre)) between 1 and 60),
  relacion text check (char_length(trim(relacion)) between 1 and 60),
  gustos text check (char_length(gustos) <= 1000),
  creada_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  constraint personas_regalo_id_hogar unique (id, hogar_id)
);

create table if not exists public.fechas_especiales (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  titulo text not null check (char_length(trim(titulo)) between 1 and 80),
  tipo text not null check (tipo in ('cumpleanos', 'aniversario', 'otra')),
  dia smallint not null check (dia between 1 and 31),
  mes smallint not null check (mes between 1 and 12),
  -- El año en que empezó (nacimiento, boda…): para decir «cumple 60». Opcional.
  anio integer check (anio between 1900 and 2100),
  -- De quién es (opcional): alguien de fuera o alguien del hogar.
  persona_id uuid,
  miembro_id uuid,
  notas text check (char_length(notas) <= 1000),
  creada_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  constraint fechas_especiales_id_hogar unique (id, hogar_id),
  -- El día existe en ese mes (el 29 de febrero sí; los años que no es
  -- bisiesto, se recuerda el 28).
  constraint dia_del_mes check (dia <= case when mes = 2 then 29 when mes in (4, 6, 9, 11) then 30 else 31 end),
  constraint de_una_sola_persona check (persona_id is null or miembro_id is null),
  constraint persona_del_hogar foreign key (persona_id, hogar_id)
    references public.personas_regalo (id, hogar_id) on delete set null (persona_id),
  constraint miembro_del_hogar foreign key (miembro_id, hogar_id)
    references public.miembros (id, hogar_id) on delete set null (miembro_id)
);

create index if not exists fechas_especiales_hogar_idx on public.fechas_especiales (hogar_id, mes, dia);

create table if not exists public.deseos (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  -- La dueña de la lista: la pone la base de datos (eres tú).
  miembro_id uuid not null default public.mi_miembro_id(),
  titulo text not null check (char_length(trim(titulo)) between 1 and 120),
  enlace text check (enlace ~ '^https?://' and char_length(enlace) <= 500),
  precio numeric(10, 2) check (precio >= 0 and precio < 1000000),
  notas text check (char_length(notas) <= 1000),
  -- 1 = me gustaría · 2 = me encantaría · 3 = ¡lo que más!
  prioridad smallint not null default 1 check (prioridad between 1 and 3),
  creado_en timestamptz not null default now(),
  constraint deseos_id_hogar unique (id, hogar_id),
  constraint deseo_de_alguien_del_hogar foreign key (miembro_id, hogar_id)
    references public.miembros (id, hogar_id) on delete cascade
);

create index if not exists deseos_hogar_idx on public.deseos (hogar_id, miembro_id);

create table if not exists public.reservas_deseo (
  -- Un deseo, como mucho una reserva.
  deseo_id uuid primary key,
  hogar_id uuid not null,
  -- Quién lo regala: la pone la base de datos (eres tú).
  miembro_id uuid not null default public.mi_miembro_id(),
  comprado boolean not null default false,
  creado_en timestamptz not null default now(),
  constraint reserva_de_un_deseo_del_hogar foreign key (deseo_id, hogar_id)
    references public.deseos (id, hogar_id) on delete cascade,
  constraint reserva_de_alguien_del_hogar foreign key (miembro_id, hogar_id)
    references public.miembros (id, hogar_id) on delete cascade
);

create index if not exists reservas_deseo_hogar_idx on public.reservas_deseo (hogar_id);

create table if not exists public.ideas_regalo (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  -- Para quién: alguien de fuera o alguien del hogar (una de las dos).
  persona_id uuid,
  miembro_id uuid,
  titulo text not null check (char_length(trim(titulo)) between 1 and 120),
  enlace text check (enlace ~ '^https?://' and char_length(enlace) <= 500),
  precio numeric(10, 2) check (precio >= 0 and precio < 1000000),
  notas text check (char_length(notas) <= 1000),
  comprado boolean not null default false,
  creada_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  constraint para_una_persona check (num_nonnulls(persona_id, miembro_id) = 1),
  constraint idea_para_alguien_de_fuera foreign key (persona_id, hogar_id)
    references public.personas_regalo (id, hogar_id) on delete cascade,
  constraint idea_para_alguien_del_hogar foreign key (miembro_id, hogar_id)
    references public.miembros (id, hogar_id) on delete cascade
);

create index if not exists ideas_regalo_hogar_idx on public.ideas_regalo (hogar_id);

-- ---------------------------------------------------------------------
-- Seguridad: RLS y permisos
-- ---------------------------------------------------------------------

alter table public.personas_regalo enable row level security;
alter table public.fechas_especiales enable row level security;
alter table public.deseos enable row level security;
alter table public.reservas_deseo enable row level security;
alter table public.ideas_regalo enable row level security;

revoke all on public.personas_regalo, public.fechas_especiales, public.deseos, public.reservas_deseo, public.ideas_regalo
  from anon, authenticated;

-- Solo estas columnas se pueden escribir desde la app (quién lo creó, la
-- dueña de un deseo y quién reserva los pone la base de datos).
grant select, delete on public.personas_regalo, public.fechas_especiales, public.deseos, public.reservas_deseo, public.ideas_regalo
  to authenticated;
grant insert (hogar_id, nombre, relacion, gustos) on public.personas_regalo to authenticated;
grant update (nombre, relacion, gustos) on public.personas_regalo to authenticated;
grant insert (hogar_id, titulo, tipo, dia, mes, anio, persona_id, miembro_id, notas) on public.fechas_especiales to authenticated;
grant update (titulo, tipo, dia, mes, anio, persona_id, miembro_id, notas) on public.fechas_especiales to authenticated;
grant insert (hogar_id, titulo, enlace, precio, notas, prioridad) on public.deseos to authenticated;
grant update (titulo, enlace, precio, notas, prioridad) on public.deseos to authenticated;
grant insert (hogar_id, deseo_id, comprado) on public.reservas_deseo to authenticated;
grant update (comprado) on public.reservas_deseo to authenticated;
grant insert (hogar_id, persona_id, miembro_id, titulo, enlace, precio, notas, comprado) on public.ideas_regalo to authenticated;
grant update (titulo, enlace, precio, notas, comprado) on public.ideas_regalo to authenticated;

-- Personas y fechas: lo de mi hogar (las cuatro reglas de siempre).
do $$
declare
  t text;
begin
  foreach t in array array['personas_regalo', 'fechas_especiales'] loop
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
         using (hogar_id = (select public.mi_hogar_id())) with check (hogar_id = (select public.mi_hogar_id()))', t);
    execute format(
      'create policy "Borro lo de mi hogar" on public.%I for delete to authenticated
         using (hogar_id = (select public.mi_hogar_id()))', t);
  end loop;
end;
$$;

-- Deseos: todo el hogar los ve; solo la dueña los crea, cambia y borra.
drop policy if exists "Veo los deseos de mi hogar" on public.deseos;
drop policy if exists "Apunto mis deseos" on public.deseos;
drop policy if exists "Cambio mis deseos" on public.deseos;
drop policy if exists "Borro mis deseos" on public.deseos;
create policy "Veo los deseos de mi hogar" on public.deseos for select to authenticated
  using (hogar_id = (select public.mi_hogar_id()));
create policy "Apunto mis deseos" on public.deseos for insert to authenticated
  with check (hogar_id = (select public.mi_hogar_id()) and miembro_id = (select public.mi_miembro_id()));
create policy "Cambio mis deseos" on public.deseos for update to authenticated
  using (miembro_id = (select public.mi_miembro_id()))
  with check (hogar_id = (select public.mi_hogar_id()) and miembro_id = (select public.mi_miembro_id()));
create policy "Borro mis deseos" on public.deseos for delete to authenticated
  using (miembro_id = (select public.mi_miembro_id()));

-- Reservas: las ve el hogar MENOS la dueña del deseo (es sorpresa). Solo
-- reservas en tu nombre, nunca en tu propia lista, y solo cambias o
-- quitas las tuyas.
drop policy if exists "Veo las reservas que no son de mi lista" on public.reservas_deseo;
drop policy if exists "Reservo deseos de las demás" on public.reservas_deseo;
drop policy if exists "Cambio mis reservas" on public.reservas_deseo;
drop policy if exists "Quito mis reservas" on public.reservas_deseo;
create policy "Veo las reservas que no son de mi lista" on public.reservas_deseo for select to authenticated
  using (
    hogar_id = (select public.mi_hogar_id())
    and not exists (
      select 1 from public.deseos d
      where d.id = reservas_deseo.deseo_id and d.miembro_id = (select public.mi_miembro_id())
    )
  );
create policy "Reservo deseos de las demás" on public.reservas_deseo for insert to authenticated
  with check (
    hogar_id = (select public.mi_hogar_id())
    and miembro_id = (select public.mi_miembro_id())
    and not exists (
      select 1 from public.deseos d
      where d.id = reservas_deseo.deseo_id and d.miembro_id = (select public.mi_miembro_id())
    )
  );
create policy "Cambio mis reservas" on public.reservas_deseo for update to authenticated
  using (miembro_id = (select public.mi_miembro_id()))
  with check (miembro_id = (select public.mi_miembro_id()));
create policy "Quito mis reservas" on public.reservas_deseo for delete to authenticated
  using (miembro_id = (select public.mi_miembro_id()));

-- Ideas: las ve, crea, cambia y borra el hogar, MENOS la persona a la que van.
drop policy if exists "Veo las ideas que no son para mí" on public.ideas_regalo;
drop policy if exists "Apunto ideas para las demás" on public.ideas_regalo;
drop policy if exists "Cambio ideas que no son para mí" on public.ideas_regalo;
drop policy if exists "Borro ideas que no son para mí" on public.ideas_regalo;
create policy "Veo las ideas que no son para mí" on public.ideas_regalo for select to authenticated
  using (hogar_id = (select public.mi_hogar_id()) and miembro_id is distinct from (select public.mi_miembro_id()));
create policy "Apunto ideas para las demás" on public.ideas_regalo for insert to authenticated
  with check (hogar_id = (select public.mi_hogar_id()) and miembro_id is distinct from (select public.mi_miembro_id()));
create policy "Cambio ideas que no son para mí" on public.ideas_regalo for update to authenticated
  using (hogar_id = (select public.mi_hogar_id()) and miembro_id is distinct from (select public.mi_miembro_id()))
  with check (hogar_id = (select public.mi_hogar_id()) and miembro_id is distinct from (select public.mi_miembro_id()));
create policy "Borro ideas que no son para mí" on public.ideas_regalo for delete to authenticated
  using (hogar_id = (select public.mi_hogar_id()) and miembro_id is distinct from (select public.mi_miembro_id()));

-- ---------------------------------------------------------------------
-- «En equipo»: apuntar una fecha especial es «pensar»
-- (las ideas y las reservas NO se apuntan: «Gracias por acordarte»
-- estropearía la sorpresa)
-- ---------------------------------------------------------------------

alter table public.actividad drop constraint if exists actividad_origen_check;
alter table public.actividad add constraint actividad_origen_check
  check (origen in ('tarea', 'tratamiento', 'rutina', 'vencimiento', 'compra', 'cuidado', 'plan', 'documento', 'fecha'));

create or replace function public.apuntar_actividad_fecha()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.creada_por is not null then
    insert into public.actividad (hogar_id, user_id, tipo, origen, origen_id, titulo)
    values (new.hogar_id, new.creada_por, 'pensar', 'fecha', new.id, new.titulo);
  end if;
  return null;
end;
$$;

drop trigger if exists apuntar_actividad_fecha on public.fechas_especiales;
create trigger apuntar_actividad_fecha
  after insert on public.fechas_especiales
  for each row execute function public.apuntar_actividad_fecha();

revoke execute on function public.apuntar_actividad_fecha() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- ¿Cae hoy una fecha especial? (el 29 de febrero, los años que no son
-- bisiestos, se recuerda el 28)
-- ---------------------------------------------------------------------

create or replace function public.es_el_dia(dia_fecha smallint, mes_fecha smallint, dia date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (mes_fecha = extract(month from dia) and dia_fecha = extract(day from dia))
      or (mes_fecha = 2 and dia_fecha = 29
          and extract(month from dia) = 2 and extract(day from dia) = 28
          and extract(day from (make_date(extract(year from dia)::int, 3, 1) - 1)) = 28)
$$;

-- ---------------------------------------------------------------------
-- Aviso de las 8:00: también las fechas especiales de ese día
-- (igual que antes, más «fechas_de_hoy», que salen las primeras y le
-- llegan a todo el hogar, también a quien está de viaje)
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
    select a.id as aviso, t.id as tarea, t.titulo, 1 as orden, t.fecha_limite, t.creado_en
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
    select a.id as aviso, t.id as tarea, t.titulo, 1 as orden, t.fecha_limite, t.creado_en
    from public.avisos_push a
    join public.accesos x on x.user_id = a.user_id
    join public.tareas t on t.hogar_id = x.hogar_id
    where not t.completada
      and t.fecha_limite <= dia
      and a.ultimo_envio is distinct from dia
      and public.encargo_vigente(x, t, dia)
  ),
  planes_de_hoy as (
    -- Los planes del calendario de ese día, para todo el hogar
    -- (menos quien está de viaje).
    select a.id as aviso, ap.id as tarea, '🎉 ' || p.nombre as titulo, 1 as orden, ap.fecha as fecha_limite, ap.creado_en
    from public.avisos_push a
    join public.miembros m on m.user_id = a.user_id
    join public.agenda_planes ap on ap.hogar_id = m.hogar_id
    join public.planes p on p.id = ap.plan_id
    where ap.fecha = dia
      and not ap.hecho
      and a.ultimo_envio is distinct from dia
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
      and a.ultimo_envio is distinct from recordatorios_del_dia.dia
  ),
  todo as (
    select * from de_mi_hogar
    union
    select * from de_mis_encargos
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
  group by a.id, a.endpoint, a.p256dh, a.auth
$$;

revoke execute on function public.recordatorios_del_dia(date) from public, anon, authenticated;
grant execute on function public.recordatorios_del_dia(date) to service_role;

commit;
