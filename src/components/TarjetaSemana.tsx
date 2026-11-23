import { hoyComoTexto, sumarDias } from '../lib/fechas'
import { ir } from '../lib/ruta'
import { nombreDeLaSemana, semanaInicial } from '../lib/semana'
import { diaMes } from '../lib/viajes'

// En el inicio: el acceso a «📆 La semana» (la que viene, si hoy es domingo).
export function TarjetaSemana() {
  const hoy = hoyComoTexto()
  const lunes = semanaInicial(hoy)
  return (
    <button
      type="button"
      onClick={() => ir('/semana')}
      className="tarjeta flex items-center gap-3 text-left"
    >
      <span
        aria-hidden="true"
        className="flex h-11 w-11 shrink-0 -rotate-6 items-center justify-center rounded-2xl bg-inicio text-2xl text-inicio-tinta"
      >
        📆
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg leading-tight font-bold">{nombreDeLaSemana(lunes, hoy)}</span>
        <span className="block text-sm text-stone-500">
          Del {diaMes(lunes)} al {diaMes(sumarDias(lunes, 6))}, día a día: tareas, turnos, planes y cobros
        </span>
      </span>
      <span aria-hidden="true" className="text-2xl text-marca">
        ›
      </span>
    </button>
  )
}
