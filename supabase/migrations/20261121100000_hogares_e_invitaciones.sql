-- =====================================================================
-- Fase 1, paso 2: hogares, miembros e invitaciones
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
--
-- Idea de seguridad:
--   * RLS activado en las tres tablas: cada persona solo ve su hogar.
--   * Nadie puede escribir directamente en las tablas. Crear un hogar,
--     invitar y unirse se hace solo con las funciones de abajo, que
--     comprueban quién eres antes de hacer nada.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------

create table public.hogares (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 1 and 60),
  creado_en timestamptz not null default now()
);

create table public.miembros (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  nombre_visible text not null check (char_length(nombre_visible) between 1 and 40),
  rol text not null default 'miembro' check (rol in ('admin', 'miembro')),
  creado_en timestamptz not null default now(),
  -- De momento, cada persona pertenece a un solo hogar.
  constraint una_persona_un_hogar unique (user_id)
);

create index miembros_hogar_id_idx on public.miembros (hogar_id);

create table public.invitaciones (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  codigo text not null unique,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'usada')),
  creada_por uuid not null references auth.users (id) on delete cascade,
  usada_por uuid references auth.users (id) on delete set null,
  caduca_en timestamptz not null default now() + interval '7 days',
  creado_en timestamptz not null default now()
);

create index invitaciones_hogar_id_idx on public.invitaciones (hogar_id);

-- ---------------------------------------------------------------------
-- Seguridad: RLS y permisos
-- ---------------------------------------------------------------------

alter table public.hogares enable row level security;
alter table public.miembros enable row level security;
alter table public.invitaciones enable row level security;

-- Quien no ha entrado (anon) no puede tocar nada. Quien ha entrado solo
-- puede leer (y cambiar el nombre del hogar); el resto, con funciones.
revoke all on public.hogares, public.miembros, public.invitaciones from anon, authenticated;
grant select on public.hogares, public.miembros, public.invitaciones to authenticated;
grant update (nombre) on public.hogares to authenticated;

-- Devuelve el hogar de la persona que hace la petición.
-- Es "security definer" para poder mirar la tabla miembros sin que su
-- propia regla RLS se llame a sí misma en bucle.
create function public.mi_hogar_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select hogar_id from public.miembros where user_id = (select auth.uid())
$$;

create policy "Veo mi hogar"
  on public.hogares for select to authenticated
  using (id = (select public.mi_hogar_id()));

create policy "Cambio el nombre de mi hogar"
  on public.hogares for update to authenticated
  using (id = (select public.mi_hogar_id()))
  with check (id = (select public.mi_hogar_id()));

create policy "Veo a la gente de mi hogar"
  on public.miembros for select to authenticated
  using (hogar_id = (select public.mi_hogar_id()));

create policy "Veo las invitaciones de mi hogar"
  on public.invitaciones for select to authenticated
  using (hogar_id = (select public.mi_hogar_id()));

-- ---------------------------------------------------------------------
-- Funciones que usa la app
-- ---------------------------------------------------------------------

-- Crea un hogar y te mete como admin, todo de una vez.
create function public.crear_hogar(nombre_hogar text, mi_nombre text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  yo uuid := auth.uid();
  nuevo_hogar uuid;
begin
  if yo is null then
    raise exception 'Tienes que entrar con tu cuenta primero.';
  end if;
  if exists (select 1 from public.miembros where user_id = yo) then
    raise exception 'Ya perteneces a un hogar.';
  end if;
  if char_length(trim(coalesce(nombre_hogar, ''))) not between 1 and 60 then
    raise exception 'Ponle un nombre a tu hogar (máximo 60 letras).';
  end if;
  if char_length(trim(coalesce(mi_nombre, ''))) not between 1 and 40 then
    raise exception 'Escribe tu nombre (máximo 40 letras).';
  end if;

  insert into public.hogares (nombre)
  values (trim(nombre_hogar))
  returning id into nuevo_hogar;

  insert into public.miembros (hogar_id, user_id, nombre_visible, rol)
  values (nuevo_hogar, yo, trim(mi_nombre), 'admin');

  return nuevo_hogar;
end;
$$;

-- Crea un código de invitación para tu hogar (vale 7 días y un solo uso).
-- Si ya hay uno pendiente y sin caducar, devuelve ese.
create function public.crear_invitacion()
returns table (codigo text, caduca_en timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  yo uuid := auth.uid();
  mi_hogar uuid;
  -- Sin letras que se confunden (O/0, I/1/L).
  letras constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea;
  nuevo_codigo text;
begin
  select m.hogar_id into mi_hogar from public.miembros m where m.user_id = yo;
  if mi_hogar is null then
    raise exception 'Primero tienes que crear un hogar.';
  end if;

  return query
    select i.codigo, i.caduca_en
    from public.invitaciones i
    where i.hogar_id = mi_hogar and i.estado = 'pendiente' and i.caduca_en > now()
    order by i.creado_en desc
    limit 1;
  if found then
    return;
  end if;

  -- 8 caracteres al azar. gen_random_uuid() usa azar criptográfico, así
  -- que el código no se puede adivinar a partir de otros códigos.
  bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  nuevo_codigo := '';
  for posicion in 0..7 loop
    nuevo_codigo := nuevo_codigo
      || substr(letras, (get_byte(bytes, posicion) % length(letras)) + 1, 1);
  end loop;

  return query
    insert into public.invitaciones (hogar_id, codigo, creada_por)
    values (mi_hogar, nuevo_codigo, yo)
    returning invitaciones.codigo, invitaciones.caduca_en;
end;
$$;

-- Te une al hogar de un código de invitación válido.
create function public.unirse_a_hogar(codigo_invitacion text, mi_nombre text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  yo uuid := auth.uid();
  invitacion public.invitaciones%rowtype;
begin
  if yo is null then
    raise exception 'Tienes que entrar con tu cuenta primero.';
  end if;
  if exists (select 1 from public.miembros where user_id = yo) then
    raise exception 'Ya perteneces a un hogar.';
  end if;
  if char_length(trim(coalesce(mi_nombre, ''))) not between 1 and 40 then
    raise exception 'Escribe tu nombre (máximo 40 letras).';
  end if;

  select * into invitacion
  from public.invitaciones
  where codigo = upper(trim(codigo_invitacion))
    and estado = 'pendiente'
    and caduca_en > now()
  for update;

  if not found then
    raise exception 'Ese código no existe, ya se ha usado o ha caducado.';
  end if;

  insert into public.miembros (hogar_id, user_id, nombre_visible, rol)
  values (invitacion.hogar_id, yo, trim(mi_nombre), 'miembro');

  update public.invitaciones
  set estado = 'usada', usada_por = yo
  where id = invitacion.id;

  return invitacion.hogar_id;
end;
$$;

-- Solo quien ha entrado puede usar estas funciones.
revoke execute on function public.mi_hogar_id() from public, anon;
revoke execute on function public.crear_hogar(text, text) from public, anon;
revoke execute on function public.crear_invitacion() from public, anon;
revoke execute on function public.unirse_a_hogar(text, text) from public, anon;
grant execute on function public.mi_hogar_id() to authenticated;
grant execute on function public.crear_hogar(text, text) to authenticated;
grant execute on function public.crear_invitacion() to authenticated;
grant execute on function public.unirse_a_hogar(text, text) to authenticated;

commit;
