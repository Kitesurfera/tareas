-- =====================================================================
-- Recordatorios con notificaciones en el móvil
--
-- Necesita que antes se hayan ejecutado todos los SQL anteriores.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
--
-- Qué hace:
--   * avisos_push: los móviles (o navegadores) en los que cada persona ha
--     activado los avisos. Lo que se guarda es la «dirección» a la que el
--     servicio de notificaciones del móvil entrega los avisos.
--   * recordatorios_del_dia: prepara, para cada persona, lo que le toca
--     hoy o va atrasado. SOLO la puede usar el servidor de Vercel (con la
--     clave secreta), nunca la app.
--
-- Seguridad:
--   * Cada persona solo ve, guarda y borra SUS móviles (RLS).
--   * La app no puede leer los avisos de nadie más ni pedir resúmenes.
-- =====================================================================

begin;

create table public.avisos_push (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Dirección del servicio de avisos del móvil y sus claves de cifrado.
  endpoint text not null unique check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  -- Último día que se le mandó el resumen (para no repetirlo).
  ultimo_envio date,
  creado_en timestamptz not null default now()
);

create index avisos_push_user_id_idx on public.avisos_push (user_id);

alter table public.avisos_push enable row level security;

revoke all on public.avisos_push from anon, authenticated;
grant select, delete on public.avisos_push to authenticated;

create policy "Veo mis móviles con avisos"
  on public.avisos_push for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Borro mis móviles con avisos"
  on public.avisos_push for delete to authenticated
  using (user_id = (select auth.uid()));

-- Guardar (o renovar) el móvil en el que activas los avisos. La app lo
-- llama también al abrirse, para que la dirección esté siempre al día. Si
-- ese móvil estaba apuntado a otra cuenta (p. ej. compartís tablet), pasa
-- a la tuya.
create function public.guardar_aviso_push(direccion text, clave_p256dh text, clave_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  yo uuid := auth.uid();
begin
  if yo is null then
    raise exception 'Tienes que entrar con tu cuenta primero.';
  end if;

  insert into public.avisos_push (user_id, endpoint, p256dh, auth)
  values (yo, direccion, clave_p256dh, clave_auth)
  on conflict on constraint avisos_push_endpoint_key do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth;
end;
$$;

-- Resumen del día para cada móvil con avisos: lo pendiente de su hogar que
-- vence hasta «dia» (incluido lo atrasado) y que es suyo o no es de nadie.
-- Solo para el servidor (service_role).
create function public.recordatorios_del_dia(dia date)
returns table (
  aviso_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  titulos text[],
  total integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.endpoint, a.p256dh, a.auth,
         (array_agg(t.titulo order by t.fecha_limite, t.creado_en))[1:3],
         count(*)::integer
  from public.avisos_push a
  join public.miembros m on m.user_id = a.user_id
  join public.tareas t on t.hogar_id = m.hogar_id
  where not t.completada
    and t.fecha_limite <= dia
    and (t.responsable_id = m.id or t.responsable_id is null)
    and a.ultimo_envio is distinct from dia
  group by a.id, a.endpoint, a.p256dh, a.auth
$$;

revoke execute on function public.guardar_aviso_push(text, text, text) from public, anon;
grant execute on function public.guardar_aviso_push(text, text, text) to authenticated;
revoke execute on function public.recordatorios_del_dia(date) from public, anon, authenticated;
grant execute on function public.recordatorios_del_dia(date) to service_role;

-- El servidor apunta el envío y borra los móviles que ya no existen.
grant select, update (ultimo_envio), delete on public.avisos_push to service_role;

commit;
