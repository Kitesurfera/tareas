-- =====================================================================
-- Documentos del hogar: pólizas, ITV, DNI, garantías… con sus fotos o
-- PDF, de quién son, el seguro con el que van y un aviso antes de que
-- caduquen
--
-- Necesita que antes se hayan ejecutado todos los SQL anteriores.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
-- Se puede ejecutar varias veces: si ya estaba aplicado, no cambia nada.
--
-- Qué hace:
--   * documentos: título, tipo (identidad, seguro, coche…), de quién es,
--     con qué seguro o suscripción va, cuándo caduca y notas.
--   * documento_archivos: sus fotos o PDF (como mucho 5 por documento),
--     guardados en el almacén PRIVADO «documentos» (carpeta = id del hogar).
--   * Si tiene fecha de caducidad y aviso, se crea sola la tarea «Renovar:
--     …» unos días antes, con su responsable (como los seguros). Si cambiáis
--     la fecha (lo habéis renovado), se crea la siguiente.
--   * Guardar un documento cuenta como «pensar» en «En equipo».
--
-- Seguridad:
--   * Cada hogar solo ve, sube, cambia y borra SUS documentos y archivos
--     (RLS en las tablas y en el almacén). Los archivos no tienen enlace
--     público: la app pide enlaces que caducan en pocos minutos.
--   * La persona, el seguro y quien se encarga tienen que ser del mismo
--     hogar (claves compuestas). Un archivo solo puede estar en la carpeta
--     de su hogar.
--   * Las tareas de los documentos son automáticas: no se crean, editan,
--     borran ni reabren a mano.
-- =====================================================================

begin;

-- Antes de nada: ¿están los SQL anteriores? Si falta alguno, se para aquí
-- con un mensaje claro (y no se aplica nada).
do $$
begin
  if to_regclass('public.agenda_planes') is null then
    raise exception 'Falta un SQL anterior: ejecuta antes 20261123140000_planes.sql';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------

create table if not exists public.documentos (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  titulo text not null check (char_length(trim(titulo)) between 1 and 80),
  tipo text not null default 'otros'
    check (tipo in ('identidad', 'seguro', 'coche', 'casa', 'salud', 'mascota', 'garantia', 'otros')),
  -- De quién es (vacío = de todo el hogar).
  persona_id uuid,
  -- El seguro o la suscripción con la que va (por ejemplo, su póliza).
  vencimiento_id uuid,
  caduca_el date check (caduca_el is null or caduca_el between date '1980-01-01' and date '2200-01-01'),
  -- Cuántos días antes de caducar se crea la tarea «Renovar: …».
  aviso_dias integer check (aviso_dias is null or aviso_dias between 0 and 365),
  -- Quién se encarga de renovarlo (la tarea lo hereda).
  responsable_id uuid,
  notas text check (char_length(notas) <= 2000),
  creada_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  constraint documentos_id_hogar unique (id, hogar_id),
  constraint aviso_con_fecha check (aviso_dias is null or caduca_el is not null),
  constraint persona_del_hogar foreign key (persona_id, hogar_id)
    references public.miembros (id, hogar_id) on delete set null (persona_id),
  constraint vencimiento_del_hogar foreign key (vencimiento_id, hogar_id)
    references public.vencimientos (id, hogar_id) on delete set null (vencimiento_id),
  constraint responsable_del_hogar foreign key (responsable_id, hogar_id)
    references public.miembros (id, hogar_id) on delete set null (responsable_id)
);

create index if not exists documentos_hogar_id_idx on public.documentos (hogar_id);
create index if not exists documentos_vencimiento_id_idx on public.documentos (vencimiento_id);

