import { useState } from 'react'
import { cuandoToca, fechaCorta } from '../lib/fechas'
import { normalizar } from '../lib/importarPlanes'
import { borrarPlanes, infoCategoria, proximaVez, ultimaVez, type DatosPlanes, type Plan } from '../lib/planes'
import { ir } from '../lib/ruta'
import { avisoError, botonSecundario, campo } from './estilos'
import { TituloSeccion, Vacio } from './Piezas'
import { AccionesPlan, BotonFavorito, DatosDelPlan, NotasConEnlaces } from './PiezasPlanes'

type Props = { datos: DatosPlanes; onCambio: () => void }

const enFila = 'md:w-auto md:flex-auto md:whitespace-nowrap'

const plural = (n: number) => (n === 1 ? '1 plan' : `${n} planes`)

// «📚 Vuestros planes»: todos, por categorías. Al tocar uno se abre para
// programarlo, marcarlo como hecho, editarlo o borrarlo. Con «☑️ Elegir» se
// marcan varios para borrarlos de una vez.
export function ListaPlanes({ datos, onCambio }: Props) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [eligiendo, setEligiendo] = useState(false)
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [borrando, setBorrando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)

  const filtrados = busqueda.trim()
    ? datos.planes.filter((p) => normalizar(`${p.nombre} ${p.notas ?? ''}`).includes(normalizar(busqueda)))
    : datos.planes

  // Las categorías con planes, en su orden; al final, los que no tienen.
  const grupos = [
    ...datos.categorias.map((c) => ({ id: c.id as string | null, planes: filtrados.filter((p) => p.categoria_id === c.id) })),
    { id: null, planes: filtrados.filter((p) => !datos.categorias.some((c) => c.id === p.categoria_id)) },
  ].filter((g) => g.planes.length > 0)

  // Solo cuentan los que siguen existiendo (por si otra persona borró alguno).
  const marcados = datos.planes.filter((p) => elegidos.has(p.id))

  function cambiar(ids: string[], marcar: boolean) {
    setElegidos((antes) => {
      const nuevos = new Set(antes)
      for (const id of ids) {
        if (marcar) nuevos.add(id)
        else nuevos.delete(id)
      }
      return nuevos
    })
  }

  function empezarAElegir() {
    setEligiendo(true)
    setElegidos(new Set())
    setAbierto(null)
    setError(null)
    setHecho(null)
  }

  function dejarDeElegir() {
    setEligiendo(false)
    setElegidos(new Set())
    setError(null)
  }

  async function borrarMarcados() {
    const n = marcados.length
    if (n === 0) return
    const pregunta = n === 1 ? `¿Borrar «${marcados[0].nombre}»?` : `¿Borrar estos ${n} planes?`
    if (!window.confirm(`${pregunta} También se quitarán del calendario. No se puede deshacer.`)) return
    setBorrando(true)
    setError(null)
    const { borrados, error } = await borrarPlanes(marcados.map((p) => p.id))
    setBorrando(false)
    onCambio()
    if (error) return setError(borrados > 0 ? `Se han borrado ${plural(borrados)}, pero el resto no: ${error}` : error)
    setHecho(`🗑️ ${borrados === 1 ? 'Borrado 1 plan' : `Borrados ${borrados} planes`}.`)
    dejarDeElegir()
  }

  return (
    <section className="tarjeta flex flex-col gap-4">
      <TituloSeccion
        dibujo="📚"
        titulo="Vuestros planes"
        subtitulo={eligiendo ? 'Elegid los que queréis borrar' : 'Tocad uno para programarlo'}
        color="planes"
        derecha={
          datos.planes.length > 0 && (
            <button
              type="button"
              onClick={eligiendo ? dejarDeElegir : empezarAElegir}
              aria-pressed={eligiendo}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                eligiendo ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              {eligiendo ? 'Cancelar' : '☑️ Elegir'}
            </button>
          )
        }
      />

      {datos.planes.length > 6 && (
        <input
          type="search"
          className={campo}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar un plan…"
          aria-label="Buscar un plan"
        />
      )}

      {eligiendo && filtrados.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-stone-700">{marcados.length === 0 ? 'Ninguno elegido' : marcados.length === 1 ? '1 plan elegido' : `${marcados.length} planes elegidos`}</span>
          <button type="button" onClick={() => cambiar(filtrados.map((p) => p.id), true)} className="font-medium text-marca">
            {busqueda.trim() ? 'Elegir los encontrados' : 'Elegir todos'}
          </button>
          {marcados.length > 0 && (
            <button type="button" onClick={() => setElegidos(new Set())} className="font-medium text-stone-500">
              Ninguno
            </button>
          )}
        </div>
      )}

      {hecho && !eligiendo && (
        <p role="status" className="text-sm font-medium text-marca">
          {hecho}
        </p>
      )}

      {datos.planes.length === 0 && (
        <Vacio dibujo="🗺️" color="planes">
          Aquí iréis guardando vuestros planes: los de siempre y los que os apetece probar.
        </Vacio>
      )}
      {datos.planes.length > 0 && grupos.length === 0 && <p className="text-sm text-stone-500">Ningún plan con «{busqueda}».</p>}

      {grupos.map((grupo) => {
        const info = infoCategoria(datos.categorias, grupo.id)
        const ids = grupo.planes.map((p) => p.id)
        const todos = ids.every((id) => elegidos.has(id))
        return (
          <div key={grupo.id ?? 'sin'} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className={`self-start rounded-full px-3 py-1 text-xs font-bold ${info.suave}`}>
                <span aria-hidden="true">{info.dibujo}</span> {info.nombre} · {grupo.planes.length}
              </h3>
              {eligiendo && (
                <button
                  type="button"
                  onClick={() => cambiar(ids, !todos)}
                  aria-label={`${todos ? 'Quitar' : 'Elegir'} todos los de ${info.nombre}`}
                  className="text-xs font-semibold text-marca"
                >
                  {todos ? 'Quitar todos' : 'Elegir todos'}
                </button>
              )}
            </div>
            <ul className="divide-y divide-stone-100">
              {grupo.planes.map((plan) =>
                eligiendo ? (
                  <FilaElegir key={plan.id} plan={plan} marcado={elegidos.has(plan.id)} onCambiar={(marcar) => cambiar([plan.id], marcar)} />
                ) : (
                  <FilaPlan
                    key={plan.id}
                    plan={plan}
                    datos={datos}
                    abierto={abierto === plan.id}
                    onAbrir={() => setAbierto(abierto === plan.id ? null : plan.id)}
                    onCambio={onCambio}
                  />
                ),
              )}
            </ul>
          </div>
        )
      })}

      {eligiendo ? (
        // Pegado abajo mientras se baja por la lista (en el móvil, encima de la barra de pestañas).
        <div className="sticky bottom-24 z-10 -mx-2 flex flex-col gap-2 rounded-2xl bg-white/95 p-2 shadow-[0_-6px_20px_-12px_rgb(60_40_20/0.4)] ring-1 ring-stone-900/5 backdrop-blur md:bottom-4">
          {error && <p role="alert" className={avisoError}>{error}</p>}
          <button
            type="button"
            onClick={borrarMarcados}
            disabled={marcados.length === 0 || borrando}
            className="w-full rounded-full bg-red-700 px-5 py-3 font-semibold text-white transition hover:bg-red-800 active:scale-[0.98] disabled:opacity-50"
          >
            {borrando ? 'Borrando…' : marcados.length === 0 ? '🗑️ Elegid qué borrar' : `🗑️ Borrar ${plural(marcados.length)}`}
          </button>
        </div>
      ) : (
        // En el móvil, uno debajo de otro; si hay sitio, en fila (y si no caben, saltan de línea sin partir el texto).
        <div className="flex flex-col gap-2 md:flex-row md:flex-wrap">
          <button type="button" onClick={() => ir('/planes/nuevo')} className={`${botonSecundario} ${enFila}`}>
            + Añadir plan
          </button>
          <button type="button" onClick={() => ir('/planes/importar')} className={`${botonSecundario} ${enFila}`}>
            📄 Añadir varios
          </button>
          <button type="button" onClick={() => ir('/planes/categorias')} className={`${botonSecundario} ${enFila}`}>
            🏷️ Categorías
          </button>
        </div>
      )}
    </section>
  )
}

