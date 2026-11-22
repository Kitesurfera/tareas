import type { AccionesTarea } from '../lib/useAccionesTarea'
import type { Nombres } from '../lib/useNombres'
import { esAutomatica, type Tarea } from '../lib/tipos'
import { ConfirmarHecho } from './ConfirmarHecho'
import { FilaTarea } from './FilaTarea'

type Props = {
  tareas: Tarea[]
  acciones: AccionesTarea
  nombres: Nombres
}

// Lista de tareas con su círculo para marcarlas como hechas.
export function ListaTareas({ tareas, acciones, nombres }: Props) {
  return (
    <ul className="divide-y divide-stone-100">
      {tareas.map((tarea) => (
        <FilaTarea
          key={tarea.id}
          tarea={tarea}
          nombreResponsable={nombres.encargada(tarea.responsable_id, tarea.fecha_limite)}
          nombreMascota={nombres.mascota(tarea.mascota_id)}
          nombreQuienLaHizo={nombres.porUsuario(tarea.completada_por)}
          onPulsarCirculo={() => acciones.pulsarCirculo(tarea)}
          onReabrir={
            tarea.completada && !esAutomatica(tarea) ? () => acciones.reabrir(tarea) : undefined
          }
        >
          {acciones.marcando === tarea.id && (
            <ConfirmarHecho
              enviando={acciones.enviando}
              onConfirmar={(fecha) => acciones.completar(tarea, fecha)}
              onCancelar={acciones.cancelarMarcado}
            />
          )}
        </FilaTarea>
      ))}
    </ul>
  )
}

// Aviso «¡Hecho!» con botón de deshacer (solo en tareas a mano).
export function AvisoRecienHecha({ acciones }: { acciones: AccionesTarea }) {
  const tarea = acciones.recienHecha
  if (!tarea) return null
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 rounded-xl bg-marca-suave p-3 text-sm text-marca"
    >
      <span>¡Hecho! «{tarea.titulo}»</span>
      {!esAutomatica(tarea) && (
        <button
          type="button"
          onClick={() => acciones.reabrir(tarea)}
          className="shrink-0 font-semibold underline"
        >
          Deshacer
        </button>
      )}
    </div>
  )
}
