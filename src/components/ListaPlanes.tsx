import { useState } from 'react'
import { cuandoToca, fechaCorta } from '../lib/fechas'
import { infoCategoria, proximaVez, ultimaVez, type DatosPlanes, type Plan } from '../lib/planes'
import { ir } from '../lib/ruta'
import { botonSecundario, campo } from './estilos'
import { TituloSeccion, Vacio } from './Piezas'
import { AccionesPlan, BotonFavorito, DatosDelPlan, NotasConEnlaces } from './PiezasPlanes'

type Props = { datos: DatosPlanes; onCambio: () => void }

const normalizar = (texto: string) =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

// «📚 Vuestros planes»: todos, por categorías. Al tocar uno se abre para
// programarlo, marcarlo como hecho o editarlo (elegir a mano).
export function ListaPlanes({ datos, onCambio }: Props) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const filtrados = busqueda.trim()
    ? datos.planes.filter((p) => normalizar(`${p.nombre} ${p.notas ?? ''}`).includes(normalizar(busqueda.trim())))
    : datos.planes

  // Las categorías con planes, en su orden; al final, los que no tienen.
  const grupos = [
    ...datos.categorias.map((c) => ({ id: c.id as string | null, planes: filtrados.filter((p) => p.categoria_id === c.id) })),
    { id: null, planes: filtrados.filter((p) => !datos.categorias.some((c) => c.id === p.categoria_id)) },
  ].filter((g) => g.planes.length > 0)

  return (
    <section className="tarjeta flex flex-col gap-4">
      <TituloSeccion dibujo="📚" titulo="Vuestros planes" subtitulo="Tocad uno para programarlo" color="planes" />

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

      {datos.planes.length === 0 && (
        <Vacio dibujo="🗺️" color="planes">
          Aquí iréis guardando vuestros planes: los de siempre y los que os apetece probar.
        </Vacio>
      )}
      {datos.planes.length > 0 && grupos.length === 0 && <p className="text-sm text-stone-500">Ningún plan con «{busqueda}».</p>}

      {grupos.map((grupo) => {
        const info = infoCategoria(datos.categorias, grupo.id)
        return (
          <div key={grupo.id ?? 'sin'} className="flex flex-col gap-1">
            <h3 className={`self-start rounded-full px-3 py-1 text-xs font-bold ${info.suave}`}>
              <span aria-hidden="true">{info.dibujo}</span> {info.nombre} · {grupo.planes.length}
            </h3>
            <ul className="divide-y divide-stone-100">
              {grupo.planes.map((plan) => (
                <FilaPlan
                  key={plan.id}
                  plan={plan}
                  datos={datos}
                  abierto={abierto === plan.id}
                  onAbrir={() => setAbierto(abierto === plan.id ? null : plan.id)}
                  onCambio={onCambio}
                />
              ))}
            </ul>
          </div>
        )
      })}

      <div className="flex flex-col gap-2 md:flex-row">
        <button type="button" onClick={() => ir('/planes/nuevo')} className={botonSecundario}>
          + Añadir plan
        </button>
        <button type="button" onClick={() => ir('/planes/categorias')} className={botonSecundario}>
          🏷️ Categorías
        </button>
      </div>
    </section>
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
          <AccionesPlan plan={plan} agenda={datos.agenda} onCambio={onCambio} />
        </div>
      )}
    </li>
  )
}
