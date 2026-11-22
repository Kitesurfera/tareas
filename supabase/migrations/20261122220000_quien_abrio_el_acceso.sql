-- =====================================================================
-- Acceso temporal: saber con qué cuenta se abrió cada enlace
--
-- Necesita que antes se hayan ejecutado todos los SQL anteriores.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
-- Se puede ejecutar varias veces: si ya estaba aplicado, no cambia nada.
--
-- Qué hace:
--   * Cuando alguien abre un enlace de acceso, se guarda su nombre de
--     Google y su email A MEDIAS («ma•••@ejemplo.com»): lo justo para que
--     el hogar compruebe que lo abrió la persona correcta.
--   * Se rellena también en los accesos que ya estaban abiertos.
--
-- Seguridad:
--   * Lo escribe solo la base de datos (aceptar_acceso). Desde la app no
--     se puede cambiar ni inventar.
--   * Solo lo ve la gente del hogar que dio el acceso (las reglas de
--     siempre de la tabla accesos).
-- =====================================================================

begin;

do $$
begin
  if to_regclass('public.accesos') is null then
    raise exception 'Falta un SQL anterior: ejecuta antes 20261122180000_acceso_temporal.sql';
  end if;
end;
$$;

-- «if not exists»: si ya están (porque el SQL ya se ejecutó), no hace nada.
alter table public.accesos add column if not exists aceptado_nombre text;
alter table public.accesos add column if not exists aceptado_email text;
alter table public.accesos add column if not exists aceptado_en timestamptz;
-- (No se da permiso para escribirlas desde la app: solo la base de datos.)

-- «marta.garcia@ejemplo.com» → «ma•••@ejemplo.com»
create or replace function public.email_a_medias(email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when email is null or position('@' in email) = 0 then null
    else left(split_part(email, '@', 1), 2) || '•••@' || split_part(email, '@', 2)
  end
$$;

revoke execute on function public.email_a_medias(text) from public, anon, authenticated;

-- Igual que antes, más: apunta con qué cuenta se abrió (la primera vez).
create or replace function public.aceptar_acceso(codigo_acceso text)
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
  if acceso.user_id is null then
    update public.accesos set user_id = yo, aceptado_en = now() where id = acceso.id;
    update public.accesos a
    set aceptado_nombre = left(nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')), ''), 60),
        aceptado_email = public.email_a_medias(u.email)
    from auth.users u
    where a.id = acceso.id and u.id = yo;
  end if;
  return acceso.id;
end;
$$;

-- Los accesos que ya se habían abierto.
update public.accesos a
set aceptado_nombre = left(nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')), ''), 60),
    aceptado_email = public.email_a_medias(u.email)
from auth.users u
where u.id = a.user_id and a.aceptado_email is null;

commit;
