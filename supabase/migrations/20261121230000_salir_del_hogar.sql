-- =====================================================================
-- Salir del hogar, quitar a alguien y anular invitaciones
--
-- Necesita que antes se hayan ejecutado todos los SQL anteriores.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
--
-- Por qué: hasta ahora nadie podía salir ni ser quitado de un hogar.
-- Si alguien deja de vivir con vosotras, seguiría viéndolo todo.
--
-- Reglas:
--   * Cualquiera puede SALIR. Si es la última persona, se borra el hogar
--     entero con todo lo que hay dentro.
--   * Solo quien ADMINISTRA puede QUITAR a otra persona.
--   * Siempre queda alguien administrando: si se va la admin, pasa a
--     serlo la persona que lleva más tiempo en el hogar.
--   * Lo que tenía asignado quien se va queda «sin responsable», salvo
--     en rutinas con turnos, que pasan a la siguiente persona.
--   * Cualquiera del hogar puede ANULAR las invitaciones pendientes.
-- =====================================================================

begin;

-- Uso interno (no se puede llamar desde la app): saca a una persona de
-- su hogar y deja todo en orden.
create function public.sacar_de_su_hogar(miembro_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  persona public.miembros%rowtype;
begin
  select * into persona from public.miembros where id = miembro_id for update;
  if not found then
    return;
  end if;

  -- Fuera de los turnos en los que participaba.
  update public.rutinas
  set participantes = array_remove(participantes, persona.id)
  where hogar_id = persona.hogar_id and persona.id = any (participantes);

  -- Al borrarla, lo que tenía asignado queda sin responsable (lo hace la
  -- propia base de datos con «on delete set null»).
  delete from public.miembros where id = persona.id;

  -- Las rutinas con turnos no se quedan sin nadie: pasan a la primera
  -- persona que participa.
  update public.rutinas r
  set responsable_id = (
    select m.id from public.miembros m
    where m.hogar_id = r.hogar_id
      and (r.participantes is null or m.id = any (r.participantes))
    order by m.creado_en, m.id
    limit 1
  )
  where r.hogar_id = persona.hogar_id and r.turnos and r.responsable_id is null;

  -- Siempre tiene que haber alguien administrando.
  if not exists (
    select 1 from public.miembros where hogar_id = persona.hogar_id and rol = 'admin'
  ) then
    update public.miembros
    set rol = 'admin'
    where id = (
      select id from public.miembros
      where hogar_id = persona.hogar_id
      order by creado_en, id
      limit 1
    );
  end if;
end;
$$;

-- Salir de tu hogar. Si eres la última persona, se borra el hogar.
create function public.salir_del_hogar()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  yo public.miembros%rowtype;
begin
  select * into yo from public.miembros where user_id = auth.uid() for update;
  if not found then
    raise exception 'No perteneces a ningún hogar.';
  end if;

  if not exists (
    select 1 from public.miembros where hogar_id = yo.hogar_id and id <> yo.id
  ) then
    -- Última persona: se borra el hogar y, en cascada, todo lo suyo.
    delete from public.hogares where id = yo.hogar_id;
  else
    perform public.sacar_de_su_hogar(yo.id);
  end if;
end;
$$;

-- Quitar a otra persona de tu hogar (solo quien administra).
create function public.quitar_del_hogar(miembro_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  yo public.miembros%rowtype;
  persona public.miembros%rowtype;
begin
  select * into yo from public.miembros where user_id = auth.uid();
  if not found or yo.rol <> 'admin' then
    raise exception 'Solo quien administra el hogar puede quitar a alguien.';
  end if;

  select * into persona from public.miembros m
  where m.id = miembro_id and m.hogar_id = yo.hogar_id;
  if not found then
    raise exception 'Esa persona no está en tu hogar.';
  end if;
  if persona.id = yo.id then
    raise exception 'Para irte tú, usa «Salir del hogar».';
  end if;

  perform public.sacar_de_su_hogar(persona.id);
end;
$$;

-- Anular las invitaciones pendientes de tu hogar (por ejemplo, si
-- mandaste el enlace a quien no era).
create function public.anular_invitaciones()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  mi_hogar uuid := public.mi_hogar_id();
begin
  if mi_hogar is null then
    raise exception 'No perteneces a ningún hogar.';
  end if;
  delete from public.invitaciones where hogar_id = mi_hogar and estado = 'pendiente';
end;
$$;

revoke execute on function public.sacar_de_su_hogar(uuid) from public, anon, authenticated;
revoke execute on function public.salir_del_hogar() from public, anon;
revoke execute on function public.quitar_del_hogar(uuid) from public, anon;
revoke execute on function public.anular_invitaciones() from public, anon;
grant execute on function public.salir_del_hogar() to authenticated;
grant execute on function public.quitar_del_hogar(uuid) to authenticated;
grant execute on function public.anular_invitaciones() to authenticated;

commit;
