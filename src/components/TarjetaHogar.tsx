import { useEffect, useState } from 'react'
import { mensajeDeError } from '../lib/errores'
import { supabase } from '../lib/supabase'
import type { Hogar, Miembro } from '../lib/tipos'

type Props = {
  hogar: Hogar
  miUserId: string
}

type Invitacion = {
  codigo: string
  caduca_en: string
}

// Tarjeta con la gente del hogar y el botón para invitar a alguien.
export function TarjetaHogar({ hogar, miUserId }: Props) {
  const [miembros, setMiembros] = useState<Miembro[] | null>(null)
  const [invitacion, setInvitacion] = useState<Invitacion | null>(null)
  const [creando, setCreando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    // Gracias a RLS, esto solo devuelve la gente de MI hogar.
    supabase
      .from('miembros')
      .select('id, user_id, nombre_visible, rol')
      .order('creado_en')
      .then(({ data, error }) => {
        if (error) setError(mensajeDeError(error))
        else setMiembros(data as Miembro[])
      })
  }, [hogar.id])

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

  const caduca = invitacion
    ? new Date(invitacion.caduca_en).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
      })
    : ''

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{hogar.nombre}</h2>
      <p className="text-sm text-stone-500">Quién está en este hogar</p>

      <ul className="mt-4 flex flex-col gap-3">
        {miembros === null && !error && (
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
            <span className="font-medium">
              {miembro.nombre_visible}
              {miembro.user_id === miUserId && (
                <span className="font-normal text-stone-400"> (tú)</span>
              )}
            </span>
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
    </section>
  )
}
