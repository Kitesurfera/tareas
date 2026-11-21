import type { ReactNode } from 'react'
import { cuandoToca, diasHasta } from '../lib/fechas'
import { ir } from '../lib/ruta'
import { infoCategoria, rutaDeOrigen, type Tarea } from '../lib/tipos'

type Props = {
  tarea: Tarea
  nombreResponsable: string | null
  nombreMascota: string | null
  nombreQuienLaHizo?: string | null
  onPulsarCirculo?: () => void
  onReabrir?: () => void
  children?: ReactNode
}

function colorDeFecha(fecha: string): string {
  const dias = diasHasta(fecha)
  if (dias < 0) return 'text-red-700'
  if (dias <= 7) return 'text-amber-700'
  return 'text-stone-500'
}

// Una tarea dentro de una lista: círculo para marcarla, título y detalles.
export function FilaTarea({
  tarea,
  nombreResponsable,
  nombreMascota,
  nombreQuienLaHizo,
  onPulsarCirculo,
  onReabrir,
  children,
}: Props) {
  const categoria = infoCategoria(tarea.categoria)
  // Las tareas automáticas se editan desde su origen.
  const editar = () => ir(rutaDeOrigen(tarea) ?? `/tareas/${tarea.id}/editar`)

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        {tarea.completada ? (
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-marca text-sm text-white"
          >
            ✓
          </span>
        ) : (
          <button
            type="button"
            onClick={onPulsarCirculo}
            aria-label={`Marcar «${tarea.titulo}» como hecha`}
            className="mt-0.5 h-6 w-6 shrink-0 rounded-full ring-2 ring-stone-300 transition active:bg-marca-suave"
          />
        )}

        <button type="button" onClick={editar} className="flex-1 text-left">
          <span className={`block font-medium ${tarea.completada ? 'text-stone-500 line-through' : ''}`}>
            {tarea.titulo}
          </span>
          <span className="mt-0.5 flex flex-wrap gap-x-2 text-sm text-stone-500">
            {tarea.completada && tarea.completada_en ? (
              <span>
                Hecha
                {nombreQuienLaHizo && ` por ${nombreQuienLaHizo}`} el{' '}
                {new Date(tarea.completada_en).toLocaleDateString('es-ES', {
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
            ) : (
              tarea.fecha_limite && (
                <span className={`font-medium ${colorDeFecha(tarea.fecha_limite)}`}>
                  {cuandoToca(tarea.fecha_limite)}
                </span>
              )
            )}
            {!tarea.completada && <span>{nombreResponsable ?? 'Sin responsable'}</span>}
            <span>
              {categoria.dibujo} {nombreMascota ?? categoria.texto}
            </span>
          </span>
        </button>

        {onReabrir && (
          <button
            type="button"
            onClick={onReabrir}
            className="shrink-0 rounded-full px-3 py-1 text-sm text-stone-500 ring-1 ring-stone-300"
          >
            Reabrir
          </button>
        )}
      </div>
      {children}
    </li>
  )
}
