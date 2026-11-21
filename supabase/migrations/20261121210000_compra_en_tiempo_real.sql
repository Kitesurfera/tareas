-- =====================================================================
-- Lista de la compra en tiempo real
--
-- Necesita que antes se hayan ejecutado todos los SQL anteriores.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
--
-- Cómo funciona:
--   * Cada vez que alguien añade, marca o quita algo de la lista, la base
--     de datos manda un aviso por un canal PRIVADO del hogar
--     («hogar:<id>:compra»).
--   * Los móviles del hogar que tienen la lista abierta reciben el aviso
--     y la recargan al momento.
--
-- Seguridad:
--   * Una regla (RLS) en realtime.messages: solo puedes escuchar el canal
--     de TU hogar. Aunque alguien adivinara el nombre del canal de otro
--     hogar, Supabase no le dejaría entrar.
--   * Si el aviso fallara por lo que sea, la lista sigue funcionando
--     (solo se perdería el «al momento»).
-- =====================================================================

begin;

create function public.avisar_cambios_compra()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform realtime.broadcast_changes(
      'hogar:' || coalesce(new.hogar_id, old.hogar_id)::text || ':compra',
      tg_op,           -- nombre del aviso: INSERT, UPDATE o DELETE
      tg_op,
      tg_table_name,
      tg_table_schema,
      new,
      old
    );
  exception when others then
    -- El aviso es un extra: nunca debe impedir guardar la lista.
    null;
  end;
  return null;
end;
$$;

create trigger avisar_cambios_compra
  after insert or update or delete on public.lista_compra
  for each row execute function public.avisar_cambios_compra();

revoke execute on function public.avisar_cambios_compra() from public, anon, authenticated;

-- Solo puedes recibir los avisos del canal de la lista de TU hogar.
create policy "Escucho la lista de la compra de mi hogar"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) = 'hogar:' || (select public.mi_hogar_id())::text || ':compra'
  );

commit;
