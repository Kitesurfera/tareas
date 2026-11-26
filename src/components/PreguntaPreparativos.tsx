import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { leerFecha } from '../lib/fechas'
import type { PlanProgramado } from '../lib/planes'
import { elegirPlantillaDelPlan, esPlanConMiga, plantillaDelPlan, usePlantillas } from '../lib/plantillas'
import { ir } from '../lib/ruta'
import { avisoError, botonPrincipal, botonSecundario } from './estilos'

// Al programar un plan «con miga» (de un día o más, con mucha energía, con
// plantilla o con un nombre como «Barbacoa…»), pregunta si preparamos sus
// tareas con una plantilla. Escucha el evento «plan-programado» (lo manda
// programar() en src/lib/planes.ts) y también «preparar-plan» (el botón
// «📋 Preparar» del calendario de planes, que pregunta siempre).
export function PreguntaPreparativos() {
  const [pendiente, setPendiente] = useState<PlanProgramado | null>(null)
  const { datos, error } = usePlantillas()

  useEffect(() => {
    const alProgramar = (e: Event) => {
      const detalle = (e as CustomEvent<PlanProgramado>).detail
      if (detalle && esPlanConMiga(detalle.plan)) setPendiente(detalle)
    }
    const alPreparar = (e: Event) => {
      const detalle = (e as CustomEvent<PlanProgramado>).detail
      if (detalle) setPendiente(detalle)
    }
    window.addEventListener('plan-programado', alProgramar)
    window.addEventListener('preparar-plan', alPreparar)
    return () => {
      window.removeEventListener('plan-programado', alProgramar)
      window.removeEventListener('preparar-plan', alPreparar)
    }
  }, [])

  // Si ya tiene preparativos (por ejemplo, desde otro móvil), no se pregunta.
  const yaTiene = pendiente && datos?.preparativos.some((p) => p.agenda_plan_id === pendiente.agendaId)
  // Sin el SQL de las plantillas (error), no se pregunta.
  if (!pendiente || !datos || error || yaTiene) return null
  return createPortal(<Hoja pendiente={pendiente} plantilla={plantillaDelPlan(pendiente.plan, datos.vuestras)} onCerrar={() => setPendiente(null)} />, document.body)
}

function Hoja({ pendiente, plantilla, onCerrar }: { pendiente: PlanProgramado; plantilla: ReturnType<typeof plantillaDelPlan>; onCerrar: () => void }) {
  const [noPreguntar, setNoPreguntar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { plan, agendaId, fecha } = pendiente
  const dia = leerFecha(fecha).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  const irA = (ruta: string) => {
    onCerrar()
    ir(ruta)
  }

  async function ahoraNo() {
    if (noPreguntar) {
      const fallo = await elegirPlantillaDelPlan(plan.id, null, true)
      if (fallo) return setError(fallo)
    }
    onCerrar()
  }

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar])

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-stone-900/40 backdrop-blur-[2px] md:items-center md:p-6" onClick={onCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-preparar"
        className="flex max-h-[92svh] w-full max-w-lg animate-aparecer flex-col gap-4 overflow-y-auto rounded-t-[2rem] bg-crema p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl md:rounded-[2rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 id="titulo-preparar" className="text-xl font-extrabold text-tareas-tinta">
            📋 ¿Preparamos «{plan.nombre}»?
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            Es el <span className="font-semibold">{dia}</span>. Con una plantilla se crean de un toque las tareas de antes y de después (comprar,
            reservar, avisar…), cada una con su fecha. Si cambiáis el día del plan, se mueven solas.
          </p>
        </div>

        {plantilla && (
          <button type="button" onClick={() => irA(`/plantillas/usar/${plantilla.clave}/plan/${agendaId}`)} className={botonPrincipal}>
            {plantilla.dibujo} Usar «{plantilla.nombre}» ({plantilla.tareas.length} tareas)
          </button>
        )}
        <button type="button" onClick={() => irA(`/plantillas/elegir/plan/${agendaId}`)} className={plantilla ? botonSecundario : botonPrincipal}>
          📋 {plantilla ? 'Elegir otra plantilla' : 'Elegir una plantilla'}
        </button>
        <button type="button" onClick={() => irA(`/plantillas/ia/plan/${agendaId}`)} className={botonSecundario}>
          ✨ Que la IA me haga una
        </button>

        <label className="flex items-center gap-3 text-sm text-stone-600">
          <input type="checkbox" className="h-5 w-5 accent-marca" checked={noPreguntar} onChange={(e) => setNoPreguntar(e.target.checked)} />
          No volver a preguntar para este plan
        </label>
        {error && <p role="alert" className={avisoError}>{error}</p>}
        <button type="button" onClick={ahoraNo} className="self-center px-4 py-2 text-sm font-semibold text-stone-500">
          Ahora no
        </button>
      </div>
    </div>
  )
}
