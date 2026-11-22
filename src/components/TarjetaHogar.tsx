import { useState } from 'react'
import { mensajeDeError } from '../lib/errores'
import { supabase } from '../lib/supabase'
import type { Hogar } from '../lib/tipos'
import { useMiembros } from '../lib/useMiembros'

type Props = {
  hogar: Hogar
  miUserId: string
  // Se llama cuando sales del hogar, para volver a la pantalla de bienvenida.
  onSalir: () => void
  // Título de la tarjeta (por defecto, el nombre del hogar).
  titulo?: string
}

type Invitacion = {
  codigo: string
  caduca_en: string
}

// Tarjeta con la gente del hogar y el botón para invitar a alguien.
export function TarjetaHogar({ hogar, miUserId, onSalir, titulo }: Props) {
  const { miembros, error: errorMiembros, recargar } = useMiembros()
  const [ocupado, setOcupado] = useState(false)
  const yo = miembros?.find((m) => m.user_id === miUserId)
  const soyAdmin = yo?.rol === 'admin'
  const [invitacion, setInvitacion] = useState<Invitacion | null>(null)
  const [creando, setCreando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function invitar() {
    if (!supabase) return
    setCreando(true)
    setError(null)
    const { data, error } = await supabase.rpc('crear_invitacion')
    setCreando(false)
    if (error) {
      setError(mensajeDeError(error))
      return
    }
    setInvitacion((data as Invitacion[])[0])
  }

  async function compartir(codigo: string) {
    const enlace = `${window.location.origin}/?invitacion=${codigo}`
    const texto = `Te invito a «${hogar.nombre}» en Tareas. Entra con este enlace o usa el código ${codigo}.`
    // En el móvil abre el menú de compartir (WhatsApp, Telegram…).
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Únete a mi hogar en Tareas', text: texto, url: enlace })
        return
      } catch (e) {
        // Si la persona cierra el menú, no hacemos nada más.
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    // Si no se puede compartir, lo copiamos.
    try {
      await navigator.clipboard.writeText(`${texto}\n${enlace}`)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      setError('No se ha podido copiar. Pasa el código a mano.')
    }
  }

  async function anularInvitacion() {
    if (!supabase) return
    setError(null)
    const { error } = await supabase.rpc('anular_invitaciones')
    if (error) {
      setError(mensajeDeError(error))
      return
    }
    setInvitacion(null)
  }

  async function quitar(id: string, nombre: string) {
    if (!supabase) return
    const seguro = window.confirm(
      `¿Quitar a ${nombre} del hogar? Dejará de ver todo lo del hogar y lo que tenía asignado quedará sin responsable.`,
    )
    if (!seguro) return
    setOcupado(true)
    setError(null)
    const { error } = await supabase.rpc('quitar_del_hogar', { miembro_id: id })
    setOcupado(false)
    if (error) {
      setError(mensajeDeError(error))
      return
    }
    recargar()
  }

  async function salirDelHogar() {
    if (!supabase || !miembros) return
    const ultima = miembros.length <= 1
    const seguro = window.confirm(
      ultima
        ? `Eres la última persona de «${hogar.nombre}». Si sales, se borrará el hogar con todas sus mascotas, fotos, tareas y listas. No se puede deshacer. ¿Seguro?`
        : `¿Salir de «${hogar.nombre}»? Dejarás de ver todo lo del hogar. Para volver, necesitarás una invitación nueva.`,
    )
    if (!seguro) return
    setOcupado(true)
    setError(null)
    // Si eres la última, primero borramos las fotos del almacén: la base de
    // datos borra el resto, pero los archivos se quitan desde aquí.
    if (ultima) {
      const { data } = await supabase.storage.from('mascotas').list(hogar.id, { limit: 1000 })
      const rutas = (data ?? []).map((archivo) => `${hogar.id}/${archivo.name}`)
      if (rutas.length > 0) await supabase.storage.from('mascotas').remove(rutas)
    }
    const { error } = await supabase.rpc('salir_del_hogar')
    setOcupado(false)
    if (error) {
      setError(mensajeDeError(error))
      return
    }
    onSalir()
  }

  const caduca = invitacion
    ? new Date(invitacion.caduca_en).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
      })
    : ''

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      {titulo ? (
        <h2 className="font-semibold">{titulo}</h2>
      ) : (
        <>
          <h2 className="text-lg font-semibold">{hogar.nombre}</h2>
          <p className="text-sm text-stone-500">Quién está en este hogar</p>
        </>
      )}

      <ul className="mt-4 flex flex-col gap-3">
        {errorMiembros && (
          <li className="text-sm text-red-700">No se ha podido cargar la gente del hogar.</li>
        )}
        {miembros === null && !errorMiembros && (
          <li className="text-sm text-stone-400">Cargando…</li>
        )}
        {miembros?.map((miembro) => (
          <li key={miembro.id} className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-marca-suave font-semibold text-marca"
            >
              {miembro.nombre_visible.charAt(0).toUpperCase()}
            </span>
            <span className="flex-1 font-medium">
              {miembro.nombre_visible}
              {miembro.user_id === miUserId && (
                <span className="font-normal text-stone-400"> (tú)</span>
              )}
              {miembro.rol === 'admin' && (
                <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-normal text-stone-500">
                  admin
                </span>
              )}
            </span>
            {soyAdmin && miembro.user_id !== miUserId && (
              <button
                type="button"
                onClick={() => quitar(miembro.id, miembro.nombre_visible)}
                disabled={ocupado}
                className="shrink-0 rounded-full px-3 py-1 text-sm text-red-700 ring-1 ring-red-200 disabled:opacity-50"
              >
                Quitar
              </button>
            )}
          </li>
        ))}
      </ul>

      {invitacion ? (
        <div className="mt-5 rounded-xl bg-marca-suave p-4 text-center">
          <p className="text-sm text-stone-700">Código de invitación</p>
          <p className="my-1 font-mono text-3xl font-bold tracking-[0.2em] text-marca">
            {invitacion.codigo}
          </p>
          <p className="text-xs text-stone-600">
            Sirve para una persona y caduca el {caduca}.
          </p>
          <button
            type="button"
            onClick={() => compartir(invitacion.codigo)}
            className="mt-3 w-full rounded-full bg-marca px-5 py-3 font-semibold text-white shadow-sm active:scale-[0.98]"
          >
            {copiado ? '¡Copiado!' : 'Compartir invitación'}
          </button>
          <button
            type="button"
            onClick={anularInvitacion}
            className="mt-2 text-sm text-stone-600 underline"
          >
            Anular invitación
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={invitar}
          disabled={creando}
          className="mt-5 w-full rounded-full px-5 py-3 font-semibold text-marca ring-1 ring-marca transition active:scale-[0.98] disabled:opacity-60"
        >
          {creando ? 'Creando invitación…' : '+ Invitar a alguien'}
        </button>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {miembros && (
        <button
          type="button"
          onClick={salirDelHogar}
          disabled={ocupado}
          className="mt-4 w-full py-2 text-sm font-medium text-red-700 disabled:opacity-50"
        >
          Salir del hogar
        </button>
      )}
    </section>
  )
}
