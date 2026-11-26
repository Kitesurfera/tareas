import { useState } from 'react'
import { fechaCorta, hoyComoTexto } from '../lib/fechas'
import {
  buscarPlantilla,
  crearPreparativos,
  elegirPlantillaDelPlan,
  fechaDeTarea,
  proximaFechaFija,
  repartirAMedias,
  sufijoPlan,
  textoDias,
  usePlanDeAgenda,
  usePlantillas,
  type Plantilla,
} from '../lib/plantillas'
import { ir, reemplazar, volver } from '../lib/ruta'
import { infoCategoria, type Miembro } from '../lib/tipos'
import { useMiembros } from '../lib/useMiembros'
import { avisoError, botonPrincipal, campo } from './estilos'

type Props = { clave: string; agendaId: string | null; miUserId: string }

// #/plantillas/usar/<clave>[/plan/<id>]: eliges la fecha, ves cuándo toca
// cada cosa, quitas lo que no necesitáis, repartes y se crean las tareas.
export function PantallaUsarPlantilla({ clave, agendaId, miUserId }: Props) {
  const { datos, error } = usePlantillas()
  const { miembros } = useMiembros()
  const delPlan = usePlanDeAgenda(agendaId)
  const plantilla = datos ? buscarPlantilla(clave, datos.vuestras) : null

  if (error && !plantilla) return <Mensaje>{error}</Mensaje>
  if (!datos || miembros === null || delPlan === undefined) return <Mensaje>Cargando…</Mensaje>
  if (!plantilla) return <Mensaje>No encontramos esta plantilla.</Mensaje>
  if (agendaId && !delPlan) return <Mensaje>Ese plan ya no está en el calendario.</Mensaje>
  return <Formulario key={clave} plantilla={plantilla} miembros={miembros} miUserId={miUserId} delPlan={delPlan} agendaId={agendaId} />
}

function Mensaje({ children }: { children: string }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md items-center justify-center px-5 text-center text-stone-500 md:max-w-2xl">
      <p>{children}</p>
    </main>
  )
}

type Fila = { incluida: boolean; responsable: string | null }

