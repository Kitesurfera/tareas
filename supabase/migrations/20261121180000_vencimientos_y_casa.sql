-- =====================================================================
-- Ampliación: Vencimientos (seguros y suscripciones) y Casa (rutinas y
-- lista de la compra)
--
-- Necesita que antes se hayan ejecutado los SQL de los pasos 2 a 5.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
--
-- Qué hace:
--   * vencimientos: seguros y suscripciones con su fecha de renovación.
--     Si tienen aviso, crean solas una tarea X días antes; al marcarla
--     como hecha, la fecha salta a la siguiente renovación.
--   * rutinas: tareas de casa que se repiten (limpiar el baño cada
--     semana…). Funcionan igual que los tratamientos de la mascota.
--   * lista_compra: lista compartida. Apunta quién compró cada cosa.
--
-- Seguridad: igual que el resto. RLS en todo, claves compuestas para
-- no mezclar hogares, y las tareas automáticas solo se cambian desde su
-- vencimiento o su rutina.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Vencimientos
-- ---------------------------------------------------------------------

create table public.vencimientos (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  tipo text not null check (tipo in ('seguro', 'suscripcion')),
  nombre text not null check (char_length(trim(nombre)) between 1 and 60),
  -- Próxima vez que se renueva.
  fecha_renovacion date not null check (fecha_renovacion > date '2000-01-01'),
  -- Cada cuántos meses se renueva (vacío = no se repite, p. ej. el fin
  -- de una prueba gratis).
  frecuencia_meses integer check (frecuencia_meses between 1 and 120),
  importe numeric(10, 2) check (importe >= 0 and importe < 1000000),
  -- Cuántos días antes avisar (vacío = sin aviso, no crea tareas).
  aviso_dias integer check (aviso_dias between 0 and 120),
  responsable_id uuid,
  notas text check (char_length(notas) <= 2000),
  -- Para los que no se repiten: renovación cuyo aviso ya se hizo.
  revisado_para date,
  creada_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  constraint vencimientos_id_hogar unique (id, hogar_id),
  constraint responsable_del_hogar foreign key (responsable_id, hogar_id)
    references public.miembros (id, hogar_id) on delete set null (responsable_id)
);

create index vencimientos_hogar_id_idx on public.vencimientos (hogar_id);

-- ---------------------------------------------------------------------
-- Rutinas de casa
-- ---------------------------------------------------------------------

create table public.rutinas (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  nombre text not null check (char_length(trim(nombre)) between 1 and 60),
  frecuencia_dias integer not null check (frecuencia_dias between 1 and 365),
  fecha_ultima date not null check (fecha_ultima > date '2000-01-01'),
  responsable_id uuid,
  notas text check (char_length(notas) <= 2000),
  creada_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  constraint rutinas_id_hogar unique (id, hogar_id),
  constraint responsable_del_hogar foreign key (responsable_id, hogar_id)
    references public.miembros (id, hogar_id) on delete set null (responsable_id)
);

create index rutinas_hogar_id_idx on public.rutinas (hogar_id);

-- ---------------------------------------------------------------------
-- Lista de la compra
-- ---------------------------------------------------------------------

create table public.lista_compra (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  nombre text not null check (char_length(trim(nombre)) between 1 and 80),
  cantidad text check (char_length(cantidad) <= 30),
  comprado boolean not null default false,
  -- Lo ponen la base de datos y su disparador: no se pueden falsear.
  anadido_por uuid default auth.uid() references auth.users (id) on delete set null,
  comprado_por uuid references auth.users (id) on delete set null,
  comprado_en timestamptz,
  creado_en timestamptz not null default now()
);

create index lista_compra_hogar_id_idx on public.lista_compra (hogar_id);

-- ---------------------------------------------------------------------
-- Las tareas pueden venir también de un vencimiento o de una rutina
-- ---------------------------------------------------------------------

alter table public.tareas add column vencimiento_id uuid;
alter table public.tareas add column rutina_id uuid;

alter table public.tareas add constraint vencimiento_del_hogar
  foreign key (vencimiento_id, hogar_id)
  references public.vencimientos (id, hogar_id) on delete cascade;
alter table public.tareas add constraint rutina_del_hogar
  foreign key (rutina_id, hogar_id)
  references public.rutinas (id, hogar_id) on delete cascade;

create unique index una_pendiente_por_vencimiento
  on public.tareas (vencimiento_id) where not completada;
create unique index una_pendiente_por_rutina
  on public.tareas (rutina_id) where not completada;

-- Las reglas de tareas «a mano» excluyen ahora también estas automáticas.
alter policy "Creo tareas en mi hogar" on public.tareas
  with check (
    hogar_id = (select public.mi_hogar_id())
    and tratamiento_id is null and vencimiento_id is null and rutina_id is null
  );

