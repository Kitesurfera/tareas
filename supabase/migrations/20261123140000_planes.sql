-- =====================================================================
-- Planes: vuestra base de datos de planes (por categorías), el generador
-- al azar y el calendario de planes
--
-- Necesita que antes se hayan ejecutado todos los SQL anteriores.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
-- Se puede ejecutar varias veces: si ya estaba aplicado, no cambia nada.
--
-- Qué hace:
--   * categorias_plan: las categorías de planes del hogar (las sugeridas
--     que elijáis y las vuestras), con su dibujo y su color.
--   * planes: cada plan con su categoría, cuánta energía pide, precio,
--     duración, notas y si es favorito.
--   * agenda_planes: el calendario. Cada fila es un plan en un día, y si
--     ya lo hicisteis («lo hicimos»).
--   * «En equipo»: poner un plan en el calendario cuenta como «pensar»
--     (organizar planes también es carga mental).
--   * Aviso de las 8:00: también los planes de ese día.
--
-- Seguridad:
--   * Cada hogar solo ve, crea, cambia y borra SUS categorías, planes y
--     calendario (RLS). Quien ayuda con un acceso temporal no ve nada.
--   * La categoría de un plan y el plan del calendario tienen que ser del
--     mismo hogar (claves compuestas).
--   * Nadie puede falsear quién lo creó (lo pone la base de datos).
-- =====================================================================

begin;

-- Antes de nada: ¿están los SQL anteriores? Si falta alguno, se para aquí
-- con un mensaje claro (y no se aplica nada).
do $$
begin
  if to_regclass('public.plantas') is null then
    raise exception 'Falta un SQL anterior: ejecuta antes 20261122200000_plantas.sql';
  end if;
  if to_regclass('public.accesos') is null then
    raise exception 'Falta un SQL anterior: ejecuta antes 20261122180000_acceso_temporal.sql';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------

create table if not exists public.categorias_plan (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  nombre text not null check (char_length(trim(nombre)) between 1 and 40),
  -- Un emoji (algunos ocupan varios caracteres).
  dibujo text not null default '✨' check (char_length(dibujo) between 1 and 16),
  color text not null default 'menta'
    check (color in ('menta', 'lavanda', 'melocoton', 'cielo', 'hoja', 'coral', 'sol', 'rosa')),
  orden integer not null default 0 check (orden between 0 and 1000),
  creada_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  constraint categorias_plan_id_hogar unique (id, hogar_id)
);

-- Sin dos categorías con el mismo nombre en un hogar («Cine» y «cine»).
create unique index if not exists categorias_plan_nombre_unico
  on public.categorias_plan (hogar_id, lower(trim(nombre)));

create table if not exists public.planes (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  -- Si se borra la categoría, el plan se queda «sin categoría».
  categoria_id uuid,
  nombre text not null check (char_length(trim(nombre)) between 1 and 80),
  -- Cuánta energía pide (vacío = da igual).
  energia text check (energia in ('poca', 'normal', 'mucha')),
  -- Precio aproximado: gratis, €, €€, €€€ (vacío = no se sabe).
  precio text check (precio in ('gratis', 'barato', 'medio', 'caro')),
  duracion text check (duracion in ('rato', 'medio_dia', 'dia', 'varios_dias')),
  notas text check (char_length(notas) <= 1000),
  favorito boolean not null default false,
  creada_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  constraint planes_id_hogar unique (id, hogar_id),
  constraint categoria_del_hogar foreign key (categoria_id, hogar_id)
    references public.categorias_plan (id, hogar_id) on delete set null (categoria_id)
);

create index if not exists planes_hogar_id_idx on public.planes (hogar_id);

create table if not exists public.agenda_planes (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  plan_id uuid not null,
  fecha date not null check (fecha between date '2000-01-01' and date '2100-01-01'),
  hecho boolean not null default false,
  creada_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  -- El plan tiene que ser del MISMO hogar. Si se borra el plan, se borra del calendario.
  constraint plan_del_hogar foreign key (plan_id, hogar_id)
    references public.planes (id, hogar_id) on delete cascade,
  -- Un plan, como mucho una vez por día. (Con el hogar dentro: así alguien
  -- de otro hogar no puede saber, por el error, qué días tiene planes otro.)
  constraint un_plan_por_dia unique (hogar_id, plan_id, fecha)
);

create index if not exists agenda_planes_hogar_fecha_idx on public.agenda_planes (hogar_id, fecha);

-- ---------------------------------------------------------------------
-- Seguridad: RLS y permisos
-- ---------------------------------------------------------------------

alter table public.categorias_plan enable row level security;
alter table public.planes enable row level security;
alter table public.agenda_planes enable row level security;

revoke all on public.categorias_plan, public.planes, public.agenda_planes from anon, authenticated;

-- Solo estas columnas se pueden escribir desde la app (creada_por y
-- creado_en los pone la base de datos).
grant select, delete on public.categorias_plan, public.planes, public.agenda_planes to authenticated;
grant insert (hogar_id, nombre, dibujo, color, orden) on public.categorias_plan to authenticated;
grant update (nombre, dibujo, color, orden) on public.categorias_plan to authenticated;
grant insert (hogar_id, categoria_id, nombre, energia, precio, duracion, notas, favorito) on public.planes to authenticated;
grant update (categoria_id, nombre, energia, precio, duracion, notas, favorito) on public.planes to authenticated;
grant insert (hogar_id, plan_id, fecha, hecho) on public.agenda_planes to authenticated;
grant update (fecha, hecho) on public.agenda_planes to authenticated;

-- Las mismas cuatro reglas para las tres tablas: solo lo de mi hogar.
do $$
declare
  t text;
begin
  foreach t in array array['categorias_plan', 'planes', 'agenda_planes'] loop
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

-- ---------------------------------------------------------------------
-- «En equipo»: poner un plan en el calendario es «pensar»
-- ---------------------------------------------------------------------

alter table public.actividad drop constraint if exists actividad_origen_check;
alter table public.actividad add constraint actividad_origen_check
  check (origen in ('tarea', 'tratamiento', 'rutina', 'vencimiento', 'compra', 'cuidado', 'plan'));

create or replace function public.apuntar_actividad_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.creada_por is not null then
    insert into public.actividad (hogar_id, user_id, tipo, origen, origen_id, titulo)
    values (new.hogar_id, new.creada_por, 'pensar', 'plan', new.id,
            (select p.nombre from public.planes p where p.id = new.plan_id));
  end if;
  return null;
end;
$$;

drop trigger if exists apuntar_actividad_plan on public.agenda_planes;
create trigger apuntar_actividad_plan
  after insert on public.agenda_planes
  for each row execute function public.apuntar_actividad_plan();

revoke execute on function public.apuntar_actividad_plan() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Aviso de las 8:00: también los planes de ese día
-- (igual que antes, más «planes_de_hoy»)
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
  planes_de_hoy as (
    -- Los planes del calendario de ese día, para todo el hogar
    -- (menos quien está de viaje).
    select a.id as aviso, ap.id as tarea, '🎉 ' || p.nombre as titulo, ap.fecha as fecha_limite, ap.creado_en
    from public.avisos_push a
    join public.miembros m on m.user_id = a.user_id
    join public.agenda_planes ap on ap.hogar_id = m.hogar_id
    join public.planes p on p.id = ap.plan_id
    where ap.fecha = dia
      and not ap.hecho
      and a.ultimo_envio is distinct from dia
      and m.id not in (select miembro_id from fuera)
  ),
  todo as (
    select * from de_mi_hogar
    union
    select * from de_mis_encargos
    union
    select * from planes_de_hoy
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
