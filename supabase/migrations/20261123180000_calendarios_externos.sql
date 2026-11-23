-- =====================================================================
-- Calendarios de otras apps: un enlace privado por persona para ver las
-- tareas y los planes en el calendario del iPhone o en Google Calendar,
-- con su alarma (el propio calendario avisa, aunque fallen los avisos)
--
-- Necesita que antes se hayan ejecutado todos los SQL anteriores.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
-- Se puede ejecutar varias veces: si ya estaba aplicado, no cambia nada.
--
-- Qué hace:
--   * calendarios_externos: el enlace de cada persona (un código al azar
--     de 64 letras), si está activado y cuándo lo consultó un calendario
--     por última vez.
--   * activar_calendario, desactivar_calendario y cambiar_enlace_calendario:
--     lo que hace el interruptor de Ajustes.
--   * calendario_por_enlace: lo que ve el calendario (solo para el
--     servidor): tus tareas con fecha y las que no son de nadie, y los
--     planes del hogar. Nada más (ni notas, ni gente, ni documentos).
--
-- Seguridad:
--   * Cada persona solo ve SU enlace, y solo se cambia con esas funciones.
--   * Quien tenga el enlace ve los títulos y fechas: por eso es largo, al
--     azar, se puede desactivar (el calendario se queda vacío) o cambiar
--     (el enlace viejo deja de funcionar).
--   * Si alguien sale del hogar o lo quitan, su enlace se borra solo.
-- =====================================================================

begin;

do $$
begin
  if to_regclass('public.documentos') is null then
    raise exception 'Falta un SQL anterior: ejecuta antes 20261123160000_documentos.sql';
  end if;
end;
$$;

create table if not exists public.calendarios_externos (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  -- Si la persona sale del hogar (o la quitan), se borra su enlace.
  miembro_id uuid not null unique references public.miembros (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  token text not null unique check (token ~ '^[a-f0-9]{64}$'),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  ultimo_uso timestamptz
);

alter table public.calendarios_externos enable row level security;
revoke all on public.calendarios_externos from anon, authenticated;
-- Solo leer el tuyo; se crea y se cambia únicamente con las funciones.
grant select on public.calendarios_externos to authenticated;

drop policy if exists "Veo mi enlace de calendario" on public.calendarios_externos;
create policy "Veo mi enlace de calendario" on public.calendarios_externos for select to authenticated
  using (user_id = (select auth.uid()));

-- Un código al azar de 64 letras (dos identificadores aleatorios seguidos).
create or replace function public.nuevo_token_calendario()
returns text
language sql
volatile
set search_path = ''
as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
$$;

revoke execute on function public.nuevo_token_calendario() from public, anon, authenticated;

-- Activar: si ya tenías enlace, se vuelve a activar (el mismo); si no, se crea.
create or replace function public.activar_calendario()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  yo public.miembros%rowtype;
  el_token text;
begin
  select * into yo from public.miembros where user_id = auth.uid();
  if not found then
    raise exception 'Primero tienes que estar en un hogar.';
  end if;

  update public.calendarios_externos set activo = true
  where user_id = auth.uid()
  returning token into el_token;

  if el_token is null then
    insert into public.calendarios_externos (hogar_id, miembro_id, user_id, token)
    values (yo.hogar_id, yo.id, auth.uid(), public.nuevo_token_calendario())
    returning token into el_token;
  end if;
  return el_token;
end;
$$;

-- Desactivar: el enlace sigue existiendo, pero el calendario se queda vacío.
create or replace function public.desactivar_calendario()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.calendarios_externos set activo = false where user_id = auth.uid();
$$;

-- Cambiar el enlace: el viejo deja de funcionar al momento.
create or replace function public.cambiar_enlace_calendario()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  el_token text;
begin
  update public.calendarios_externos
  set token = public.nuevo_token_calendario(), activo = true, ultimo_uso = null
  where user_id = auth.uid()
  returning token into el_token;
  if el_token is null then
    raise exception 'Primero activa el calendario.';
  end if;
  return el_token;
end;
$$;

revoke execute on function public.activar_calendario() from public, anon;
revoke execute on function public.desactivar_calendario() from public, anon;
revoke execute on function public.cambiar_enlace_calendario() from public, anon;
grant execute on function public.activar_calendario() to authenticated;
grant execute on function public.desactivar_calendario() to authenticated;
grant execute on function public.cambiar_enlace_calendario() to authenticated;

-- Lo que ve el calendario con ese enlace (solo lo llama el servidor):
--   * estado: «desconocido» (enlace que no existe o persona que ya no está),
--     «desactivado» (calendario vacío) o «activo».
--   * tareas pendientes con fecha que son tuyas o no son de nadie (también
--     las atrasadas) y planes del hogar sin hacer desde ayer.
create or replace function public.calendario_por_enlace(el_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cal public.calendarios_externos%rowtype;
  yo public.miembros%rowtype;
  hoy date := (now() at time zone 'Europe/Madrid')::date;
begin
  if el_token is null or el_token !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('estado', 'desconocido');
  end if;
  select * into cal from public.calendarios_externos where token = el_token;
  if not found then
    return jsonb_build_object('estado', 'desconocido');
  end if;
  select * into yo from public.miembros where id = cal.miembro_id and hogar_id = cal.hogar_id;
  if not found then
    return jsonb_build_object('estado', 'desconocido');
  end if;

  -- Para que la persona vea en Ajustes que su calendario se está usando.
  if cal.ultimo_uso is null or cal.ultimo_uso < now() - interval '10 minutes' then
    update public.calendarios_externos set ultimo_uso = now() where id = cal.id;
  end if;

  if not cal.activo then
    return jsonb_build_object('estado', 'desactivado');
  end if;

  return jsonb_build_object(
    'estado', 'activo',
    'hoy', hoy,
    'hogar', (select h.nombre from public.hogares h where h.id = yo.hogar_id),
    'tareas', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'titulo', t.titulo, 'fecha', t.fecha_limite) order by t.fecha_limite, t.creado_en)
      from public.tareas t
      where t.hogar_id = yo.hogar_id
        and not t.completada
        and t.fecha_limite is not null
        and t.fecha_limite <= hoy + 400
        and (t.responsable_id is null or t.responsable_id = yo.id)
    ), '[]'::jsonb),
    'planes', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'titulo', p.nombre, 'fecha', a.fecha) order by a.fecha)
      from public.agenda_planes a
      join public.planes p on p.id = a.plan_id
      where a.hogar_id = yo.hogar_id
        and not a.hecho
        and a.fecha between hoy - 1 and hoy + 400
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.calendario_por_enlace(text) from public, anon, authenticated;
grant execute on function public.calendario_por_enlace(text) to service_role;

commit;