alter policy "Edito las tareas a mano de mi hogar" on public.tareas
  using (
    hogar_id = (select public.mi_hogar_id())
    and tratamiento_id is null and vencimiento_id is null and rutina_id is null
  )
  with check (
    hogar_id = (select public.mi_hogar_id())
    and tratamiento_id is null and vencimiento_id is null and rutina_id is null
  );

alter policy "Borro las tareas a mano de mi hogar" on public.tareas
  using (
    hogar_id = (select public.mi_hogar_id())
    and tratamiento_id is null and vencimiento_id is null and rutina_id is null
  );

-- ---------------------------------------------------------------------
-- Seguridad: RLS y permisos de las tablas nuevas
-- ---------------------------------------------------------------------

alter table public.vencimientos enable row level security;
alter table public.rutinas enable row level security;
alter table public.lista_compra enable row level security;

revoke all on public.vencimientos, public.rutinas, public.lista_compra from anon, authenticated;

grant select, delete on public.vencimientos, public.rutinas, public.lista_compra to authenticated;

grant insert (hogar_id, tipo, nombre, fecha_renovacion, frecuencia_meses, importe, aviso_dias, responsable_id, notas)
  on public.vencimientos to authenticated;
grant update (tipo, nombre, fecha_renovacion, frecuencia_meses, importe, aviso_dias, responsable_id, notas)
  on public.vencimientos to authenticated;

grant insert (hogar_id, nombre, frecuencia_dias, fecha_ultima, responsable_id, notas)
  on public.rutinas to authenticated;
grant update (nombre, frecuencia_dias, fecha_ultima, responsable_id, notas)
  on public.rutinas to authenticated;

grant insert (hogar_id, nombre, cantidad) on public.lista_compra to authenticated;
grant update (nombre, cantidad, comprado) on public.lista_compra to authenticated;

create policy "Veo los vencimientos de mi hogar" on public.vencimientos for select to authenticated
  using (hogar_id = (select public.mi_hogar_id()));
create policy "Añado vencimientos en mi hogar" on public.vencimientos for insert to authenticated
  with check (hogar_id = (select public.mi_hogar_id()));
create policy "Edito los vencimientos de mi hogar" on public.vencimientos for update to authenticated
  using (hogar_id = (select public.mi_hogar_id())) with check (hogar_id = (select public.mi_hogar_id()));
create policy "Borro los vencimientos de mi hogar" on public.vencimientos for delete to authenticated
  using (hogar_id = (select public.mi_hogar_id()));

create policy "Veo las rutinas de mi hogar" on public.rutinas for select to authenticated
  using (hogar_id = (select public.mi_hogar_id()));
create policy "Añado rutinas en mi hogar" on public.rutinas for insert to authenticated
  with check (hogar_id = (select public.mi_hogar_id()));
create policy "Edito las rutinas de mi hogar" on public.rutinas for update to authenticated
  using (hogar_id = (select public.mi_hogar_id())) with check (hogar_id = (select public.mi_hogar_id()));
create policy "Borro las rutinas de mi hogar" on public.rutinas for delete to authenticated
  using (hogar_id = (select public.mi_hogar_id()));

create policy "Veo la lista de la compra de mi hogar" on public.lista_compra for select to authenticated
  using (hogar_id = (select public.mi_hogar_id()));
create policy "Añado a la lista de mi hogar" on public.lista_compra for insert to authenticated
  with check (hogar_id = (select public.mi_hogar_id()));
create policy "Marco en la lista de mi hogar" on public.lista_compra for update to authenticated
  using (hogar_id = (select public.mi_hogar_id())) with check (hogar_id = (select public.mi_hogar_id()));
create policy "Borro de la lista de mi hogar" on public.lista_compra for delete to authenticated
  using (hogar_id = (select public.mi_hogar_id()));

-- ---------------------------------------------------------------------
-- Reglas automáticas
-- ---------------------------------------------------------------------

-- Vencimiento creado o cambiado → su tarea de aviso se crea o se ajusta.
create function public.sincronizar_tarea_del_vencimiento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Sin aviso, o aviso ya hecho de algo que no se repite: sin tarea.
  if new.aviso_dias is null or new.revisado_para is not distinct from new.fecha_renovacion then
    delete from public.tareas where vencimiento_id = new.id and not completada;
    return null;
  end if;

  update public.tareas
  set titulo = 'Renovación: ' || trim(new.nombre),
      fecha_limite = new.fecha_renovacion - new.aviso_dias,
      responsable_id = new.responsable_id
  where vencimiento_id = new.id and not completada;

  if not found then
    insert into public.tareas
      (hogar_id, titulo, fecha_limite, responsable_id, categoria, vencimiento_id, creada_por)
    values
      (new.hogar_id, 'Renovación: ' || trim(new.nombre), new.fecha_renovacion - new.aviso_dias,
       new.responsable_id, 'papeleo', new.id, new.creada_por);
  end if;

  return null;
end;
$$;

create trigger tarea_al_crear_o_cambiar_vencimiento
  after insert or update on public.vencimientos
  for each row execute function public.sincronizar_tarea_del_vencimiento();