create table if not exists public.documento_archivos (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  documento_id uuid not null,
  -- «<id-del-hogar>/<id-al-azar>.jpg» o «.pdf»: siempre en la carpeta de SU hogar.
  ruta text not null unique
    check (ruta ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|pdf)$' and split_part(ruta, '/', 1) = hogar_id::text),
  -- El nombre del archivo original (para enseñarlo).
  nombre text check (char_length(nombre) <= 120),
  tipo_mime text not null check (tipo_mime in ('image/jpeg', 'application/pdf')),
  tamano integer not null check (tamano between 1 and 10485760),
  orden integer not null default 0 check (orden between 0 and 10),
  creado_en timestamptz not null default now(),
  constraint documento_del_hogar foreign key (documento_id, hogar_id)
    references public.documentos (id, hogar_id) on delete cascade
);

create index if not exists documento_archivos_documento_idx on public.documento_archivos (documento_id);

-- Como mucho 5 archivos por documento.
create or replace function public.como_mucho_5_archivos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.documento_archivos a where a.documento_id = new.documento_id) >= 5 then
    raise exception 'Como mucho 5 archivos por documento.';
  end if;
  return new;
end;
$$;

drop trigger if exists como_mucho_5_archivos on public.documento_archivos;
create trigger como_mucho_5_archivos
  before insert on public.documento_archivos
  for each row execute function public.como_mucho_5_archivos();

-- ---------------------------------------------------------------------
-- Seguridad: RLS y permisos
-- ---------------------------------------------------------------------

alter table public.documentos enable row level security;
alter table public.documento_archivos enable row level security;

revoke all on public.documentos, public.documento_archivos from anon, authenticated;

grant select, delete on public.documentos, public.documento_archivos to authenticated;
grant insert (hogar_id, titulo, tipo, persona_id, vencimiento_id, caduca_el, aviso_dias, responsable_id, notas)
  on public.documentos to authenticated;
grant update (titulo, tipo, persona_id, vencimiento_id, caduca_el, aviso_dias, responsable_id, notas)
  on public.documentos to authenticated;
-- Los archivos no se cambian: se suben o se borran.
grant insert (hogar_id, documento_id, ruta, nombre, tipo_mime, tamano, orden)
  on public.documento_archivos to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['documentos', 'documento_archivos'] loop
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
-- El almacén privado de los archivos
-- ---------------------------------------------------------------------

-- public = false: los archivos NO tienen enlace público. Máximo 10 MB por
-- archivo; solo fotos (JPG, la app las reduce antes de subirlas) y PDF.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 10485760, array['image/jpeg', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- La primera carpeta de la ruta tiene que ser el id de MI hogar.
drop policy if exists "Veo los documentos de mi hogar" on storage.objects;
drop policy if exists "Subo documentos a mi hogar" on storage.objects;
drop policy if exists "Borro documentos de mi hogar" on storage.objects;

create policy "Veo los documentos de mi hogar"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] = (select public.mi_hogar_id())::text
  );

create policy "Subo documentos a mi hogar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] = (select public.mi_hogar_id())::text
  );

create policy "Borro documentos de mi hogar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] = (select public.mi_hogar_id())::text
  );

-- ---------------------------------------------------------------------
-- La tarea automática «Renovar: …»
-- ---------------------------------------------------------------------

alter table public.tareas add column if not exists documento_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tarea_documento_del_hogar' and conrelid = 'public.tareas'::regclass
  ) then
    alter table public.tareas add constraint tarea_documento_del_hogar
      foreign key (documento_id, hogar_id) references public.documentos (id, hogar_id) on delete cascade;
  end if;
end;
$$;

create index if not exists tareas_documento_id_idx on public.tareas (documento_id);
-- Cada documento tiene como mucho UNA tarea pendiente.
create unique index if not exists una_pendiente_por_documento on public.tareas (documento_id) where not completada;

-- Las reglas de tareas «a mano» excluyen también las de los documentos.
alter policy "Creo tareas en mi hogar" on public.tareas
  with check (
    hogar_id = (select public.mi_hogar_id())
    and tratamiento_id is null and vencimiento_id is null and rutina_id is null and cuidado_id is null
    and documento_id is null
  );
