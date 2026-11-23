import type { ReactNode } from 'react'
import { COLOR_CATEGORIA, SUAVE } from '../lib/colores'
import { cuandoToca, diasHasta } from '../lib/fechas'
import { ir } from '../lib/ruta'
import { infoCategoria, rutaDeOrigen, type Tarea } from '../lib/tipos'
import { Avatar, Etiqueta } from './Piezas'

type Props = {
  tarea: Tarea
  // «Tú», «Bea» o null (sin responsable).
  nombreResponsable: string | null
  // Su nombre de verdad, para la inicial del círculo.
  nombreReal?: string | null
  // «✈️ Bea está de viaje: la cubres tú», «🏠 nadie en casa»…
  notaViaje?: string | null
  nombreMascota: string | null
  nombreQuienLaHizo?: string | null
  // Otro icono en vez del de la categoría (el calendario usa uno por tipo).
  dibujo?: string
  onPulsarCirculo?: () => void
  onReabrir?: () => void
  children?: ReactNode
}

// Color de la etiqueta de la fecha: rojo si va atrasada, ámbar si es pronto.
function colorDeFecha(fecha: string): string {
  const dias = diasHasta(fecha)
  if (dias < 0) return 'bg-red-50 text-red-700'
  if (dias <= 7) return 'bg-amber-50 text-amber-800'
  return 'bg-stone-100 text-stone-600'
}

// Una tarea dentro de una lista: círculo para marcarla, título y etiquetas.
export function FilaTarea({
  tarea,
  nombreResponsable,
  nombreReal,
  notaViaje,
  nombreMascota,
  nombreQuienLaHizo,
  dibujo,
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
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-marca text-sm font-bold text-white"
          >
            ✓
          </span>
        ) : (
          <button
            type="button"
            onClick={onPulsarCirculo}
            aria-label={`Marcar «${tarea.titulo}» como hecha`}
            className="mt-0.5 h-7 w-7 shrink-0 rounded-full border-2 border-stone-300 bg-white transition active:scale-90 active:border-marca active:bg-marca-suave"
          />
        )}

        <button type="button" onClick={editar} className="min-w-0 flex-1 text-left">
          <span className={`block leading-snug font-medium ${tarea.completada ? 'text-stone-500 line-through' : ''}`}>
            {tarea.titulo}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {tarea.completada && tarea.completada_en ? (
              <Etiqueta className="bg-marca-suave text-marca">
                Hecha{nombreQuienLaHizo && ` por ${nombreQuienLaHizo}`} el{' '}
                {new Date(tarea.completada_en).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
              </Etiqueta>
            ) : (
              tarea.fecha_limite && (
                <Etiqueta className={colorDeFecha(tarea.fecha_limite)}>{cuandoToca(tarea.fecha_limite)}</Etiqueta>
              )
            )}
            <Etiqueta className={SUAVE[COLOR_CATEGORIA[tarea.categoria] ?? 'ajustes']}>
              <span aria-hidden="true">{dibujo ?? categoria.dibujo}</span> {nombreMascota ?? categoria.texto}
            </Etiqueta>
            {!tarea.completada &&
              (nombreResponsable ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-stone-600">
                  <Avatar id={tarea.responsable_id} nombre={nombreReal ?? nombreResponsable} pequeno />
                  {nombreResponsable}
                </span>
              ) : (
                <span className="text-xs text-stone-500">Sin responsable</span>
              ))}
          </span>
          {!tarea.completada && notaViaje && (
            <span className="mt-1 block text-xs font-medium text-vencimientos-tinta">{notaViaje}</span>
          )}
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
