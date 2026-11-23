import { useState } from 'react'
import {
  activarCalendario,
  cambiarEnlaceCalendario,
  desactivarCalendario,
  enlacesDelCalendario,
  useMiCalendario,
} from '../lib/calendarios'
import { avisoError, botonSecundario } from './estilos'
import { TituloSeccion } from './Piezas'

function haceCuanto(fecha: string): string {
  const minutos = Math.round((Date.now() - new Date(fecha).getTime()) / 60000)
  if (minutos < 2) return 'hace un momento'
  if (minutos < 60) return `hace ${minutos} minutos`
  const horas = Math.round(minutos / 60)
  if (horas < 24) return horas === 1 ? 'hace 1 hora' : `hace ${horas} horas`
  const dias = Math.round(horas / 24)
  return dias === 1 ? 'ayer' : `hace ${dias} días`
}

// En Ajustes: «📅 Calendarios de otras apps». Un interruptor para conectar
// (o no) tus tareas y planes con el calendario del iPhone y Google Calendar.
export function TarjetaCalendarios() {
  const { calendario, error: errorCarga, recargar } = useMiCalendario()
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const activo = Boolean(calendario?.activo)

  async function hacer(accion: () => Promise<void>) {
    setOcupado(true)
    setError(null)
    setCopiado(false)
    try {
      await accion()
      recargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo ha fallado. Prueba otra vez.')
    }
    setOcupado(false)
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
    } catch {
      setError('No se ha podido copiar. Mantén pulsado el enlace para copiarlo.')
    }
  }

  const enlaces = calendario && activo ? enlacesDelCalendario(calendario.token) : null

  return (
    <section className="tarjeta flex flex-col gap-3">
      <TituloSeccion dibujo="📅" titulo="Calendarios de otras apps" subtitulo="iPhone y Google Calendar" color="vencimientos" />

      <p className="text-sm text-stone-600">
        Tus tareas con fecha (las tuyas y las que no son de nadie) y los planes, en el calendario del móvil, con alarma a
        las 8:00. Es una copia de seguridad: aunque fallen los avisos de la app, <strong>el calendario te avisa</strong>.
      </p>

      {errorCarga && <p role="alert" className={avisoError}>{errorCarga}</p>}

      {calendario !== undefined && (
        <button
          type="button"
          role="switch"
          aria-checked={activo}
          disabled={ocupado}
          onClick={() => hacer(activo ? desactivarCalendario : activarCalendario)}
          className="flex items-center justify-between gap-3 rounded-2xl bg-stone-50 px-4 py-3 text-left ring-1 ring-stone-900/5 disabled:opacity-60"
        >
          <span className="font-medium">Conectar con calendarios de otras apps</span>
          <span
            aria-hidden="true"
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${activo ? 'bg-marca' : 'bg-stone-300'}`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${activo ? 'left-6' : 'left-1'}`}
            />
          </span>
        </button>
      )}

      {!activo && calendario && (
        <p className="text-sm text-stone-500">
          Desconectado: si lo tenías añadido, tu calendario se quedará vacío en cuanto se actualice.
        </p>
      )}

      {enlaces && calendario && (
        <>
          <div className="flex flex-col gap-2">
            <a href={enlaces.webcal} className={`${botonSecundario} text-center`}>
              📲 Añadir al calendario del iPhone
            </a>
            <a href={enlaces.google} target="_blank" rel="noopener noreferrer" className={`${botonSecundario} text-center`}>
              🗓️ Añadir a Google Calendar
            </a>
            <button type="button" onClick={() => copiar(enlaces.https)} className="text-sm font-semibold text-marca">
              {copiado ? '✅ Enlace copiado' : '📋 Copiar el enlace'}
            </button>
          </div>

          <details className="rounded-2xl bg-stone-50 p-3 text-sm text-stone-600">
            <summary className="font-semibold text-stone-700">Cómo añadirlo</summary>
            <div className="mt-2 flex flex-col gap-2">
              <p>
                <strong>iPhone:</strong> toca «Añadir al calendario del iPhone» → «Suscribirse». Para que suenen las
                alarmas, comprueba que «Eliminar alertas» está <strong>desactivado</strong> (Ajustes del iPhone →
                Calendario → Cuentas → Calendarios suscritos → Tareas). Ahí también eliges cada cuánto se actualiza.
              </p>
              <p>
                <strong>Google Calendar:</strong> se añade desde un ordenador (la app del móvil no deja): en
                calendar.google.com → «Otros calendarios» → «+» → «Desde URL» → pega el enlace. Google lo actualiza cada
                varias horas y puede que no avise: para las alarmas, mejor el del iPhone.
              </p>
              <p>
                Si ya ves tu Google Calendar en el iPhone, añádelo solo en uno de los dos o te saldrá repetido.
              </p>
            </div>
          </details>

          <p className="text-xs text-stone-500">
            {calendario.ultimo_uso
              ? `Un calendario lo consultó por última vez ${haceCuanto(calendario.ultimo_uso)}.`
              : 'Todavía no lo ha consultado ningún calendario.'}{' '}
            🔒 Quien tenga el enlace verá los títulos y las fechas: no lo compartas.
          </p>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => {
              if (window.confirm('¿Cambiar el enlace? El anterior dejará de funcionar y tendrás que volver a añadirlo a tus calendarios.')) {
                void hacer(cambiarEnlaceCalendario)
              }
            }}
            className="self-start text-sm font-medium text-stone-600 underline"
          >
            🔄 Cambiar el enlace (si lo has compartido sin querer)
          </button>
        </>
      )}

      {error && <p role="alert" className={avisoError}>{error}</p>}
    </section>
  )
}
