-- =====================================================================
-- Fase 1, paso 3: ficha de la mascota (datos y foto)
--
-- Necesita que antes se haya ejecutado 20261121100000_hogares_e_invitaciones.sql
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
--
-- Idea de seguridad:
--   * Cada hogar solo ve, crea, edita y borra SUS mascotas (RLS).
--   * Las fotos van a un almacén PRIVADO. Cada hogar tiene su carpeta
--     (con el id del hogar) y solo puede entrar en la suya.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Tabla
-- ---------------------------------------------------------------------

create table public.mascotas (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  nombre text not null check (char_length(trim(nombre)) between 1 and 40),
  especie text not null check (char_length(trim(especie)) between 1 and 30),
  raza text check (char_length(raza) <= 60),
  fecha_nacimiento date check (fecha_nacimiento > date '1980-01-01'),
  -- Dónde está la foto dentro del almacén privado (no es un enlace público).
  foto_ruta text,
  notas text check (char_length(notas) <= 2000),
  -- Quién la añadió: lo pone la base de datos, no se puede falsear.
  creada_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  -- La foto tiene que estar en la carpeta de SU hogar.
  constraint foto_en_su_hogar check (foto_ruta is null or foto_ruta like hogar_id::text || '/%')
);

create index mascotas_hogar_id_idx on public.mascotas (hogar_id);

-- ---------------------------------------------------------------------
-- Seguridad: RLS y permisos
-- ---------------------------------------------------------------------

alter table public.mascotas enable row level security;

revoke all on public.mascotas from anon, authenticated;
grant select, delete on public.mascotas to authenticated;
-- Solo estas columnas se pueden rellenar o cambiar desde la app.
-- (id, creada_por y creado_en los pone siempre la base de datos.)
grant insert (hogar_id, nombre, especie, raza, fecha_nacimiento, foto_ruta, notas)
  on public.mascotas to authenticated;
grant update (nombre, especie, raza, fecha_nacimiento, foto_ruta, notas)
  on public.mascotas to authenticated;

create policy "Veo las mascotas de mi hogar"
  on public.mascotas for select to authenticated
  using (hogar_id = (select public.mi_hogar_id()));

create policy "Añado mascotas a mi hogar"
  on public.mascotas for insert to authenticated
  with check (hogar_id = (select public.mi_hogar_id()));

create policy "Edito las mascotas de mi hogar"
  on public.mascotas for update to authenticated
  using (hogar_id = (select public.mi_hogar_id()))
  with check (hogar_id = (select public.mi_hogar_id()));

create policy "Borro las mascotas de mi hogar"
  on public.mascotas for delete to authenticated
  using (hogar_id = (select public.mi_hogar_id()));

-- ---------------------------------------------------------------------
-- Almacén privado de fotos
-- ---------------------------------------------------------------------

-- public = false: las fotos NO tienen enlace público. La app pide un
-- enlace temporal (1 hora) y Supabase solo lo da a gente del hogar.
-- Máximo 3 MB por foto (la app las reduce antes de subirlas).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mascotas', 'mascotas', false, 3145728, array['image/jpeg']);

-- La primera carpeta de la ruta tiene que ser el id de MI hogar:
-- «<id-del-hogar>/<foto>.jpg»
create policy "Veo las fotos de mi hogar"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'mascotas'
    and (storage.foldername(name))[1] = (select public.mi_hogar_id())::text
  );

create policy "Subo fotos a mi hogar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'mascotas'
    and (storage.foldername(name))[1] = (select public.mi_hogar_id())::text
  );

create policy "Cambio fotos de mi hogar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'mascotas'
    and (storage.foldername(name))[1] = (select public.mi_hogar_id())::text
  )
  with check (
    bucket_id = 'mascotas'
    and (storage.foldername(name))[1] = (select public.mi_hogar_id())::text
  );

create policy "Borro fotos de mi hogar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'mascotas'
    and (storage.foldername(name))[1] = (select public.mi_hogar_id())::text
  );

commit;
