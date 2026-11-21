-- =====================================================================
-- Fase 1, paso 5: tareas del hogar creadas a mano
--
-- Necesita que antes se hayan ejecutado los SQL de los pasos 2, 3 y 4.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Se ejecuta de una vez: si algo falla, no se aplica nada.
--
-- Qué permite:
--   * Crear, editar y borrar tareas «a mano» (seguro, ITV, regalos…).
--   * Reabrir una tarea a mano que se marcó como hecha por error.
--
-- Qué NO permite (a propósito):
--   * Tocar a mano las tareas que vienen de un tratamiento: esas se
--     cambian editando el tratamiento, para que la regla automática
--     nunca se rompa.
--   * Marcar tareas como hechas sin pasar por completar_tarea, ni
--     falsear quién creó o completó una tarea.
-- =====================================================================

begin;

-- Solo estas columnas se pueden rellenar o cambiar desde la app.
-- (tratamiento_id, creada_por y todo lo de «completada» quedan fuera.)
grant insert (hogar_id, titulo, descripcion, fecha_limite, responsable_id, categoria, mascota_id)
  on public.tareas to authenticated;
grant update (titulo, descripcion, fecha_limite, responsable_id, categoria, mascota_id)
  on public.tareas to authenticated;
grant delete on public.tareas to authenticated;

create policy "Creo tareas en mi hogar"
  on public.tareas for insert to authenticated
  with check (hogar_id = (select public.mi_hogar_id()) and tratamiento_id is null);

create policy "Edito las tareas a mano de mi hogar"
  on public.tareas for update to authenticated
  using (hogar_id = (select public.mi_hogar_id()) and tratamiento_id is null)
  with check (hogar_id = (select public.mi_hogar_id()) and tratamiento_id is null);

create policy "Borro las tareas a mano de mi hogar"
  on public.tareas for delete to authenticated
  using (hogar_id = (select public.mi_hogar_id()) and tratamiento_id is null);

-- Deshace un «hecho» por error. Solo para tareas a mano: en las de un
-- tratamiento ya se ha calculado la siguiente fecha.
create function public.reabrir_tarea(tarea_id uuid)
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
  if tarea.tratamiento_id is not null then
    raise exception 'Las tareas de un tratamiento no se pueden reabrir: cambia la fecha en el tratamiento.';
  end if;
  if not tarea.completada then
    return;
  end if;

  update public.tareas
  set completada = false, completada_por = null, completada_en = null
  where id = tarea.id;
end;
$$;

revoke execute on function public.reabrir_tarea(uuid) from public, anon;
grant execute on function public.reabrir_tarea(uuid) to authenticated;

commit;