-- Rutina creada o cambiada → su tarea pendiente se crea o se ajusta.
create function public.sincronizar_tarea_de_la_rutina()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tareas
  set titulo = trim(new.nombre),
      fecha_limite = new.fecha_ultima + new.frecuencia_dias,
      responsable_id = new.responsable_id
  where rutina_id = new.id and not completada;

  if not found then
    insert into public.tareas
      (hogar_id, titulo, fecha_limite, responsable_id, categoria, rutina_id, creada_por)
    values
      (new.hogar_id, trim(new.nombre), new.fecha_ultima + new.frecuencia_dias,
       new.responsable_id, 'casa', new.id, new.creada_por);
  end if;

  return null;
end;
$$;

create trigger tarea_al_crear_o_cambiar_rutina
  after insert or update on public.rutinas
  for each row execute function public.sincronizar_tarea_de_la_rutina();

-- Lista de la compra: apunta quién marcó cada cosa como comprada.
create function public.apuntar_quien_compra()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.comprado and not old.comprado then
    new.comprado_por := auth.uid();
    new.comprado_en := now();
  elsif not new.comprado then
    new.comprado_por := null;
    new.comprado_en := null;
  end if;
  return new;
end;
$$;

create trigger quien_compra
  before update on public.lista_compra
  for each row execute function public.apuntar_quien_compra();

-- completar_tarea ahora también entiende vencimientos y rutinas.
create or replace function public.completar_tarea(tarea_id uuid, hecha_el date default current_date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tarea public.tareas%rowtype;
  vencimiento public.vencimientos%rowtype;
  siguiente date;
  vueltas integer := 0;
begin
  select * into tarea
  from public.tareas t
  where t.id = tarea_id and t.hogar_id = public.mi_hogar_id()
  for update;

  if not found then
    raise exception 'No encontramos esa tarea en tu hogar.';
  end if;
  if tarea.completada then
    raise exception 'Esa tarea ya estaba hecha.';
  end if;
  -- +1 día de margen: la base de datos usa la hora UTC y en España ya
  -- puede ser «mañana».
  if hecha_el is null or hecha_el > current_date + 1 or hecha_el <= date '1980-01-01' then
    raise exception 'Elige una fecha que no sea futura.';
  end if;

  update public.tareas
  set completada = true, completada_por = auth.uid(), completada_en = now()
  where id = tarea.id;

  if tarea.tratamiento_id is not null then
    update public.tratamientos set fecha_ultima = hecha_el where id = tarea.tratamiento_id;
  end if;

  if tarea.rutina_id is not null then
    update public.rutinas set fecha_ultima = hecha_el where id = tarea.rutina_id;
  end if;

  if tarea.vencimiento_id is not null then
    select * into vencimiento from public.vencimientos where id = tarea.vencimiento_id for update;
    if vencimiento.frecuencia_meses is null then
      -- No se repite: apuntamos que este aviso ya está hecho.
      update public.vencimientos set revisado_para = vencimiento.fecha_renovacion
      where id = vencimiento.id;
    else
      -- Salta a la siguiente renovación que todavía no haya pasado.
      loop
        vueltas := vueltas + 1;
        siguiente := (vencimiento.fecha_renovacion
          + make_interval(months => vencimiento.frecuencia_meses * vueltas))::date;
        exit when siguiente > current_date;
      end loop;
      update public.vencimientos set fecha_renovacion = siguiente where id = vencimiento.id;
    end if;
  end if;
end;
$$;

-- reabrir_tarea: ninguna tarea automática se puede reabrir.
create or replace function public.reabrir_tarea(tarea_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tarea public.tareas%rowtype;
begin
  select * into tarea
  from public.tareas t
  where t.id = tarea_id and t.hogar_id = public.mi_hogar_id()
  for update;

  if not found then
    raise exception 'No encontramos esa tarea en tu hogar.';
  end if;
  if tarea.tratamiento_id is not null or tarea.vencimiento_id is not null or tarea.rutina_id is not null then
    raise exception 'Las tareas automáticas no se pueden reabrir: cambia la fecha en su tratamiento, rutina o vencimiento.';
  end if;
  if not tarea.completada then
    return;
  end if;

  update public.tareas
  set completada = false, completada_por = null, completada_en = null
  where id = tarea.id;
end;
$$;

revoke execute on function public.sincronizar_tarea_del_vencimiento() from public, anon, authenticated;
revoke execute on function public.sincronizar_tarea_de_la_rutina() from public, anon, authenticated;
revoke execute on function public.apuntar_quien_compra() from public, anon, authenticated;
revoke execute on function public.completar_tarea(uuid, date) from public, anon;
revoke execute on function public.reabrir_tarea(uuid) from public, anon;
grant execute on function public.completar_tarea(uuid, date) to authenticated;
grant execute on function public.reabrir_tarea(uuid) to authenticated;

commit;