function Formulario({
  plantilla,
  miembros,
  miUserId,
  delPlan,
  agendaId,
}: {
  plantilla: Plantilla
  miembros: Miembro[]
  miUserId: string
  delPlan: ReturnType<typeof usePlanDeAgenda>
  agendaId: string | null
}) {
  const hoy = hoyComoTexto()
  const yo = miembros.find((m) => m.user_id === miUserId)?.id ?? null
  const [nombre, setNombre] = useState(delPlan?.plan.nombre ?? plantilla.nombre)
  const [fecha, setFecha] = useState(delPlan?.fecha ?? (plantilla.fija ? proximaFechaFija(plantilla.fija, hoy) : ''))
  // Con dos personas, de entrada a medias (se puede cambiar); si no, sin repartir.
  const [filas, setFilas] = useState<Fila[]>(() => {
    const reparto = miembros.length === 2 ? repartirAMedias(plantilla.tareas, miembros, yo) : plantilla.tareas.map(() => null)
    return plantilla.tareas.map((_, i) => ({ incluida: true, responsable: reparto[i] }))
  })
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const incluidas = filas.filter((f) => f.incluida).length
  const fechaDe = (dias: number) => (fecha ? fechaDeTarea(fecha, dias) : null)
  const pasadas = fecha ? plantilla.tareas.filter((t, i) => filas[i].incluida && fechaDeTarea(fecha, t.dias) < hoy).length : 0

  function cambiar(i: number, cambio: Partial<Fila>) {
    setFilas((antes) => antes.map((f, j) => (j === i ? { ...f, ...cambio } : f)))
  }
  function repartir() {
    const marcadas = filas.map((f, i) => ({ f, i })).filter(({ f }) => f.incluida)
    const reparto = repartirAMedias(marcadas, miembros, yo)
    setFilas((antes) => antes.map((f, i) => {
      const pos = marcadas.findIndex((m) => m.i === i)
      return pos === -1 ? f : { ...f, responsable: reparto[pos] }
    }))
  }
  const todoPara = (quien: string | null) => setFilas((antes) => antes.map((f) => ({ ...f, responsable: quien })))
  const quitarPasadas = () => setFilas((antes) => antes.map((f, i) => (fecha && fechaDeTarea(fecha, plantilla.tareas[i].dias) < hoy ? { ...f, incluida: false } : f)))

  async function crear() {
    if (!fecha || incluidas === 0 || !nombre.trim()) return
    setCreando(true)
    setError(null)
    const { id, error } = await crearPreparativos({
      nombre,
      dibujo: plantilla.dibujo,
      fecha,
      plantillaId: plantilla.id,
      agendaPlanId: agendaId,
      tareas: plantilla.tareas
        .map((t, i) => ({ t, f: filas[i] }))
        .filter(({ f }) => f.incluida)
        .map(({ t, f }) => ({ titulo: t.titulo, categoria: t.categoria, fecha_limite: fechaDeTarea(fecha, t.dias), responsable_id: f.responsable })),
    })
    if (error || !id) {
      setCreando(false)
      return setError(error ?? 'No se han podido crear las tareas.')
    }
    // Para la próxima vez que programéis este plan.
    if (delPlan) await elegirPlantillaDelPlan(delPlan.plan.id, plantilla.clave)
    reemplazar(`/preparativos/${id}`)
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-3xl lg:px-10 lg:py-10">
      <button type="button" onClick={() => volver(agendaId ? '/planes' : '/plantillas')} className="self-start text-sm font-medium text-marca">
        ← Cancelar
      </button>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex h-14 w-14 shrink-0 -rotate-6 items-center justify-center rounded-2xl bg-tareas text-3xl">
          {plantilla.dibujo}
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-tareas-tinta">{plantilla.nombre}</h1>
          <p className="text-sm text-stone-600">{plantilla.tareas.length} tareas · revisa y crea las que necesitéis</p>
        </div>
      </div>

      <section className="tarjeta flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-stone-700">{plantilla.pregunta}</span>
          <input
            type="date"
            className={campo}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            disabled={Boolean(delPlan)}
            aria-label={plantilla.pregunta}
          />
          {delPlan && <span className="text-xs text-stone-500">Es el día del plan. Si lo cambiáis en el calendario, las tareas se moverán solas.</span>}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-stone-700">Nombre</span>
          <input className={campo} value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} aria-label="Nombre de los preparativos" />
          <span className="text-xs text-stone-500">Así lo veréis en Tareas, con su progreso («4 de 12 hechas»).</span>
        </label>
      </section>

      <section aria-labelledby="titulo-tareas-plantilla" className="tarjeta flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="titulo-tareas-plantilla" className="text-lg font-bold">
            Tareas <span className="text-sm font-normal text-stone-500">({incluidas} de {plantilla.tareas.length})</span>
          </h2>
          {miembros.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={repartir} className="rounded-full bg-marca-suave px-3 py-1.5 text-xs font-semibold text-marca">⚖️ Repartir a medias</button>
              <button type="button" onClick={() => todoPara(yo)} className="rounded-full px-3 py-1.5 text-xs font-semibold text-stone-600 ring-1 ring-stone-200">🙋 Todo para mí</button>
              <button type="button" onClick={() => todoPara(null)} className="rounded-full px-3 py-1.5 text-xs font-semibold text-stone-600 ring-1 ring-stone-200">Sin repartir</button>
            </div>
          )}
        </div>

        {!fecha && <p className="rounded-xl bg-sol p-3 text-sm text-sol-tinta">📅 Elige la fecha de arriba para ver cuándo toca cada cosa.</p>}
        {pasadas > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <span>⚠️ {pasadas === 1 ? '1 tarea ya tendría que estar hecha' : `${pasadas} tareas ya tendrían que estar hechas`}: si las dejas, saldrán como atrasadas.</span>
            <button type="button" onClick={quitarPasadas} className="rounded-full bg-white px-3 py-1 text-xs font-semibold ring-1 ring-amber-200">Quitarlas</button>
          </div>
        )}

        <ul className="divide-y divide-stone-100">
          {plantilla.tareas.map((t, i) => {
            const f = filas[i]
            const cuando = fechaDe(t.dias)
            return (
              <li key={i} className={`flex flex-col gap-2 py-3 md:flex-row md:items-center ${f.incluida ? '' : 'opacity-50'}`}>
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                  <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-marca" checked={f.incluida} onChange={(e) => cambiar(i, { incluida: e.target.checked })} />
                  <span className="min-w-0">
                    <span className="block font-medium break-words">
                      <span aria-hidden="true">{infoCategoria(t.categoria).dibujo} </span>
                      {t.titulo}
                    </span>
                    <span className={`block text-xs ${cuando && cuando < hoy && f.incluida ? 'text-red-700' : 'text-stone-500'}`}>
                      {cuando ? `${fechaCorta(cuando)} · ` : ''}
                      {textoDias(t.dias)}
                    </span>
                  </span>
                </label>
                {miembros.length > 1 && (
                  <select
                    aria-label={`Quién: ${t.titulo}`}
                    value={f.responsable ?? ''}
                    disabled={!f.incluida}
                    onChange={(e) => cambiar(i, { responsable: e.target.value || null })}
                    className="ml-8 shrink-0 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-stone-300 md:ml-0"
                  >
                    <option value="">Nadie</option>
                    {miembros.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id === yo ? `${m.nombre_visible} (tú)` : m.nombre_visible}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {error && <p role="alert" className={avisoError}>{error}</p>}
      <button type="button" onClick={crear} disabled={creando || !fecha || incluidas === 0 || !nombre.trim()} className={botonPrincipal}>
        {creando ? 'Creando…' : incluidas === 1 ? '📋 Crear 1 tarea' : `📋 Crear ${incluidas} tareas`}
      </button>
      <button
        type="button"
        onClick={() => ir(plantilla.id ? `/plantillas/${plantilla.id}/editar` : `/plantillas/copiar/${plantilla.clave}${sufijoPlan(agendaId)}`)}
        className="self-center px-4 py-2 text-sm font-medium text-marca"
      >
        ✏️ {plantilla.id ? 'Editar la plantilla' : 'Copiar y cambiar esta plantilla'}
      </button>
    </main>
  )
}
