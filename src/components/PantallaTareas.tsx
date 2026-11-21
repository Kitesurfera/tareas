import { useEffect, useState } from 'react'
import { mensajeDeError } from '../lib/errores'
import { diasHasta, hoyComoTexto } from '../lib/fechas'
import { ir, volver } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import type { Tarea } from '../lib/tipos'
import { useMascotasDelHogar } from '../lib/useMascotasDelHogar'
import { useMiembros } from '../lib/useMiembros'
import { ConfirmarHecho } from './ConfirmarHecho'
import { avisoError, botonPrincipal } from './estilos'
import { FilaTarea } from './FilaTarea'

type Props = {
  miUserId: string
}

type Pestana = 'pendientes' | 'hechas'

// Agrupa las pendientes según cuándo vencen.
function grupoDe(tarea: Tarea): string {
  if (!tarea.fecha_limite) return 'Sin fecha'
  const dias = diasHasta(tarea.fecha_limite)
  if (dias < 0) return 'Atrasadas'
  if (dias <= 7) return 'Próximos 7 días'
  return 'Más adelante'
}
const ORDEN_GRUPOS = ['Atrasadas', 'Próximos 7 días', 'Más adelante', 'Sin fecha']

// Lista de tareas del hogar.
export function PantallaTareas({ miUserId }: Props) {
  const { miembros } = useMiembros()
  const mascotas = useMascotasDelHogar()
  const [pestana, setPestana] = useState<Pestana>('pendientes')
  const [soloMias, setSoloMias] = useState(false)
  const [tareas, setTareas] = useState<{ pestana: Pestana; lista: Tarea[] } | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [marcando, setMarcando] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  // Última tarea marcada como hecha, para poder deshacerlo.
  const [recienHecha, setRecienHecha] = useState<Tarea | null>(null)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    const consulta =
      pestana === 'pendientes'
        ? supabase
            .from('tareas')
            .select('*')
            .eq('completada', false)
            .order('fecha_limite', { ascending: true, nullsFirst: false })
            .order('creado_en')
        : supabase
            .from('tareas')
            .select('*')
            .eq('completada', true)
            .order('completada_en', { ascending: false })
            .limit(50)
    consulta.then(({ data, error }) => {
      if (!vigente) return
      if (error) setError(mensajeDeError(error))
      else setTareas({ pestana, lista: data as Tarea[] })
    })
    return () => {
      vigente = false
    }
  }, [pestana, recarga])

  const miMiembroId = miembros?.find((m) => m.user_id === miUserId)?.id
  const nombreMiembro = (id: string | null) =>
    miembros?.find((m) => m.id === id)?.nombre_visible ?? null
  const nombrePorUsuario = (userId: string | null) =>
    miembros?.find((m) => m.user_id === userId)?.nombre_visible ?? null
  const nombreMascota = (id: string | null) =>
    mascotas?.find((m) => m.id === id)?.nombre ?? null

  // Mientras cambia de pestaña no enseñamos la lista anterior.
  const lista =
    tareas?.pestana === pestana
      ? tareas.lista.filter((t) => !soloMias || t.responsable_id === miMiembroId)
      : null

  async function completar(tarea: Tarea, fecha: string) {
    if (!supabase) return
    setEnviando(true)
    setError(null)
    const { error } = await supabase.rpc('completar_tarea', { tarea_id: tarea.id, hecha_el: fecha })
    setEnviando(false)
    if (error) {
      setError(mensajeDeError(error))
      return
    }
    setMarcando(null)
    setRecienHecha(tarea)
    setRecarga((n) => n + 1)
  }

  function pulsarCirculo(tarea: Tarea) {
    setError(null)
    // Las tareas a mano se marcan al momento (y se pueden deshacer).
    // Las de un tratamiento preguntan la fecha, porque de ella depende
    // cuándo toca la siguiente.
    if (tarea.tratamiento_id) setMarcando(tarea.id)
    else completar(tarea, hoyComoTexto())
  }

  async function reabrir(tarea: Tarea) {
    if (!supabase) return
    setError(null)
    const { error } = await supabase.rpc('reabrir_tarea', { tarea_id: tarea.id })
    if (error) {
      setError(mensajeDeError(error))
      return
    }
    setRecienHecha(null)
    setRecarga((n) => n + 1)
  }

  const fila = (tarea: Tarea) => (
    <FilaTarea
      key={tarea.id}
      tarea={tarea}
      nombreResponsable={nombreMiembro(tarea.responsable_id)}
      nombreMascota={nombreMascota(tarea.mascota_id)}
      nombreQuienLaHizo={nombrePorUsuario(tarea.completada_por)}
      onPulsarCirculo={() => pulsarCirculo(tarea)}
      onReabrir={tarea.completada && !tarea.tratamiento_id ? () => reabrir(tarea) : undefined}
    >
      {marcando === tarea.id && (
        <ConfirmarHecho
          enviando={enviando}
          onConfirmar={(fecha) => completar(tarea, fecha)}
          onCancelar={() => setMarcando(null)}
        />
      )}
    </FilaTarea>
  )

  const chip = (activo: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-medium ring-1 transition ${
      activo ? 'bg-marca text-white ring-marca' : 'bg-white text-stone-700 ring-stone-300'
    }`

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 px-5 py-8">
      <button
        type="button"
        onClick={() => volver('/')}
        className="self-start text-sm font-medium text-marca"
      >
        ← Inicio
      </button>

      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-marca">Tareas del hogar</h1>
      </header>

      <button type="button" onClick={() => ir('/tareas/nueva')} className={botonPrincipal}>
        + Nueva tarea
      </button>

      <div className="grid grid-cols-2 gap-1 rounded-full bg-stone-200 p-1" role="tablist">
        {(
          [
            ['pendientes', 'Pendientes'],
            ['hechas', 'Hechas'],
          ] as const
        ).map(([valor, texto]) => (
          <button
            key={valor}
            type="button"
            role="tab"
            aria-selected={pestana === valor}
            onClick={() => {
              setPestana(valor)
              setMarcando(null)
            }}
            className={`rounded-full px-3 py-2 text-sm font-medium transition ${
              pestana === valor ? 'bg-white text-marca shadow-sm' : 'text-stone-600'
            }`}
          >
            {texto}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button type="button" aria-pressed={!soloMias} onClick={() => setSoloMias(false)} className={chip(!soloMias)}>
          Todas
        </button>
        <button type="button" aria-pressed={soloMias} onClick={() => setSoloMias(true)} className={chip(soloMias)}>
          Mías
        </button>
      </div>

      {recienHecha && pestana === 'pendientes' && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-xl bg-marca-suave p-3 text-sm text-marca">
          <span>¡Hecho! «{recienHecha.titulo}»</span>
          {!recienHecha.tratamiento_id && (
            <button type="button" onClick={() => reabrir(recienHecha)} className="shrink-0 font-semibold underline">
              Deshacer
            </button>
          )}
        </div>
      )}

      {error && <p role="alert" className={avisoError}>{error}</p>}

      {lista === null && !error && <p className="text-center text-stone-400">Cargando…</p>}

      {lista?.length === 0 && (
        <p className="rounded-2xl bg-white p-5 text-center text-stone-500 shadow-sm">
          {pestana === 'pendientes'
            ? soloMias
              ? 'No tienes nada pendiente. 🎉'
              : 'No hay nada pendiente en el hogar. 🎉'
            : 'Todavía no hay tareas hechas.'}
        </p>
      )}

      {lista && lista.length > 0 && pestana === 'pendientes' &&
        ORDEN_GRUPOS.map((grupo) => {
          const delGrupo = lista.filter((t) => grupoDe(t) === grupo)
          if (delGrupo.length === 0) return null
          return (
            <section key={grupo} className="rounded-2xl bg-white px-5 py-2 shadow-sm">
              <h2 className={`pt-2 text-sm font-semibold ${grupo === 'Atrasadas' ? 'text-red-700' : 'text-stone-500'}`}>
                {grupo}
              </h2>
              <ul className="divide-y divide-stone-100">{delGrupo.map(fila)}</ul>
            </section>
          )
        })}

      {lista && lista.length > 0 && pestana === 'hechas' && (
        <section className="rounded-2xl bg-white px-5 py-2 shadow-sm">
          <ul className="divide-y divide-stone-100">{lista.map(fila)}</ul>
        </section>
      )}
    </main>
  )
}
