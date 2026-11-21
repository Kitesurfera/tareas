-- =====================================================================
-- Fase 1, paso 4: tratamientos de la mascota que crean tareas solas
--
-- Necesita que antes se hayan ejecutado los SQL de los pasos 2 y 3.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
--
-- La regla clave:
--   * Al crear un tratamiento, la base de datos crea su tarea para la
--     próxima fecha (fecha_ultima + frecuencia_dias).
--   * Al marcar esa tarea como hecha, se apunta la fecha en el
--     tratamiento y se crea la tarea siguiente.
--   * Si cambias el tratamiento (fecha, frecuencia, nombre…), su tarea
--     pendiente se actualiza sola.
--
-- Idea de seguridad:
--   * RLS en las dos tablas: cada hogar solo ve y toca lo suyo.
--   * Claves compuestas (id + hogar_id): la base de datos impide que una
--     tarea o un tratamiento apunte a una mascota o a una persona de
--     OTRO hogar, aunque alguien manipule la petición.
-- =====================================================================

begin;

-- Necesario para las claves compuestas de abajo.
alter table public.miembros add constraint miembros_id_hogar unique (id, hogar_id);
alter table public.mascotas add constraint mascotas_id_hogar unique (id, hogar_id);

-- ---------------------------------------------------------------------
-- Tratamientos
-- ---------------------------------------------------------------------

create table public.tratamientos (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  mascota_id uuid not null,
  tipo text not null check (tipo in (
    'vacuna', 'desparasitacion_interna', 'desparasitacion_externa', 'medicacion', 'revision'
  )),
  nombre text not null check (char_length(trim(nombre)) between 1 and 60),
  fecha_ultima date not null check (fecha_ultima > date '1980-01-01'),
  frecuencia_dias integer not null check (frecuencia_dias between 1 and 3650),
  -- Quién se encarga normalmente (sus tareas heredan esta persona).
  responsable_id uuid,
  notas text check (char_length(notas) <= 2000),
  creada_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  constraint tratamientos_id_hogar unique (id, hogar_id),
  -- La mascota y la responsable tienen que ser del MISMO hogar.
  constraint mascota_del_hogar foreign key (mascota_id, hogar_id)
    references public.mascotas (id, hogar_id) on delete cascade,
  constraint responsable_del_hogar foreign key (responsable_id, hogar_id)
    references public.miembros (id, hogar_id) on delete set null (responsable_id)
);

create index tratamientos_mascota_id_idx on public.tratamientos (mascota_id);

-- ---------------------------------------------------------------------
-- Tareas
-- ---------------------------------------------------------------------

create table public.tareas (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  titulo text not null check (char_length(trim(titulo)) between 1 and 120),
  descripcion text check (char_length(descripcion) <= 2000),
  fecha_limite date,
  responsable_id uuid,
  categoria text not null default 'otros'
    check (categoria in ('mascota', 'casa', 'coche', 'papeleo', 'otros')),
  mascota_id uuid,
  tratamiento_id uuid,
  creada_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  completada boolean not null default false,
  completada_por uuid references auth.users (id) on delete set null,
  completada_en timestamptz,
  -- Todo lo que se enlaza tiene que ser del MISMO hogar.
  constraint responsable_del_hogar foreign key (responsable_id, hogar_id)
    references public.miembros (id, hogar_id) on delete set null (responsable_id),
  constraint mascota_del_hogar foreign key (mascota_id, hogar_id)
    references public.mascotas (id, hogar_id) on delete cascade,
  constraint tratamiento_del_hogar foreign key (tratamiento_id, hogar_id)
    references public.tratamientos (id, hogar_id) on delete cascade,
  -- Una tarea hecha siempre sabe cuándo; una pendiente, no.
  constraint completada_coherente check (
    (completada and completada_en is not null)
    or (not completada and completada_en is null and completada_por is null)
  )
);

create index tareas_pendientes_idx on public.tareas (hogar_id, completada, fecha_limite);
create index tareas_mascota_id_idx on public.tareas (mascota_id);

-- Cada tratamiento tiene como mucho UNA tarea pendiente.
create unique index una_pendiente_por_tratamiento
  on public.tareas (tratamiento_id) where not completada;

