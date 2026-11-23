import { ir } from '../lib/ruta'
import type { Prevista } from '../lib/semana'
import { rutaDeOrigen } from '../lib/tipos'
import type { Nombres } from '../lib/useNombres'
import { Avatar, Etiqueta } from './Piezas'

// «🔁 Sacar la basura · le tocaría a Bea»: la siguiente vez de algo que se
// repite (todavía no es una tarea: no se puede marcar).
export function FilaPrevista({ prevista, nombres, dibujo }: { prevista: Prevista; nombres: Nombres; dibujo?: string }) {
  const quien = nombres.encargada(prevista.responsableId, prevista.fecha)
  const destino = rutaDeOrigen(prevista.tarea)
  return (
    <li className="py-2.5">
      <button
        type="button"
        onClick={() => destino && ir(destino)}
        className="flex w-full items-start gap-3 text-left"
      >
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-stone-300 text-xs"
        >
          🔁
        </span>
        <span className="min-w-0 flex-1">
          <span className="block leading-snug font-medium text-stone-700">{prevista.tarea.titulo}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <Etiqueta className="bg-stone-100 text-stone-600">
              {dibujo && <span aria-hidden="true">{dibujo}</span>} Se repite
            </Etiqueta>
            {quien && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-stone-600">
                <Avatar id={prevista.responsableId} nombre={nombres.nombreDe(prevista.responsableId) ?? quien} pequeno />
                {prevista.turno ? `Le tocaría a ${quien === 'Tú' ? 'ti' : quien}` : quien}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  )
}
