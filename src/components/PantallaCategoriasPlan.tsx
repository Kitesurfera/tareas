import { useState } from 'react'
import { mensajeDeError } from '../lib/errores'
import {
  CATEGORIAS_SUGERIDAS,
  COLORES,
  COLORES_PLAN,
  DIBUJOS_RAPIDOS,
  usePlanes,
  type CategoriaPlan,
  type ColorPlan,
} from '../lib/planes'
import { volver } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import { avisoError, botonPrincipal, botonSecundario, campo } from './estilos'
import { TituloSeccion } from './Piezas'

const normalizar = (texto: string) => texto.trim().toLowerCase()

// #/planes/categorias: las sugeridas y las vuestras (nombre, dibujo y color).
export function PantallaCategoriasPlan({ hogarId }: { hogarId: string }) {
  const { datos, error, recargar } = usePlanes()
  const [editando, setEditando] = useState<string | null>(null) // id, o «nueva»
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)

  const faltan = datos
    ? CATEGORIAS_SUGERIDAS.filter((s) => !datos.categorias.some((c) => normalizar(c.nombre) === normalizar(s.nombre)))
    : []

  async function anadirSugeridas() {
    if (!supabase || !datos) return
    setErrorAccion(null)
    const siguiente = Math.max(0, ...datos.categorias.map((c) => c.orden + 1))
    const { error } = await supabase
      .from('categorias_plan')
      .insert(faltan.map((c, i) => ({ hogar_id: hogarId, nombre: c.nombre, dibujo: c.dibujo, color: c.color, orden: siguiente + i })))
    if (error && error.code !== '23505') return setErrorAccion(mensajeDeError(error))
    setMensaje(`✅ ${faltan.length === 1 ? 'Añadida 1 categoría' : `Añadidas ${faltan.length} categorías`}.`)
    recargar()
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-xl lg:px-10 lg:py-10">
      <button type="button" onClick={() => volver('/planes')} className="self-start text-sm font-medium text-marca">
        ← Planes
      </button>
      <h1 className="text-2xl font-extrabold text-planes-tinta">🏷️ Categorías de planes</h1>

      {error && <p role="alert" className={avisoError}>{error}</p>}
      {datos === null && !error && <p className="text-center text-stone-400">Cargando…</p>}

      {datos && (
        <section className="tarjeta flex flex-col gap-3">
          <TituloSeccion dibujo="🎨" titulo="Vuestras categorías" subtitulo="Cada una con su dibujo y su color en el calendario" color="planes" />
          {datos.categorias.length === 0 && <p className="text-sm text-stone-500">Todavía no hay ninguna.</p>}
          <ul className="divide-y divide-stone-100">
            {datos.categorias.map((c) => {
              const cuantos = datos.planes.filter((p) => p.categoria_id === c.id).length
              return (
                <li key={c.id} className="py-2">
                  {editando === c.id ? (
                    <EditorCategoria
                      hogarId={hogarId}
                      categoria={c}
                      cuantos={cuantos}
                      orden={c.orden}
                      onListo={() => {
                        setEditando(null)
                        recargar()
                      }}
                      onCancelar={() => setEditando(null)}
                    />
                  ) : (
                    <button type="button" onClick={() => setEditando(c.id)} className="flex w-full items-center gap-3 py-1 text-left">
                      <span aria-hidden="true" className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl ${COLORES_PLAN[c.color].suave}`}>
                        {c.dibujo}
                      </span>
                      <span className="flex-1">
                        <span className="block font-medium">{c.nombre}</span>
                        <span className="block text-sm text-stone-500">
                          {cuantos === 1 ? '1 plan' : `${cuantos} planes`} · {COLORES_PLAN[c.color].texto}
                        </span>
                      </span>
                      <span aria-hidden="true" className="text-stone-400">✏️</span>
                    </button>
                  )}
                </li>
              )
            })}
          </ul>

          {editando === 'nueva' ? (
            <EditorCategoria
              hogarId={hogarId}
              cuantos={0}
              orden={Math.max(0, ...datos.categorias.map((c) => c.orden + 1))}
              onListo={() => {
                setEditando(null)
                recargar()
              }}
              onCancelar={() => setEditando(null)}
            />
          ) : (
            <button type="button" onClick={() => setEditando('nueva')} className={botonSecundario}>
              + Nueva categoría
            </button>
          )}

          {faltan.length > 0 && (
            <div className="mt-2 rounded-2xl bg-stone-50 p-3 text-sm text-stone-600">
              <p>
                Sugeridas que no tenéis:{' '}
                {faltan.map((s) => `${s.dibujo} ${s.nombre}`).join(' · ')}
              </p>
              <button type="button" onClick={anadirSugeridas} className="mt-2 font-semibold text-marca">
                + Añadirlas
              </button>
            </div>
          )}
          {mensaje && <p role="status" className="text-sm font-medium text-marca">{mensaje}</p>}
          {errorAccion && <p role="alert" className={avisoError}>{errorAccion}</p>}
        </section>
      )}
    </main>
  )
}

type Editor = {
  hogarId: string
  categoria?: CategoriaPlan
  cuantos: number
  orden: number
  onListo: () => void
  onCancelar: () => void
}

// Crear o cambiar una categoría (y borrarla).
function EditorCategoria({ hogarId, categoria, cuantos, orden, onListo, onCancelar }: Editor) {
  const [nombre, setNombre] = useState(categoria?.nombre ?? '')
  const [dibujo, setDibujo] = useState(categoria?.dibujo ?? '✨')
  const [color, setColor] = useState<ColorPlan>(categoria?.color ?? 'rosa')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    if (!supabase) return
    setGuardando(true)
    setError(null)
    const datos = { nombre: nombre.trim(), dibujo: dibujo.trim() || '✨', color }
    const { error } = categoria
      ? await supabase.from('categorias_plan').update(datos).eq('id', categoria.id)
      : await supabase.from('categorias_plan').insert({ hogar_id: hogarId, orden, ...datos })
    setGuardando(false)
    if (error) return setError(error.code === '23505' ? 'Ya tenéis una categoría con ese nombre.' : mensajeDeError(error))
    onListo()
  }

  async function borrar() {
    if (!supabase || !categoria) return
    const aviso =
      cuantos > 0
        ? `¿Borrar «${categoria.nombre}»? Sus ${cuantos === 1 ? 'plan se queda' : `${cuantos} planes se quedan`} sin categoría (no se borra${cuantos === 1 ? '' : 'n'}).`
        : `¿Borrar «${categoria.nombre}»?`
    if (!window.confirm(aviso)) return
    setGuardando(true)
    const { error } = await supabase.from('categorias_plan').delete().eq('id', categoria.id)
    setGuardando(false)
    if (error) return setError(mensajeDeError(error))
    onListo()
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-stone-50 p-3">
      <label className="flex flex-col gap-1 text-sm font-medium text-stone-700">
        Nombre
        <input className={campo} value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={40} placeholder="Por ejemplo: Deporte" autoFocus />
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium text-stone-700">Dibujo</legend>
        <div className="flex flex-wrap gap-1">
          {DIBUJOS_RAPIDOS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={dibujo === d}
              aria-label={`Dibujo ${d}`}
              onClick={() => setDibujo(d)}
              className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl ${dibujo === d ? 'bg-white ring-2 ring-marca' : 'hover:bg-white'}`}
            >
              {d}
            </button>
          ))}
        </div>
        <label className="mt-1 flex items-center gap-2 text-xs text-stone-600">
          U otro emoji:
          <input className={`${campo} w-20 py-2 text-center text-xl`} value={dibujo} onChange={(e) => setDibujo(e.target.value)} maxLength={16} aria-label="Otro emoji" />
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-sm font-medium text-stone-700">Color en el calendario</legend>
        <div className="flex flex-wrap gap-2">
          {COLORES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${COLORES_PLAN[c].suave} ${color === c ? 'ring-2 ring-current' : ''}`}
            >
              {COLORES_PLAN[c].texto}
            </button>
          ))}
        </div>
      </fieldset>

      {error && <p role="alert" className={avisoError}>{error}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={guardar} disabled={guardando || !nombre.trim()} className={`${botonPrincipal} flex-1`}>
          {guardando ? 'Guardando…' : categoria ? 'Guardar' : 'Crear categoría'}
        </button>
        <button type="button" onClick={onCancelar} className="px-3 text-sm font-medium text-stone-600">
          Cancelar
        </button>
      </div>
      {categoria && (
        <button type="button" onClick={borrar} disabled={guardando} className="self-start text-sm font-medium text-red-700">
          Borrar categoría
        </button>
      )}
    </div>
  )
}
