-- =====================================================================
-- Fase 2: registro de peso de la mascota
--
-- Necesita que antes se hayan ejecutado todos los SQL anteriores.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
--
-- Qué hace:
--   * pesos: cada vez que alguien pesa a la mascota, una fila con la fecha
--     y los kilos. Como mucho un peso por mascota y día (si se vuelve a
--     pesar ese día, la app cambia el que había).
--
-- Seguridad:
--   * Cada hogar solo ve, apunta, cambia y borra los pesos de SUS
--     mascotas (RLS).
--   * La mascota tiene que ser del mismo hogar: la base de datos no deja
--     apuntar un peso a una mascota de otro hogar.
--   * Quién lo apuntó lo pone la base de datos, no se puede falsear.
--   * Si se borra la mascota (o el hogar), se borran sus pesos.
-- =====================================================================

begin;

create table public.pesos (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  mascota_id uuid not null,
  fecha date not null check (fecha > date '1980-01-01'),
  -- Hasta 3 decimales, para los animales pequeños (un periquito pesa 0,035 kg).
  kg numeric(6, 3) not null check (kg > 0 and kg < 500),
  creada_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  constraint mascota_del_hogar foreign key (mascota_id, hogar_id)
    references public.mascotas (id, hogar_id) on delete cascade,
  constraint un_peso_por_dia unique (mascota_id, fecha)
);

create index pesos_hogar_id_idx on public.pesos (hogar_id);

alter table public.pesos enable row level security;

revoke all on public.pesos from anon, authenticated;
grant select, delete on public.pesos to authenticated;
-- Solo estas columnas se pueden rellenar o cambiar desde la app.
-- (id, creada_por y creado_en los pone siempre la base de datos.)
grant insert (hogar_id, mascota_id, fecha, kg) on public.pesos to authenticated;
grant update (fecha, kg) on public.pesos to authenticated;

create policy "Veo los pesos de mi hogar"
  on public.pesos for select to authenticated
  using (hogar_id = (select public.mi_hogar_id()));

create policy "Apunto pesos en mi hogar"
  on public.pesos for insert to authenticated
  with check (hogar_id = (select public.mi_hogar_id()));

create policy "Cambio los pesos de mi hogar"
  on public.pesos for update to authenticated
  using (hogar_id = (select public.mi_hogar_id()))
  with check (hogar_id = (select public.mi_hogar_id()));

create policy "Borro los pesos de mi hogar"
  on public.pesos for delete to authenticated
  using (hogar_id = (select public.mi_hogar_id()));

commit;
