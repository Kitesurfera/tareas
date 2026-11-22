import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { mensajeDeError } from '../lib/errores'
import {
  COLORES_PLAN,
  DURACIONES,
  ENERGIAS,
  PRECIOS,
  type CategoriaPlan,
  type Duracion,
  type Energia,
  type Plan,
  type Precio,
} from '../lib/planes'
import { ir, volver } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import { avisoError, botonPrincipal, campo, estiloChip } from './estilos'

type Props = { hogarId: string; id?: string }

// #/planes/nuevo y #/planes/<id>/editar
export function FormularioPlan({ hogarId, id }: Props) {
  const [cargado, setCargado] = useState<{ categorias: CategoriaPlan[]; plan: Plan | null } | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    Promise.all([
      supabase.from('categorias_plan').select('*').order('orden').order('nombre'),
      id ? supabase.from('planes').select('*').eq('id', id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]).then(([categorias, plan]) => {
      if (!vigente) return
      const fallo = categorias.error ?? plan.error
      if (fallo) return setErrorCarga(mensajeDeError(fallo))
      setCargado({ categorias: categorias.data as CategoriaPlan[], plan: plan.data as Plan | null })
    })
    return () => {
      vigente = false
    }
  }, [id])

  if (errorCarga) return <Aviso>{errorCarga}</Aviso>
  if (!cargado) return <Aviso>Cargando…</Aviso>
  if (id && !cargado.plan) return <Aviso>No encontramos este plan en tu hogar.</Aviso>
  return <Formulario hogarId={hogarId} categorias={cargado.categorias} plan={cargado.plan} />
}

function Aviso({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md items-center justify-center px-5 text-center text-stone-500 md:max-w-2xl md:px-6 lg:max-w-xl lg:px-10">
      <p>{children}</p>
    </main>
  )
}

function Formulario({ hogarId, categorias, plan }: { hogarId: string; categorias: CategoriaPlan[]; plan: Plan | null }) {
  const [nombre, setNombre] = useState(plan?.nombre ?? '')
  const [categoriaId, setCategoriaId] = useState<string | null>(plan?.categoria_id ?? null)
  const [energia, setEnergia] = useState<Energia | null>(plan?.energia ?? null)
  const [precio, setPrecio] = useState<Precio | null>(plan?.precio ?? null)
  const [duracion, setDuracion] = useState<Duracion | null>(plan?.duracion ?? null)
  const [notas, setNotas] = useState(plan?.notas ?? '')
  const [favorito, setFavorito] = useState(plan?.favorito ?? false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    if (!supabase) return
    setGuardando(true)
    setError(null)
    const datos = {
      nombre: nombre.trim(),
      categoria_id: categoriaId,
      energia,
      precio,
      duracion,
      notas: notas.trim() || null,
      favorito,
    }
    const { error } = plan
      ? await supabase.from('planes').update(datos).eq('id', plan.id)
      : await supabase.from('planes').insert({ hogar_id: hogarId, ...datos })
    setGuardando(false)
    if (error) return setError(mensajeDeError(error))
    volver('/planes')
  }

  async function borrar() {
    if (!supabase || !plan) return
    if (!window.confirm(`¿Borrar «${plan.nombre}»? También se quitará del calendario.`)) return
    setGuardando(true)
    const { error } = await supabase.from('planes').delete().eq('id', plan.id)
    setGuardando(false)
    if (error) return setError(mensajeDeError(error))
    volver('/planes')
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-6 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-xl lg:px-10 lg:py-10">
      <button type="button" onClick={() => volver('/planes')} className="self-start text-sm font-medium text-marca">
        ← Cancelar
      </button>
      <h1 className="text-2xl font-extrabold text-planes-tinta">{plan ? 'Editar plan' : 'Nuevo plan'}</h1>

      <form onSubmit={guardar} className="tarjeta flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">¿Qué plan?</span>
          <input
            className={campo}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Por ejemplo: Ruta por la sierra"
            maxLength={80}
            required
          />
        </label>

        <Opciones titulo="Categoría">
          {categorias.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={categoriaId === c.id}
              onClick={() => setCategoriaId(c.id)}
              className={
                categoriaId === c.id
                  ? `rounded-full px-4 py-2 text-sm font-semibold ring-2 ring-current ${COLORES_PLAN[c.color].suave}`
                  : estiloChip(false)
              }
            >
              <span aria-hidden="true">{c.dibujo}</span> {c.nombre}
            </button>
          ))}
          <button type="button" aria-pressed={categoriaId === null} onClick={() => setCategoriaId(null)} className={estiloChip(categoriaId === null)}>
            Sin categoría
          </button>
          <button type="button" onClick={() => ir('/planes/categorias')} className="px-2 text-sm font-medium text-marca">
            + Nueva categoría
          </button>
        </Opciones>

        <Opciones titulo="¿Cuánta energía pide?">
          {ENERGIAS.map((e) => (
            <button key={e.valor} type="button" aria-pressed={energia === e.valor} onClick={() => setEnergia(energia === e.valor ? null : e.valor)} className={estiloChip(energia === e.valor)}>
              {e.dibujo} {e.texto}
            </button>
          ))}
        </Opciones>

        <Opciones titulo="Precio aproximado">
          {PRECIOS.map((p) => (
            <button key={p.valor} type="button" aria-pressed={precio === p.valor} onClick={() => setPrecio(precio === p.valor ? null : p.valor)} className={estiloChip(precio === p.valor)}>
              {p.texto}
            </button>
          ))}
        </Opciones>

        <Opciones titulo="¿Cuánto dura?">
          {DURACIONES.map((d) => (
            <button key={d.valor} type="button" aria-pressed={duracion === d.valor} onClick={() => setDuracion(duracion === d.valor ? null : d.valor)} className={estiloChip(duracion === d.valor)}>
              {d.texto}
            </button>
          ))}
        </Opciones>
        <p className="-mt-3 text-xs text-stone-500">Toca otra vez una opción para dejarla sin elegir.</p>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">
            Notas o enlace <span className="font-normal text-stone-400">(opcional)</span>
          </span>
          <textarea
            className={`${campo} min-h-20`}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            maxLength={1000}
            placeholder="Dónde es, qué llevar, la web del sitio…"
          />
        </label>

        <label className="flex items-center gap-3 font-medium text-stone-700">
          <input type="checkbox" className="h-5 w-5 accent-marca" checked={favorito} onChange={(e) => setFavorito(e.target.checked)} />
          ⭐ Favorito (sale más a menudo al azar)
        </label>

        {error && <p role="alert" className={avisoError}>{error}</p>}

        <button type="submit" disabled={guardando || !nombre.trim()} className={botonPrincipal}>
          {guardando ? 'Guardando…' : plan ? 'Guardar cambios' : 'Añadir plan'}
        </button>
      </form>

      {plan && (
        <button type="button" onClick={borrar} disabled={guardando} className="self-center px-4 py-2 text-sm font-medium text-red-700">
          Borrar plan
        </button>
      )}
    </main>
  )
}

function Opciones({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium text-stone-700">{titulo}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  )
}
