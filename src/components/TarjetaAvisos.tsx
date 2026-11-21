import { useEffect, useState } from 'react'
import {
  activarAvisos,
  avisosConfigurados,
  avisosSoportados,
  comprobarAvisos,
  desactivarAvisos,
  probarAviso,
} from '../lib/avisos'
import { abiertaComoApp, esIOS } from '../lib/instalar'
import { avisoError } from './estilos'

type Estado = 'comprobando' | 'apagados' | 'activados' | 'bloqueados'

// Tarjeta del inicio para activar los avisos diarios en este móvil.
export function TarjetaAvisos() {
  const soportados = avisosSoportados()
  const [estado, setEstado] = useState<Estado>(
    soportados && Notification.permission === 'denied' ? 'bloqueados' : 'comprobando',
  )
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!soportados || !avisosConfigurados() || Notification.permission === 'denied') return
    let vigente = true
    comprobarAvisos()
      .then((activos) => vigente && setEstado(activos ? 'activados' : 'apagados'))
      .catch(() => vigente && setEstado('apagados'))
    return () => {
      vigente = false
    }
  }, [soportados])

  // Si aún no están preparadas las claves en Vercel, no enseñamos nada.
  if (!avisosConfigurados()) return null

  // iPhone sin instalar: Apple solo permite avisos en la app instalada.
  if (!soportados) {
    if (!esIOS() || abiertaComoApp()) return null
    return (
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="font-semibold">🔔 Avisos en el iPhone</h2>
        <p className="mt-1 text-sm text-stone-600">
          Para recibir avisos, primero instala la app (Compartir → «Añadir a
          pantalla de inicio») y ábrela desde su icono.
        </p>
      </section>
    )
  }

  async function hacer(accion: () => Promise<void>) {
    setOcupado(true)
    setError(null)
    setMensaje(null)
    try {
      await accion()
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Algo ha fallado. Inténtalo de nuevo.')
    } finally {
      setOcupado(false)
    }
  }

  const activar = () =>
    hacer(async () => {
      const resultado = await activarAvisos()
      setEstado(resultado === 'activados' ? 'activados' : 'bloqueados')
    })
  const desactivar = () =>
    hacer(async () => {
      await desactivarAvisos()
      setEstado('apagados')
    })
  const probar = () =>
    hacer(async () => {
      const enviados = await probarAviso()
      setMensaje(
        enviados > 0
          ? 'Aviso enviado. Debería llegarte en unos segundos.'
          : 'No hay ningún móvil con avisos activados en tu cuenta.',
      )
    })

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="font-semibold">🔔 Avisos</h2>

      {estado === 'comprobando' && <p className="mt-1 text-sm text-stone-400">Comprobando…</p>}

      {estado === 'apagados' && (
        <>
          <p className="mt-1 text-sm text-stone-600">
            Cada mañana a las 8:00, un aviso con lo que te toca hoy y lo que va
            atrasado.
          </p>
          <button
            type="button"
            onClick={activar}
            disabled={ocupado}
            className="mt-3 w-full rounded-full bg-marca px-5 py-3 font-semibold text-white shadow-sm active:scale-[0.98] disabled:opacity-60"
          >
            {ocupado ? 'Activando…' : 'Activar avisos'}
          </button>
        </>
      )}

      {estado === 'activados' && (
        <>
          <p className="mt-1 text-sm text-stone-600">
            Activados en este móvil. Cada mañana a las 8:00 te diremos lo que te toca.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={probar}
              disabled={ocupado}
              className="rounded-full px-3 py-2.5 text-sm font-semibold text-marca ring-1 ring-marca disabled:opacity-60"
            >
              Probar aviso
            </button>
            <button
              type="button"
              onClick={desactivar}
              disabled={ocupado}
              className="rounded-full px-3 py-2.5 text-sm font-medium text-stone-600 ring-1 ring-stone-300 disabled:opacity-60"
            >
              Desactivar
            </button>
          </div>
        </>
      )}

      {estado === 'bloqueados' && (
        <p className="mt-1 text-sm text-stone-600">
          Los avisos de Tareas están bloqueados en este móvil. Para activarlos,
          ve a los ajustes del móvil → Notificaciones → Tareas (o a los permisos
          del navegador).
        </p>
      )}

      {mensaje && <p role="status" className="mt-3 rounded-xl bg-marca-suave p-3 text-sm text-marca">{mensaje}</p>}
      {error && <p role="alert" className={`mt-3 ${avisoError}`}>{error}</p>}
    </section>
  )
}
