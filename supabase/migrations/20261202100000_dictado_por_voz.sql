-- =====================================================================
-- 🎤 Dictado por voz en el iPhone: límite de usos al día
--
-- Necesita que antes se hayan ejecutado todos los SQL anteriores (como
-- mínimo, 20261201100000_plantillas.sql).
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
-- Se puede ejecutar varias veces: si ya estaba aplicado, no cambia nada.
--
-- Qué hace:
--   * usos_ia: también cuenta cada vez que la IA pasa a texto lo que
--     dictas (tipo «voz»), para ponerle un límite al día y no gastar el
--     cupo gratuito de la IA (Cloudflare). Como siempre, solo se apunta
--     quién, qué tipo y cuándo: NUNCA el audio ni el texto.
--
-- Seguridad: igual que antes. Desde la app no se puede leer ni escribir
-- usos_ia: solo la usa el servidor de la app (funciones de Vercel).
-- =====================================================================

begin;

do $$
begin
  if to_regclass('public.usos_ia') is null then
    raise exception 'Falta un SQL anterior: ejecuta antes 20261123120000_usos_ia.sql';
  end if;
  if to_regclass('public.plantillas') is null then
    raise exception 'Falta un SQL anterior: ejecuta antes 20261201100000_plantillas.sql';
  end if;
end;
$$;

alter table public.usos_ia drop constraint if exists usos_ia_tipo_check;
alter table public.usos_ia add constraint usos_ia_tipo_check check (tipo in ('tarea', 'ver', 'cabeza', 'plantilla', 'voz'));

commit;
