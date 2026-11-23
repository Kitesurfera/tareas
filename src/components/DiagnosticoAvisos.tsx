import { useState } from 'react'
import { estadoDelAvisoDiario, type EstadoAvisoDiario } from '../lib/avisos'
import { diasHasta, fechaCorta } from '../lib/fechas'
import { avisoError } from './estilos'

// «🩺 Comprobar el aviso de las 8:00»: explica por qué te llega (o no) el
// aviso de cada mañana, sin tener que mirar nada en Vercel.
export function DiagnosticoAvisos() {
  const [estado, setEstado] = useState<EstadoAvisoDiario | null>(null)
  const [comprobando, setComprobando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function comprobar() {
    setComprobando(true)
    setError(null)
    try {
      setEstado(await estadoDelAvisoDiario())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido comprobar.')
    }
    setComprobando(false)
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={comprobar}
        disabled={comprobando}
        className="w-full rounded-full px-3 py-2.5 text-sm font-semibold text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50 disabled:opacity-60"
      >
        {comprobando ? 'Comprobando…' : '🩺 Comprobar el aviso de las 8:00'}
      </button>
      {error && <p role="alert" className={`mt-3 ${avisoError}`}>{error}</p>}
      {estado && <Resultado estado={estado} />}
    </div>
  )
}

function cuandoFue(fecha: string): string {
  const dias = -diasHasta(fecha)
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'ayer'
  return `el ${fechaCorta(fecha)}`
}

function Resultado({ estado }: { estado: EstadoAvisoDiario }) {
  const yaHoy = estado.ultimoAviso === estado.hoy
  const pasadoLaHora = estado.horaEnEspana >= 10
  const lineas: { icono: string; texto: string; aviso?: boolean }[] = []

  if (!estado.claveDelServidor) {
    lineas.push(
      estado.entorno === 'production'
        ? {
            icono: '❌',
            texto:
              'Falta la clave CRON_SECRET en Vercel. Sin ella, el aviso de las 8:00 no sale nunca (el de prueba sí). Añádela en Vercel → Settings → Environment Variables (marcando Production) y vuelve a publicar la app.',
            aviso: true,
          }
        : {
            icono: 'ℹ️',
            texto: 'Esta es una versión de prueba: el aviso de las 8:00 solo sale desde la app de verdad. Compruébalo allí.',
          },
    )
  } else {
    lineas.push({ icono: '✅', texto: 'El servidor tiene su clave para mandar el aviso diario.' })
  }

  if (estado.moviles === 0) {
    lineas.push({ icono: '📵', texto: 'No hay ningún móvil con avisos guardado en tu cuenta. Desactiva y vuelve a activar los avisos.', aviso: true })
  } else {
    lineas.push({
      icono: '📬',
      texto: estado.ultimoAviso
        ? `Tu último aviso de las 8:00 se mandó ${cuandoFue(estado.ultimoAviso)}.`
        : 'Todavía no se te ha mandado ningún aviso de las 8:00.',
    })
  }

  if (yaHoy) {
    lineas.push({ icono: '👍', texto: 'Hoy ya se te mandó. Si no lo viste, mira el centro de notificaciones del móvil.' })
  } else if (estado.pendientesHoy === 0) {
    lineas.push({
      icono: '😌',
      texto: 'Hoy no tienes nada pendiente (ni para hoy ni atrasado): por eso no hay aviso. Solo llega cuando hay algo que hacer.',
    })
  } else if (estado.pendientesHoy !== null) {
    const cosas = estado.pendientesHoy === 1 ? '1 cosa pendiente' : `${estado.pendientesHoy} cosas pendientes`
    lineas.push(
      pasadoLaHora && estado.claveDelServidor && estado.entorno === 'production'
        ? {
            icono: '⚠️',
            texto: `Hoy tienes ${cosas} y el aviso no ha salido. Puede que Vercel no haya llamado esta mañana (no siempre es puntual y no reintenta): mira Vercel → Schedules → Cron Jobs → View Logs.`,
            aviso: true,
          }
        : { icono: '⏰', texto: `Hoy tienes ${cosas}: el aviso sale entre las 8 y las 9 de la mañana.` },
    )
  }

  return (
    <ul role="status" className="mt-3 flex flex-col gap-2 rounded-2xl bg-stone-50 p-3 text-sm text-stone-700">
      {lineas.map((l) => (
        <li key={l.texto} className={`flex gap-2 ${l.aviso ? 'font-medium text-red-800' : ''}`}>
          <span aria-hidden="true">{l.icono}</span>
          <span>{l.texto}</span>
        </li>
      ))}
    </ul>
  )
}