-- ---------------------------------------------------------------------
-- Seguridad: RLS y permisos
-- ---------------------------------------------------------------------

alter table public.tratamientos enable row level security;
alter table public.tareas enable row level security;

revoke all on public.tratamientos, public.tareas from anon, authenticated;

grant select, delete on public.tratamientos to authenticated;
grant insert (hogar_id, mascota_id, tipo, nombre, fecha_ultima, frecuencia_dias, responsable_id, notas)
  on public.tratamientos to authenticated;
grant update (tipo, nombre, fecha_ultima, frecuencia_dias, responsable_id, notas)
  on public.tratamientos to authenticated;

-- De momento las tareas solo se leen desde la app; las crea la base de
-- datos y se marcan como hechas con la función completar_tarea.
-- (En el paso 5 se podrán crear y editar a mano.)
grant select on public.tareas to authenticated;

create policy "Veo los tratamientos de mi hogar"
  on public.tratamientos for select to authenticated
  using (hogar_id = (select public.mi_hogar_id()));

create policy "Añado tratamientos en mi hogar"
  on public.tratamientos for insert to authenticated
  with check (hogar_id = (select public.mi_hogar_id()));

create policy "Edito los tratamientos de mi hogar"
  on public.tratamientos for update to authenticated
  using (hogar_id = (select public.mi_hogar_id()))
  with check (hogar_id = (select public.mi_hogar_id()));

create policy "Borro los tratamientos de mi hogar"
  on public.tratamientos for delete to authenticated
  using (hogar_id = (select public.mi_hogar_id()));

create policy "Veo las tareas de mi hogar"
  on public.tareas for select to authenticated
  using (hogar_id = (select public.mi_hogar_id()));

-- ---------------------------------------------------------------------
-- La regla automática
-- ---------------------------------------------------------------------

-- «Vacuna: Rabia», «Desparasitación interna: Milbemax»…
create function public.titulo_de_tratamiento(tipo text, nombre text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case tipo
    when 'vacuna' then 'Vacuna'
    when 'desparasitacion_interna' then 'Desparasitación interna'
    when 'desparasitacion_externa' then 'Desparasitación externa'
    when 'medicacion' then 'Medicación'
    when 'revision' then 'Revisión'
  end || ': ' || trim(nombre)
$$;

-- Se ejecuta sola cada vez que se crea o cambia un tratamiento:
-- actualiza su tarea pendiente o, si no tiene, crea la siguiente.
create function public.sincronizar_tarea_del_tratamiento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tareas
  set titulo = public.titulo_de_tratamiento(new.tipo, new.nombre),
      fecha_limite = new.fecha_ultima + new.frecuencia_dias,
      responsable_id = new.responsable_id
  where tratamiento_id = new.id and not completada;

  if not found then
    insert into public.tareas
      (hogar_id, titulo, fecha_limite, responsable_id, categoria, mascota_id, tratamiento_id, creada_por)
    values
      (new.hogar_id, public.titulo_de_tratamiento(new.tipo, new.nombre),
       new.fecha_ultima + new.frecuencia_dias, new.responsable_id, 'mascota',
       new.mascota_id, new.id, new.creada_por);
  end if;

  return null;
end;
$$;

create trigger tarea_al_crear_o_cambiar_tratamiento
  after insert or update on public.tratamientos
  for each row execute function public.sincronizar_tarea_del_tratamiento();

-- Marca una tarea como hecha. Si viene de un tratamiento, apunta la
-- fecha en el tratamiento y (gracias a la regla de arriba) se crea la
-- tarea siguiente.
create function public.completar_tarea(tarea_id uuid, hecha_el date default current_date)
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
    update public.tratamientos
    set fecha_ultima = hecha_el
    where id = tarea.tratamiento_id;
  end if;
end;
$$;

revoke execute on function public.titulo_de_tratamiento(text, text) from public, anon;
revoke execute on function public.sincronizar_tarea_del_tratamiento() from public, anon, authenticated;
revoke execute on function public.completar_tarea(uuid, date) from public, anon;
grant execute on function public.titulo_de_tratamiento(text, text) to authenticated;
grant execute on function public.completar_tarea(uuid, date) to authenticated;

commit;
