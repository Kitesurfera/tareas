-- =====================================================================
-- Carga mental en equipo: totales del hogar, gracias y números privados
--
-- Necesita que antes se haya ejecutado 20261122100000_carga_mental_y_ajustes.sql
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
--
-- Qué cambia:
--   * El diario guarda también el TÍTULO de cada cosa (para poder dar las
--     gracias por algo concreto aunque luego se borre).
--   * Tus números son SOLO tuyos: cada persona solo puede leer su parte del
--     diario. Ya no se pueden comparar cifras entre personas.
--   * totales_del_hogar: lo pensado y hecho entre todas, sin decir quién.
--   * agradecimientos: lo que han pensado las DEMÁS personas del hogar
--     (para decir «gracias por acordarte»), nunca lo tuyo.
-- =====================================================================

begin;

alter table public.actividad add column titulo text;

-- Los disparadores apuntan ahora también el título.
create or replace function public.apuntar_actividad_tarea()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.tratamiento_id is null and new.vencimiento_id is null and new.rutina_id is null
       and new.creada_por is not null then
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

create or replace function public.apuntar_actividad_al_crear()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.creada_por is not null then
    insert into public.actividad (hogar_id, user_id, tipo, origen, origen_id, titulo)
    values (new.hogar_id, new.creada_por, 'pensar', tg_argv[0], new.id, new.nombre);
  end if;
  return null;
end;
$$;

create or replace function public.apuntar_actividad_compra()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.anadido_por is not null then
      insert into public.actividad (hogar_id, user_id, tipo, origen, origen_id, titulo)
      values (new.hogar_id, new.anadido_por, 'pensar', 'compra', new.id, new.nombre);
    end if;
  elsif new.comprado and not old.comprado and new.comprado_por is not null then
    insert into public.actividad (hogar_id, user_id, tipo, origen, origen_id, titulo)
    values (new.hogar_id, new.comprado_por, 'hacer', 'compra', new.id, new.nombre);
  elsif old.comprado and not new.comprado then
    delete from public.actividad
    where origen = 'compra' and origen_id = new.id and tipo = 'hacer';
  end if;
  return null;
end;
$$;

-- Títulos de lo que ya estaba en el diario (si la cosa aún existe).
update public.actividad a set titulo = t.titulo from public.tareas t
  where a.origen = 'tarea' and t.id = a.origen_id;
update public.actividad a set titulo = x.nombre from public.tratamientos x
  where a.origen = 'tratamiento' and x.id = a.origen_id;
update public.actividad a set titulo = x.nombre from public.rutinas x
  where a.origen = 'rutina' and x.id = a.origen_id;
update public.actividad a set titulo = x.nombre from public.vencimientos x
  where a.origen = 'vencimiento' and x.id = a.origen_id;
update public.actividad a set titulo = x.nombre from public.lista_compra x
  where a.origen = 'compra' and x.id = a.origen_id;

-- Cada persona solo lee SU parte del diario. (Así resumen_carga_mental, que
-- usa los permisos de quien la llama, pasa a dar solo tus números.)
alter policy "Veo la actividad de mi hogar" on public.actividad
  using (user_id = (select auth.uid()) and hogar_id = (select public.mi_hogar_id()));
alter policy "Veo la actividad de mi hogar" on public.actividad
  rename to "Veo mi actividad";

-- Lo pensado y hecho entre todas, sin decir quién.
create function public.totales_del_hogar(desde date, hasta date)
returns table (pensar integer, hacer integer)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) filter (where a.tipo = 'pensar')::integer,
         count(*) filter (where a.tipo = 'hacer')::integer
  from public.actividad a
  where a.hogar_id = public.mi_hogar_id()
    and a.creado_en >= (desde::timestamp at time zone 'Europe/Madrid')
    and a.creado_en < (hasta::timestamp at time zone 'Europe/Madrid')
$$;

-- Para dar las gracias: lo que han pensado las DEMÁS personas del hogar
-- (nunca lo tuyo), de lo más nuevo a lo más antiguo.
create function public.agradecimientos(desde date, hasta date, cuantos integer default 50)
returns table (quien text, origen text, titulo text, creado_en timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.nombre_visible, a.origen, a.titulo, a.creado_en
  from public.actividad a
  join public.miembros m on m.user_id = a.user_id and m.hogar_id = a.hogar_id
  where a.hogar_id = public.mi_hogar_id()
    and a.user_id <> (select auth.uid())
    and a.tipo = 'pensar'
    and a.titulo is not null
    and a.creado_en >= (desde::timestamp at time zone 'Europe/Madrid')
    and a.creado_en < (hasta::timestamp at time zone 'Europe/Madrid')
  order by a.creado_en desc
  limit least(greatest(cuantos, 1), 200)
$$;

revoke execute on function public.totales_del_hogar(date, date) from public, anon;
revoke execute on function public.agradecimientos(date, date, integer) from public, anon;
grant execute on function public.totales_del_hogar(date, date) to authenticated;
grant execute on function public.agradecimientos(date, date, integer) to authenticated;

commit;
