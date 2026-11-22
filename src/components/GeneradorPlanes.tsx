import { useState, type ReactNode } from 'react'
import { fechaCorta, cuandoToca } from '../lib/fechas'
import {
  DURACIONES,
  elegirAlAzar,
  ENERGIAS,
  infoCategoria,
  PRECIOS,
  proximaVez,
  SIN_FILTROS,
  ultimaVez,
  type DatosPlanes,
  type Filtros,
} from '../lib/planes'
import { ir } from '../lib/ruta'
import { botonPrincipal, botonSecundario, estiloChip } from './estilos'
import { TituloSeccion } from './Piezas'
import { AccionesPlan, BotonFavorito, DatosDelPlan, NotasConEnlaces, PastillaCategoria } from './PiezasPlanes'

type Props = { datos: DatosPlanes; onCambio: () => void }

// «🎲 ¿Qué hacemos?»: un plan al azar de los vuestros, con filtros.
export function GeneradorPlanes({ datos, onCambio }: Props) {
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS)
  const [verFiltros, setVerFiltros] = useState(false)
  const [elegido, setElegido] = useState<string | null>(null)
  const [sinResultado, setSinResultado] = useState(false)
  const [tiradas, setTiradas] = useState(0)
  const plan = elegido ? datos.planes.find((p) => p.id === elegido) : undefined
  const activos = [filtros.categoria, filtros.energia, filtros.precio, filtros.duracion, filtros.favoritos || null].filter(Boolean).length

  function sortear() {
    const nuevo = elegirAlAzar(datos.planes, filtros, datos.agenda, elegido)
    setSinResultado(!nuevo)
    setElegido(nuevo?.id ?? null)
    setTiradas((n) => n + 1)
  }

  function cambiar(cambios: Partial<Filtros>) {
    setFiltros({ ...filtros, ...cambios })
    setSinResultado(false)
  }

  if (datos.planes.length === 0) {
    return (
      <section className="tarjeta flex flex-col gap-3 ring-2 ring-planes">
        <TituloSeccion dibujo="🎲" titulo="¿Qué hacemos?" subtitulo="Un plan al azar de los vuestros" color="planes" />
        <p className="text-sm text-stone-600">
          Apuntad los planes que os apetecen (una ruta, una peli, ese restaurante…) y aquí os saldrá uno al azar
          cuando no sepáis qué hacer.
        </p>
        <button type="button" onClick={() => ir('/planes/nuevo')} className={botonPrincipal}>
          + Añadir el primer plan
        </button>
      </section>
    )
  }

  const ultima = plan ? ultimaVez(plan.id, datos.agenda) : null
  const proxima = plan ? proximaVez(plan.id, datos.agenda) : null

  return (
    <section className="tarjeta flex flex-col gap-4 ring-2 ring-planes">
      <TituloSeccion dibujo="🎲" titulo="¿Qué hacemos?" subtitulo="Un plan al azar de los vuestros" color="planes" />

      <button
        type="button"
        onClick={() => setVerFiltros(!verFiltros)}
        aria-expanded={verFiltros}
        className="self-start text-sm font-semibold text-planes-tinta"
      >
        {verFiltros ? '▾' : '▸'} Filtros{activos > 0 ? ` (${activos})` : ''}
      </button>

      {verFiltros && (
        <div className="flex flex-col gap-3 text-sm">
          <Grupo titulo="Categoría">
            <button type="button" aria-pressed={!filtros.categoria} onClick={() => cambiar({ categoria: null })} className={estiloChip(!filtros.categoria)}>
              Todas
            </button>
            {datos.categorias.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={filtros.categoria === c.id}
                onClick={() => cambiar({ categoria: c.id })}
                className={estiloChip(filtros.categoria === c.id)}
              >
                <span aria-hidden="true">{c.dibujo}</span> {c.nombre}
              </button>
            ))}
          </Grupo>
          <Grupo titulo="¿Cómo vais de energía?">
            <button type="button" aria-pressed={!filtros.energia} onClick={() => cambiar({ energia: null })} className={estiloChip(!filtros.energia)}>
              Da igual
            </button>
            {ENERGIAS.map((e) => (
              <button key={e.valor} type="button" aria-pressed={filtros.energia === e.valor} onClick={() => cambiar({ energia: e.valor })} className={estiloChip(filtros.energia === e.valor)}>
                {e.dibujo} {e.texto}
              </button>
            ))}
          </Grupo>
          <Grupo titulo="Presupuesto">
            <button type="button" aria-pressed={!filtros.precio} onClick={() => cambiar({ precio: null })} className={estiloChip(!filtros.precio)}>
              Da igual
            </button>
            {PRECIOS.slice(0, 3).map((p) => (
              <button key={p.valor} type="button" aria-pressed={filtros.precio === p.valor} onClick={() => cambiar({ precio: p.valor })} className={estiloChip(filtros.precio === p.valor)}>
                {p.valor === 'gratis' ? 'Gratis' : `Hasta ${p.texto}`}
              </button>
            ))}
          </Grupo>
          <Grupo titulo="¿Cuánto tiempo tenéis?">
            <button type="button" aria-pressed={!filtros.duracion} onClick={() => cambiar({ duracion: null })} className={estiloChip(!filtros.duracion)}>
              Da igual
            </button>
            {DURACIONES.slice(0, 3).map((d) => (
              <button key={d.valor} type="button" aria-pressed={filtros.duracion === d.valor} onClick={() => cambiar({ duracion: d.valor })} className={estiloChip(filtros.duracion === d.valor)}>
                {d.texto}
              </button>
            ))}
          </Grupo>
          <label className="flex items-center gap-2 font-medium text-stone-700">
            <input
              type="checkbox"
              className="h-5 w-5 accent-marca"
              checked={filtros.favoritos}
              onChange={(e) => cambiar({ favoritos: e.target.checked })}
            />
            ⭐ Solo favoritos
          </label>
          {activos > 0 && (
            <button type="button" onClick={() => cambiar(SIN_FILTROS)} className="self-start text-sm text-stone-500 underline">
              Quitar filtros
            </button>
          )}
        </div>
      )}

      <button type="button" onClick={sortear} className={plan ? botonSecundario : botonPrincipal}>
        {plan ? '🎲 Otro plan' : '🎲 ¡Sorpréndenos!'}
      </button>

      {sinResultado && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Ningún plan cumple estos filtros. Prueba a quitar alguno (si filtráis por energía, precio o tiempo, solo
          salen los planes que lo tienen apuntado).
        </p>
      )}

      {plan && (
        <article key={`${plan.id}-${tiradas}`} className="flex animate-aparecer flex-col gap-3 rounded-3xl bg-planes/50 p-4">
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="text-4xl leading-none">
              {infoCategoria(datos.categorias, plan.categoria_id).dibujo}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-xl leading-tight font-extrabold text-planes-tinta">{plan.nombre}</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <PastillaCategoria categorias={datos.categorias} id={plan.categoria_id} />
                <DatosDelPlan plan={plan} />
              </div>
            </div>
            <BotonFavorito plan={plan} onCambio={onCambio} />
          </div>
          {plan.notas && <NotasConEnlaces texto={plan.notas} />}
          <p className="text-xs text-stone-600">
            {proxima
              ? `📅 Ya está en el calendario: ${fechaCorta(proxima.fecha)} (${cuandoToca(proxima.fecha).toLowerCase()}).`
              : ultima
                ? `La última vez: ${fechaCorta(ultima)}.`
                : 'Todavía no lo habéis hecho.'}
          </p>
          <AccionesPlan key={plan.id} plan={plan} agenda={datos.agenda} onCambio={onCambio} />
        </article>
      )}
    </section>
  )
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 font-medium text-stone-700">{titulo}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  )
}
