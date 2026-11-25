-- =====================================================================
-- Vaciar la cabeza: tu bandeja privada
--
-- Necesita que antes se hayan ejecutado todos los SQL anteriores.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
-- Se puede ejecutar varias veces: si ya estaba aplicado, no cambia nada.
--
-- Qué hace:
--   * bandeja: lo que sueltas con el botón 🧠 («llamar al fontanero»,
--     «pilas», «ver Dune»…). Se queda ahí hasta que lo repartes (la IA
--     propone dónde va cada cosa y tú lo confirmas) o lo borras.
--   * usos_ia: también cuenta las veces que se reparte con la IA (para no
--     gastar el cupo gratuito).
--
-- Seguridad:
--   * La bandeja es PRIVADA: solo la ve, cambia y borra quien la escribió.
--     Ni siquiera la ve tu pareja (lo que repartes, sí: una tarea, la
--     compra…).
--   * La dueña la pone la base de datos (eres tú). Si sales del hogar, tu
--     bandeja se borra.
-- =====================================================================

begin;

do $$
begin
  if to_regprocedure('public.mi_miembro_id()') is null then
    raise exception 'Falta un SQL anterior: ejecuta antes 20261126100000_regalos.sql';
  end if;
end;
$$;

create table if not exists public.bandeja (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  -- Quién lo escribió: la pone la base de datos (eres tú).
  miembro_id uuid not null default public.mi_miembro_id(),
  texto text not null check (char_length(trim(texto)) between 1 and 500),
  creado_en timestamptz not null default now(),
  constraint bandeja_de_alguien_del_hogar foreign key (miembro_id, hogar_id)
    references public.miembros (id, hogar_id) on delete cascade
);

create index if not exists bandeja_miembro_idx on public.bandeja (miembro_id, creado_en);

-- Como mucho 200 cosas en la bandeja de cada persona (para que nadie la
-- use como almacén sin fondo).
create or replace function public.como_mucho_200_en_la_bandeja()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.bandeja b where b.miembro_id = new.miembro_id) >= 200 then
    raise exception 'Tu bandeja está llena (200 cosas). Reparte o borra alguna.';
  end if;
  return new;
end;
$$;

drop trigger if exists como_mucho_200_en_la_bandeja on public.bandeja;
create trigger como_mucho_200_en_la_bandeja
  before insert on public.bandeja
  for each row execute function public.como_mucho_200_en_la_bandeja();

revoke execute on function public.como_mucho_200_en_la_bandeja() from public, anon, authenticated;

alter table public.bandeja enable row level security;
revoke all on public.bandeja from anon, authenticated;
grant select, delete on public.bandeja to authenticated;
grant insert (hogar_id, texto) on public.bandeja to authenticated;
grant update (texto) on public.bandeja to authenticated;

drop policy if exists "Veo mi bandeja" on public.bandeja;
drop policy if exists "Escribo en mi bandeja" on public.bandeja;
drop policy if exists "Cambio mi bandeja" on public.bandeja;
drop policy if exists "Borro de mi bandeja" on public.bandeja;
create policy "Veo mi bandeja" on public.bandeja for select to authenticated
  using (miembro_id = (select public.mi_miembro_id()));
create policy "Escribo en mi bandeja" on public.bandeja for insert to authenticated
  with check (hogar_id = (select public.mi_hogar_id()) and miembro_id = (select public.mi_miembro_id()));
create policy "Cambio mi bandeja" on public.bandeja for update to authenticated
  using (miembro_id = (select public.mi_miembro_id()))
  with check (miembro_id = (select public.mi_miembro_id()));
create policy "Borro de mi bandeja" on public.bandeja for delete to authenticated
  using (miembro_id = (select public.mi_miembro_id()));

-- usos_ia: también «cabeza» (repartir la bandeja con la IA).
alter table public.usos_ia drop constraint if exists usos_ia_tipo_check;
alter table public.usos_ia add constraint usos_ia_tipo_check check (tipo in ('tarea', 'ver', 'cabeza'));

commit;