alter policy "Edito las tareas a mano de mi hogar" on public.tareas
  using (
    hogar_id = (select public.mi_hogar_id())
    and tratamiento_id is null and vencimiento_id is null and rutina_id is null and cuidado_id is null
    and documento_id is null
  )
  with check (
    hogar_id = (select public.mi_hogar_id())
    and tratamiento_id is null and vencimiento_id is null and rutina_id is null and cuidado_id is null
    and documento_id is null
  );
alter policy "Borro las tareas a mano de mi hogar" on public.tareas
  using (
    hogar_id = (select public.mi_hogar_id())
    and tratamiento_id is null and vencimiento_id is null and rutina_id is null and cuidado_id is null
    and documento_id is null
  );

-- Documento creado o cambiado → su tarea pendiente se crea, se ajusta o se quita.
create or replace function public.sincronizar_tarea_del_documento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  la_fecha date;
  el_titulo text;
begin
  -- Sin fecha de caducidad o sin aviso: sin tarea.
  if new.caduca_el is null or new.aviso_dias is null then
    delete from public.tareas where documento_id = new.id and not completada;
    return null;
  end if;

  la_fecha := new.caduca_el - new.aviso_dias;
  el_titulo := 'Renovar: ' || trim(new.titulo);

  update public.tareas
  set titulo = el_titulo, fecha_limite = la_fecha, responsable_id = new.responsable_id
  where documento_id = new.id and not completada;

  if not found then
    -- Si ya hicisteis el aviso de esta misma fecha, no se vuelve a crear
    -- (por ejemplo, al cambiar solo las notas).
    if not exists (
      select 1 from public.tareas
      where documento_id = new.id and completada and fecha_limite = la_fecha
    ) then
      insert into public.tareas
        (hogar_id, titulo, fecha_limite, responsable_id, categoria, documento_id, creada_por)
      values
        (new.hogar_id, el_titulo, la_fecha, new.responsable_id, 'papeleo', new.id, new.creada_por);
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists tarea_al_crear_o_cambiar_documento on public.documentos;
create trigger tarea_al_crear_o_cambiar_documento
  after insert or update on public.documentos
  for each row execute function public.sincronizar_tarea_del_documento();

revoke execute on function public.sincronizar_tarea_del_documento() from public, anon, authenticated;

-- Las tareas automáticas (también las de documentos) no se pueden reabrir.
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
end;
$$;

revoke execute on function public.reabrir_tarea(uuid) from public, anon;
grant execute on function public.reabrir_tarea(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- «En equipo»: guardar un documento es «pensar»
-- ---------------------------------------------------------------------

alter table public.actividad drop constraint if exists actividad_origen_check;
alter table public.actividad add constraint actividad_origen_check
  check (origen in ('tarea', 'tratamiento', 'rutina', 'vencimiento', 'compra', 'cuidado', 'plan', 'documento'));

-- Las tareas automáticas de los documentos no cuentan como «pensar» (ya
-- contó guardar el documento), igual que las de tratamientos y rutinas.
create or replace function public.apuntar_actividad_tarea()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.tratamiento_id is null and new.vencimiento_id is null and new.rutina_id is null
       and new.cuidado_id is null and new.documento_id is null and new.creada_por is not null then
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

create or replace function public.apuntar_actividad_documento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.creada_por is not null then
    insert into public.actividad (hogar_id, user_id, tipo, origen, origen_id, titulo)
    values (new.hogar_id, new.creada_por, 'pensar', 'documento', new.id, new.titulo);
  end if;
  return null;
end;
$$;

drop trigger if exists apuntar_actividad_documento on public.documentos;
create trigger apuntar_actividad_documento
  after insert on public.documentos
  for each row execute function public.apuntar_actividad_documento();

revoke execute on function public.apuntar_actividad_documento() from public, anon, authenticated;

commit;
