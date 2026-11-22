import { useState } from 'react'
import { moverMes, nombreDelMes } from '../lib/cargaMental'
import { cuandoToca, fechaCorta, fechaLarga, hoyComoTexto } from '../lib/fechas'
import {
  cambiarFecha,
  infoCategoria,
  marcarHecho,
  programar,
  quitarDelCalendario,
  type DatosPlanes,
  type EntradaAgenda,
} from '../lib/planes'
import { avisoError, campoBase } from './estilos'
import { TituloSeccion } from './Piezas'


type Props = { datos: DatosPlanes; onCambio: () => void }

const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const dosCifras = (n: number) => String(n).padStart(2, '0')

// «📅 Calendario»: el mes con los planes de cada día, con el color de su categoría.
export function CalendarioPlanes({ datos, onCambio }: Props) {
  const hoy = hoyComoTexto()
  const [mes, setMes] = useState(hoy.slice(0, 7))
  const [dia, setDia] = useState<string | null>(null)

  const [anio, m] = mes.split('-').map(Number)
  const huecos = (new Date(anio, m - 1, 1).getDay() + 6) % 7 // la semana empieza en lunes
  const diasDelMes = new Date(anio, m, 0).getDate()
  const delMes = datos.agenda.filter((e) => e.fecha.startsWith(mes))
  const planDe = (e: EntradaAgenda) => datos.planes.find((p) => p.id === e.plan_id)
  const delDia = (fecha: string) => delMes.filter((e) => e.fecha === fecha)

  // Para saltar a un día (por ejemplo, a hoy al marcar como hecho un plan
  // que era para más adelante).
  const verDia = (fecha: string) => {
    setMes(fecha.slice(0, 7))
    setDia(fecha)
  }

  const proximos = datos.agenda
    .filter((e) => !e.hecho && e.fecha >= hoy)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .slice(0, 6)

  return (
    <section className="tarjeta flex flex-col gap-4">
      <TituloSeccion dibujo="📅" titulo="Calendario" subtitulo="Los planes que tenéis y los que hicisteis" color="planes" />

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            setMes(moverMes(mes, -1))
            setDia(null)
          }}
          aria-label="Mes anterior"
          className="flex h-10 w-10 items-center justify-center rounded-full text-xl text-planes-tinta hover:bg-planes"
        >
          ‹
        </button>
        <h3 className="font-bold first-letter:uppercase">{nombreDelMes(mes)}</h3>
        <button
          type="button"
          onClick={() => {
            setMes(moverMes(mes, 1))
            setDia(null)
          }}
          aria-label="Mes siguiente"
          className="flex h-10 w-10 items-center justify-center rounded-full text-xl text-planes-tinta hover:bg-planes"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {DIAS_SEMANA.map((d) => (
          <span key={d} className="text-xs font-semibold text-stone-400" aria-hidden="true">
            {d}
          </span>
        ))}
        {Array.from({ length: huecos }, (_, i) => (
          <span key={`hueco-${i}`} />
        ))}
        {Array.from({ length: diasDelMes }, (_, i) => {
          const fecha = `${mes}-${dosCifras(i + 1)}`
          const entradas = delDia(fecha)
          const elegido = dia === fecha
          const esHoy = fecha === hoy
          return (
            <button
              key={fecha}
              type="button"
              onClick={() => setDia(elegido ? null : fecha)}
              aria-pressed={elegido}
              aria-label={`${i + 1}${entradas.length ? `: ${entradas.length === 1 ? '1 plan' : `${entradas.length} planes`}` : ''}`}
              className={`flex min-h-14 flex-col items-center gap-0.5 rounded-xl p-1 text-sm transition ${
                elegido ? 'bg-planes ring-2 ring-planes-tinta' : esHoy ? 'ring-2 ring-planes-tinta/50' : 'hover:bg-stone-50'
              } ${fecha < hoy && !elegido ? 'text-stone-400' : ''}`}
            >
              <span className={esHoy ? 'font-extrabold text-planes-tinta' : 'font-medium'}>{i + 1}</span>
              <span className="flex flex-wrap justify-center gap-0.5">
                {entradas.slice(0, 3).map((e) => {
                  const info = infoCategoria(datos.categorias, planDe(e)?.categoria_id ?? null)
                  return (
                    <span
                      key={e.id}
                      aria-hidden="true"
                      className={`flex h-5 w-5 items-center justify-center rounded-md text-[11px] leading-none ${info.suave} ${e.hecho ? 'opacity-50' : ''}`}
                    >
                      {info.dibujo}
                    </span>
                  )
                })}
                {entradas.length > 3 && <span className="text-[10px] text-stone-500">+{entradas.length - 3}</span>}
              </span>
            </button>
          )
        })}
      </div>

      {/* Leyenda: el color de cada categoría */}
      {datos.categorias.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-600" aria-label="Colores de las categorías">
          {datos.categorias.map((c) => (
            <li key={c.id} className="flex items-center gap-1">
              <span aria-hidden="true" className={`h-3 w-3 rounded-full ${infoCategoria(datos.categorias, c.id).punto}`} />
              {c.nombre}
            </li>
          ))}
        </ul>
      )}

      {dia ? (
        <DiaElegido fecha={dia} entradas={delDia(dia)} datos={datos} onCambio={onCambio} onVerDia={verDia} />
      ) : (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-stone-500">Próximos planes</h3>
          {proximos.length === 0 ? (
            <p className="text-sm text-stone-500">
              Nada en el calendario. Sacad un plan al azar o tocad un día para añadir uno.
            </p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {proximos.map((e) => (
                <FilaAgenda key={e.id} entrada={e} datos={datos} onCambio={onCambio} onVerDia={verDia} conFecha />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

// Los planes de un día, y elegir a mano uno de vuestra lista para ese día.
function DiaElegido({ fecha, entradas, datos, onCambio, onVerDia }: { fecha: string; entradas: EntradaAgenda[]; datos: DatosPlanes; onCambio: () => void; onVerDia: (fecha: string) => void }) {
  const [planId, setPlanId] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const yaEstan = new Set(entradas.map((e) => e.plan_id))
  const disponibles = datos.planes.filter((p) => !yaEstan.has(p.id))
  const sinCategoria = disponibles.filter((p) => !datos.categorias.some((c) => c.id === p.categoria_id))

  async function anadir() {
    const plan = datos.planes.find((p) => p.id === planId)
    if (!plan) return
    setEnviando(true)
    setError(null)
    const fallo = await programar(plan, fecha)
    setEnviando(false)
    if (fallo) return setError(fallo)
    setPlanId('')
    onCambio()
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-stone-500 first-letter:uppercase">{fechaLarga(fecha)}</h3>
      {entradas.length === 0 ? (
        <p className="text-sm text-stone-500">Ningún plan este día.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {entradas.map((e) => (
            <FilaAgenda key={e.id} entrada={e} datos={datos} onCambio={onCambio} onVerDia={onVerDia} />
          ))}
        </ul>
      )}
      {disponibles.length > 0 && (
        <div className="mt-1 flex flex-wrap items-end gap-2 rounded-2xl bg-stone-50 p-3">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-stone-600">
            Añadir un plan este día
            <select className={`${campoBase} w-full px-3`} value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">Elige uno de vuestra lista…</option>
              {datos.categorias.map((c) => {
                const suyos = disponibles.filter((p) => p.categoria_id === c.id)
                if (suyos.length === 0) return null
                return (
                  <optgroup key={c.id} label={`${c.dibujo} ${c.nombre}`}>
                    {suyos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.favorito ? '⭐ ' : ''}
                        {p.nombre}
                      </option>
                    ))}
                  </optgroup>
                )
              })}
              {sinCategoria.length > 0 && (
                <optgroup label="📌 Sin categoría">
                  {sinCategoria.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <button
            type="button"
            onClick={anadir}
            disabled={!planId || enviando}
            className="rounded-full bg-linear-to-b from-marca to-[#0b5f58] px-5 py-3 font-semibold text-white disabled:opacity-60"
          >
            Añadir
          </button>
        </div>
      )}
      {error && <p role="alert" className={avisoError}>{error}</p>}
    </div>
  )
}

// Un plan del calendario: «Lo hicimos», cambiar el día o quitarlo.
type Fila = { entrada: EntradaAgenda; datos: DatosPlanes; onCambio: () => void; onVerDia: (fecha: string) => void; conFecha?: boolean }

function FilaAgenda({ entrada, datos, onCambio, onVerDia, conFecha = false }: Fila) {
  const [moviendo, setMoviendo] = useState(false)
  const [fecha, setFecha] = useState(entrada.fecha)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const plan = datos.planes.find((p) => p.id === entrada.plan_id)
  const info = infoCategoria(datos.categorias, plan?.categoria_id ?? null)
  const hoy = hoyComoTexto()
  // Si era para más adelante y ya lo habéis hecho, pasa a hoy (y se enseña hoy).
  const esFuturo = entrada.fecha > hoy

  async function hacer(accion: () => Promise<string | null>, despues?: () => void) {
    setEnviando(true)
    setError(null)
    const fallo = await accion()
    setEnviando(false)
    if (fallo) return setError(fallo)
    setMoviendo(false)
    onCambio()
    despues?.()
  }

  const boton = 'rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60'

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg ${info.suave}`}>
          {info.dibujo}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`font-medium ${entrada.hecho ? 'text-stone-500 line-through decoration-stone-300' : ''}`}>
            {plan?.nombre ?? 'Plan'}
          </p>
          <p className="text-sm text-stone-500">
            {entrada.hecho ? '✅ Lo hicisteis' : conFecha ? `${fechaCorta(entrada.fecha)} · ${cuandoToca(entrada.fecha)}` : info.nombre}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 pl-12">
        {entrada.hecho ? (
          <button type="button" disabled={enviando} onClick={() => hacer(() => marcarHecho(entrada, false))} className={`${boton} text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50`}>
            ↩️ Deshacer
          </button>
        ) : (
          <button
            type="button"
            disabled={enviando}
            onClick={() => hacer(() => marcarHecho(entrada, true), esFuturo ? () => onVerDia(hoy) : undefined)}
            className={`${boton} bg-marca-suave text-marca hover:brightness-95`}
          >
            {esFuturo ? '✅ Lo hicimos hoy' : '✅ Lo hicimos'}
          </button>
        )}
        <button type="button" disabled={enviando} onClick={() => setMoviendo(!moviendo)} aria-expanded={moviendo} className={`${boton} text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50`}>
          📅 Cambiar día
        </button>
        <button
          type="button"
          disabled={enviando}
          onClick={() => {
            if (window.confirm(`¿Quitar «${plan?.nombre ?? 'este plan'}» del calendario?`)) void hacer(() => quitarDelCalendario(entrada))
          }}
          className={`${boton} text-red-700 ring-1 ring-red-200 hover:bg-red-50`}
        >
          Quitar
        </button>
      </div>
      {moviendo && (
        <div className="flex items-end gap-2 pl-12">
          <input type="date" className={`${campoBase} flex-1`} value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Nuevo día" />
          <button
            type="button"
            disabled={!fecha || fecha === entrada.fecha || enviando}
            onClick={() => hacer(() => cambiarFecha(entrada, fecha))}
            className="rounded-full bg-linear-to-b from-marca to-[#0b5f58] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            Guardar
          </button>
        </div>
      )}
      {error && <p role="alert" className={avisoError}>{error}</p>}
    </li>
  )
}
