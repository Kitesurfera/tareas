-- =====================================================================
-- Tareas en lenguaje natural: límite de usos de la IA al día
--
-- Necesita que antes se hayan ejecutado todos los SQL anteriores.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
-- Se puede ejecutar varias veces: si ya estaba aplicado, no cambia nada.
--
-- Qué hace:
--   * usos_ia: apunta cada vez que alguien del hogar le pide a la IA que
--     entienda una tarea escrita o dictada (solo quién, qué tipo y cuándo;
--     NUNCA el texto). Sirve para poner un límite al día, para no gastar el
--     cupo gratuito diario de la IA (Cloudflare).
--
-- Seguridad:
--   * Desde la app no se puede leer ni escribir: solo el servidor de la
--     app (funciones de Vercel, con la clave secreta) la usa.
--   * Si se borra el hogar, se borran sus usos.
-- =====================================================================

begin;

do $$
begin
  if to_regclass('public.hogares') is null or to_regclass('public.miembros') is null then
    raise exception 'Primero tienes que ejecutar los SQL anteriores (falta la tabla de hogares o de miembros).';
  end if;
end $$;

create table if not exists public.usos_ia (
  id bigint generated always as identity primary key,
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  tipo text not null check (tipo in ('tarea')),
  creado_en timestamptz not null default now()
);

create index if not exists usos_ia_hogar_tipo_fecha_idx
  on public.usos_ia (hogar_id, tipo, creado_en);

-- RLS activado y ninguna regla: nadie desde la app (ni con cuenta) puede
-- tocarla. El servidor usa la clave secreta, que se salta RLS.
alter table public.usos_ia enable row level security;
revoke all on public.usos_ia from anon, authenticated;

-- Lo que necesita el servidor (por si el proyecto no da permisos de serie
-- a las tablas nuevas): saber de qué hogar eres, contar los usos del día y
-- apuntar el nuevo. Volver a darlos no cambia nada.
grant select (user_id, hogar_id) on public.miembros to service_role;
grant select, insert on public.usos_ia to service_role;

commit;