// En el modo «Elegir»: toda la fila es la casilla.
function FilaElegir({ plan, marcado, onCambiar }: { plan: Plan; marcado: boolean; onCambiar: (marcar: boolean) => void }) {
  return (
    <li>
      <label className={`-mx-2 flex cursor-pointer items-start gap-3 rounded-xl px-2 py-3 transition ${marcado ? 'bg-red-50' : 'hover:bg-stone-50'}`}>
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-red-700" checked={marcado} onChange={(e) => onCambiar(e.target.checked)} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-medium">
            {plan.nombre}
            {plan.favorito && <span className="ml-1" aria-label="(favorito)">⭐</span>}
          </span>
          <span className="flex flex-wrap gap-1.5">
            <DatosDelPlan plan={plan} />
          </span>
        </span>
      </label>
    </li>
  )
}

function FilaPlan({ plan, datos, abierto, onAbrir, onCambio }: { plan: Plan; datos: DatosPlanes; abierto: boolean; onAbrir: () => void; onCambio: () => void }) {
  const proxima = proximaVez(plan.id, datos.agenda)
  const ultima = ultimaVez(plan.id, datos.agenda)
  return (
    <li className="py-2">
      <div className="flex items-start gap-2">
        <button type="button" onClick={onAbrir} aria-expanded={abierto} className="flex min-w-0 flex-1 flex-col items-start gap-1 py-1 text-left">
          <span className="font-medium">{plan.nombre}</span>
          <span className="flex flex-wrap gap-1.5">
            <DatosDelPlan plan={plan} />
            {proxima && (
              <span className="text-xs font-medium text-planes-tinta">
                📅 {fechaCorta(proxima.fecha)} · {cuandoToca(proxima.fecha).toLowerCase()}
              </span>
            )}
          </span>
        </button>
        <BotonFavorito plan={plan} onCambio={onCambio} />
      </div>
      {abierto && (
        <div className="mt-2 flex animate-aparecer flex-col gap-3 rounded-2xl bg-stone-50 p-3">
          {plan.notas && <NotasConEnlaces texto={plan.notas} />}
          <p className="text-xs text-stone-500">{ultima ? `La última vez: ${fechaCorta(ultima)}.` : 'Todavía no lo habéis hecho.'}</p>
          <AccionesPlan plan={plan} agenda={datos.agenda} onCambio={onCambio} conBorrar />
        </div>
      )}
    </li>
  )
}
