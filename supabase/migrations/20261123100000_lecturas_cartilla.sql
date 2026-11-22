-- =====================================================================
-- Leer la cartilla con IA: límite de lecturas al día
--
-- Necesita que antes se hayan ejecutado todos los SQL anteriores.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
-- Se puede ejecutar varias veces: si ya estaba aplicado, no cambia nada.
--
-- Qué hace:
--   * lecturas_cartilla: apunta cada vez que un hogar pide leer una
--     cartilla con IA (solo cuándo y cuántas páginas; NUNCA las fotos ni lo
--     que pone). Sirve para poner un límite al día, para no gastar el
--     cupo gratuito diario de la IA (Cloudflare).
--
-- Seguridad:
--   * Desde la app no se puede leer ni escribir: solo el servidor de la
--     app (funciones de Vercel, con la clave secreta) la usa.
--   * Si se borra el hogar, se borran sus lecturas.
-- =====================================================================

begin;

create table if not exists public.lecturas_cartilla (
  id bigint generated always as identity primary key,
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  paginas integer not null check (paginas between 1 and 20),
  creado_en timestamptz not null default now()
);

create index if not exists lecturas_cartilla_hogar_fecha_idx
  on public.lecturas_cartilla (hogar_id, creado_en);

-- RLS activado y ninguna regla: nadie desde la app (ni con cuenta) puede
-- tocarla. El servidor usa la clave secreta, que se salta RLS.
alter table public.lecturas_cartilla enable row level security;
revoke all on public.lecturas_cartilla from anon, authenticated;

-- Lo que necesita el servidor (por si el proyecto no da permisos de serie
-- a las tablas nuevas): saber de qué hogar eres, contar las lecturas del
-- día y apuntar la nueva. Volver a darlos no cambia nada.
grant select (user_id, hogar_id) on public.miembros to service_role;
grant select, insert on public.lecturas_cartilla to service_role;

commit;
