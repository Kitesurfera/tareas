import { fechaCorta, hoyComoTexto } from '../lib/fechas'
import { GRUPOS, SUGERIDAS, enMarcha, sufijoPlan, textoDias, usePlanDeAgenda, usePlantillas, type Plantilla, type Preparativo } from '../lib/plantillas'
import { ir, volver } from '../lib/ruta'
import { avisoError } from './estilos'

// #/plantillas y #/plantillas/elegir/plan/<id> (elegir una para un plan del
// calendario): lo que está en marcha, crear una (a mano o con la IA) y
// todas las plantillas, las vuestras y las sugeridas por grupos.
export function PantallaPlantillas({ agendaId = null }: { agendaId?: string | null }) {
  const { datos, error } = usePlantillas()
  const delPlan = usePlanDeAgenda(agendaId)
  const conPlan = sufijoPlan(agendaId)
  const enCurso = (datos?.preparativos ?? []).filter(enMarcha)
  const terminados = (datos?.preparativos ?? []).filter((p) => p.total > 0 && !enMarcha(p)).slice(-5).reverse()
  const todas = [...(datos?.vuestras ?? []), ...SUGERIDAS]

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-6xl lg:px-10 lg:py-10">
      <button type="button" onClick={() => volver(agendaId ? '/planes' : '/tareas')} className="self-start text-sm font-medium text-marca">
        ← {agendaId ? 'Planes' : 'Tareas'}
      </button>
      <div>
        <h1 className="text-2xl font-extrabold text-tareas-tinta lg:text-3xl">📋 {agendaId ? 'Elige una plantilla' : 'Plantillas'}</h1>
        <p className="mt-1 text-stone-600">
          {agendaId && delPlan
            ? `Para preparar «${delPlan.plan.nombre}» (${fechaCorta(delPlan.fecha)}).`
            : 'Lo que se repite en la vida (una mudanza, un viaje, una fiesta…): eliges una, dices la fecha y se crean todas las tareas.'}
        </p>
      </div>

      {error && <p role="alert" className={avisoError}>{error}</p>}
      {datos === null && !error && <p className="text-center text-stone-400">Cargando…</p>}

      {!agendaId && enCurso.length > 0 && (
        <section aria-labelledby="titulo-en-marcha" className="tarjeta flex flex-col gap-3">
          <h2 id="titulo-en-marcha" className="text-lg font-bold">🚀 En marcha</h2>
          <ul className="flex flex-col gap-2">
            {enCurso.map((p) => (
              <li key={p.id}>
                <FilaPreparativo p={p} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <button type="button" onClick={() => ir(`/plantillas/ia${conPlan}`)} className="tarjeta flex items-center gap-3 text-left ring-2 ring-tareas transition hover:brightness-[0.99]">
          <span aria-hidden="true" className="text-2xl">✨</span>
          <span>
            <span className="block font-bold">Hazme una con la IA</span>
            <span className="block text-sm text-stone-600">«La boda de mi hermana», «escapada con la perra»…</span>
          </span>
        </button>
        <button type="button" onClick={() => ir('/plantillas/nueva')} className="tarjeta flex items-center gap-3 text-left transition hover:brightness-[0.99]">
          <span aria-hidden="true" className="text-2xl">➕</span>
          <span>
            <span className="block font-bold">Crear la vuestra</span>
            <span className="block text-sm text-stone-600">Con vuestras tareas y vuestros tiempos</span>
          </span>
        </button>
      </div>

      {datos &&
        GRUPOS.map((g) => {
          const delGrupo = todas.filter((p) => p.grupo === g.id)
          if (delGrupo.length === 0) return null
          return (
            <section key={g.id} aria-labelledby={`grupo-${g.id}`} className="flex flex-col gap-2">
              <h2 id={`grupo-${g.id}`} className="text-base font-bold text-stone-700">{g.titulo}</h2>
              <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                {delGrupo.map((p) => (
                  <li key={p.clave}>
                    <TarjetaPlantilla p={p} onUsar={() => ir(`/plantillas/usar/${p.clave}${conPlan}`)} />
                  </li>
                ))}
              </ul>
            </section>
          )
        })}

      {!agendaId && terminados.length > 0 && (
        <details className="tarjeta">
          <summary className="cursor-pointer font-semibold text-stone-600">✅ Terminados ({terminados.length})</summary>
          <ul className="mt-3 flex flex-col gap-2">
            {terminados.map((p) => (
              <li key={p.id}>
                <FilaPreparativo p={p} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </main>
  )
}

function TarjetaPlantilla({ p, onUsar }: { p: Plantilla; onUsar: () => void }) {
  const primera = Math.min(...p.tareas.map((t) => t.dias))
  return (
    <button type="button" onClick={onUsar} className="tarjeta flex h-full w-full items-center gap-3 text-left transition hover:brightness-[0.99] active:scale-[0.99]">
      <span aria-hidden="true" className="flex h-11 w-11 shrink-0 -rotate-6 items-center justify-center rounded-2xl bg-tareas text-2xl">
        {p.dibujo}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{p.nombre}</span>
        <span className="block text-sm text-stone-600">
          {p.tareas.length === 1 ? '1 tarea' : `${p.tareas.length} tareas`}
          {primera < 0 ? ` · desde ${textoDias(primera)}` : ''}
        </span>
      </span>
      <span aria-hidden="true" className="text-xl text-stone-400">›</span>
    </button>
  )
}

// Una barrita de progreso: «4 de 12 hechas».
export function BarraProgreso({ hechas, total, etiqueta }: { hechas: number; total: number; etiqueta: string }) {
  const porcentaje = total === 0 ? 0 : Math.round((hechas / total) * 100)
  return (
    <div role="progressbar" aria-label={etiqueta} aria-valuemin={0} aria-valuemax={total} aria-valuenow={hechas} aria-valuetext={`${hechas} de ${total} hechas`} className="h-2 w-full overflow-hidden rounded-full bg-stone-200">
      <div className="h-full rounded-full bg-marca transition-all" style={{ width: `${porcentaje}%` }} />
    </div>
  )
}

export function FilaPreparativo({ p }: { p: Preparativo }) {
  const hoy = hoyComoTexto()
  return (
    <button type="button" onClick={() => ir(`/preparativos/${p.id}`)} className="flex w-full items-center gap-3 rounded-2xl bg-stone-50 p-3 text-left transition hover:bg-stone-100">
      <span aria-hidden="true" className="text-2xl">{p.dibujo}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-semibold">{p.nombre}</span>
          <span className="shrink-0 text-xs text-stone-500">{p.fecha < hoy ? fechaCorta(p.fecha) : `${fechaCorta(p.fecha)}`}</span>
        </span>
        <BarraProgreso hechas={p.hechas} total={p.total} etiqueta={`Progreso de ${p.nombre}`} />
        <span className="text-xs text-stone-500">
          {p.hechas === p.total ? '🎉 ¡Todo listo!' : `${p.hechas} de ${p.total} hechas`}
        </span>
      </span>
    </button>
  )
}

// En la pestaña Tareas: el acceso a «📋 Plantillas» y lo que está en marcha.
export function TarjetaPlantillas() {
  const { datos } = usePlantillas()
  const enCurso = (datos?.preparativos ?? []).filter(enMarcha).slice(0, 3)
  return (
    <section className="tarjeta flex flex-col gap-3" aria-label="Plantillas">
      <button type="button" onClick={() => ir('/plantillas')} className="flex items-center gap-3 text-left">
        <span aria-hidden="true" className="flex h-11 w-11 shrink-0 -rotate-6 items-center justify-center rounded-2xl bg-tareas text-2xl">
          📋
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">Plantillas</span>
          <span className="block truncate text-sm text-stone-600">
            {enCurso.length > 0 ? `${enCurso.length === 1 ? '1 en marcha' : `${enCurso.length} en marcha`} · mudanza, viajes, fiestas…` : 'Mudanza, viajes, fiestas, barbacoas… de un toque'}
          </span>
        </span>
        <span aria-hidden="true" className="text-xl text-stone-400">›</span>
      </button>
      {enCurso.length > 0 && (
        <ul className="flex flex-col gap-2">
          {enCurso.map((p) => (
            <li key={p.id}>
              <FilaPreparativo p={p} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
