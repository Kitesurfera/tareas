import { useState, type ReactNode } from 'react'
import {
  DIAS_SEMANA,
  HORAS_DEL_AVISO,
  coherentes,
  enPausa,
  horasDeLaTarde,
  textoHora,
  useAjustesAvisos,
  type AjustesAvisos as Ajustes,
} from '../lib/ajustesAvisos'
import { hoyComoTexto, leerFecha, sumarDias } from '../lib/fechas'
import { avisoError } from './estilos'

// ⏰ Avisos a tu medida (dentro de la tarjeta «🔔 Avisos» de Ajustes): la
// hora del aviso diario, el de la tarde, los días sin aviso, una pausa y el
// resumen del domingo. Cada cambio se guarda solo.
export function AjustesAvisos() {
  const { ajustes, faltaSql, guardar } = useAjustesAvisos()
  const [guardado, setGuardado] = useState<'guardando' | 'guardado' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const hoy = hoyComoTexto()

  if (!ajustes) return <p className="mt-3 text-sm text-stone-400">Cargando tus ajustes…</p>
  if (faltaSql) {
    return (
      <p className="mt-3 rounded-2xl bg-stone-50 p-3 text-sm text-stone-600">
        Para elegir la hora de tus avisos, falta ejecutar en Supabase el SQL de «Avisos a tu medida». Mientras, te llegan
        a las 8:00.
      </p>
    )
  }

  async function cambiar(parcial: Partial<Ajustes>) {
    const nuevos = coherentes({ ...ajustes!, ...parcial })
    setGuardado('guardando')
    setError(null)
    const fallo = await guardar(nuevos)
    setGuardado(fallo ? null : 'guardado')
    if (fallo) setError(fallo)
  }

  const pausado = enPausa(ajustes, hoy)
  const diasConAviso = DIAS_SEMANA.filter((d) => !ajustes.dias_libres.includes(d.n))
  const posiblesTarde = horasDeLaTarde(ajustes.hora)

  return (
    <section aria-labelledby="titulo-a-tu-medida" className="mt-4 flex flex-col gap-4 rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-900/5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="titulo-a-tu-medida" className="font-bold">
          <span aria-hidden="true">⏰</span> A tu medida
        </h3>
        <p role="status" className="text-xs text-stone-500">
          {guardado === 'guardando' ? 'Guardando…' : guardado === 'guardado' ? '✓ Guardado' : ''}
        </p>
      </div>

      {pausado && (
        <div className="flex flex-col gap-2 rounded-2xl bg-sol p-3 text-sm text-sol-tinta">
          <p>
            <span aria-hidden="true">⏸️</span> <b>Avisos en pausa</b> hasta el {diaBonito(ajustes.pausa_hasta!)} (incluido). Vuelven el{' '}
            {diaBonito(sumarDias(ajustes.pausa_hasta!, 1))}.
          </p>
          <button type="button" onClick={() => cambiar({ pausa_hasta: null })} className="self-start rounded-full bg-white px-3 py-1.5 font-semibold ring-1 ring-sol-tinta/20">
            ▶️ Quitar la pausa
          </button>
        </div>
      )}

      <Fila dibujo="🌅" titulo="Aviso diario" texto="Lo que te toca hoy y lo atrasado (si no hay nada, no hay aviso)">
        <SelectorHora etiqueta="Hora del aviso diario" valor={ajustes.hora} horas={HORAS_DEL_AVISO} onCambiar={(hora) => cambiar({ hora })} />
      </Fila>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-stone-700">
          <span aria-hidden="true">📅</span> Qué días
        </legend>
        <div className="grid max-w-xs grid-cols-7 gap-1">
          {DIAS_SEMANA.map((d) => {
            const con = !ajustes.dias_libres.includes(d.n)
            return (
              <button
                key={d.n}
                type="button"
                aria-pressed={con}
                aria-label={d.largo}
                onClick={() => cambiar({ dias_libres: con ? [...ajustes.dias_libres, d.n].sort() : ajustes.dias_libres.filter((x) => x !== d.n) })}
                className={`aspect-square w-full rounded-full text-sm font-semibold ring-1 transition ${con ? 'bg-marca text-white ring-marca' : 'bg-white text-stone-400 line-through ring-stone-300'}`}
              >
                {d.corto}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-stone-500">
          {diasConAviso.length === 7
            ? 'Todos los días. Toca un día para quitarle el aviso.'
            : diasConAviso.length === 0
              ? 'Ningún día: no te llegará el aviso diario.'
              : `Sin aviso: ${DIAS_SEMANA.filter((d) => ajustes.dias_libres.includes(d.n)).map((d) => d.largo).join(', ')}.`}
        </p>
      </fieldset>

      <Fila dibujo="🌙" titulo="Segundo aviso por la tarde" texto="Solo si aún te queda algo de hoy por hacer">
        <Interruptor etiqueta="Segundo aviso por la tarde" activo={ajustes.tarde} desactivado={posiblesTarde.length === 0} onCambiar={(tarde) => cambiar({ tarde })} />
      </Fila>
      {ajustes.tarde && (
        <Fila dibujo="" titulo="¿A qué hora?" texto="">
          <SelectorHora etiqueta="Hora del aviso de la tarde" valor={ajustes.hora_tarde} horas={posiblesTarde} onCambiar={(hora_tarde) => cambiar({ hora_tarde })} />
        </Fila>
      )}

      <Fila dibujo="📆" titulo="Resumen del domingo" texto="Los domingos sobre las 20:00, lo que viene en la semana">
        <Interruptor etiqueta="Resumen del domingo" activo={ajustes.resumen_semanal} onCambiar={(resumen_semanal) => cambiar({ resumen_semanal })} />
      </Fila>

      {!pausado && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold text-stone-700">
            <span aria-hidden="true">⏸️</span> Pausar todos los avisos
          </legend>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => cambiar({ pausa_hasta: hoy })} className="rounded-full bg-white px-3 py-1.5 text-sm font-medium ring-1 ring-stone-300 hover:bg-stone-50">
              Solo hoy
            </button>
            <button type="button" onClick={() => cambiar({ pausa_hasta: sumarDias(hoy, 6) })} className="rounded-full bg-white px-3 py-1.5 text-sm font-medium ring-1 ring-stone-300 hover:bg-stone-50">
              Una semana
            </button>
            <label className="flex items-center gap-2 text-sm text-stone-600">
              Hasta el
              <input
                type="date"
                min={hoy}
                value=""
                aria-label="Pausar hasta el día"
                onChange={(e) => e.target.value && e.target.value >= hoy && cambiar({ pausa_hasta: e.target.value })}
                className="rounded-xl bg-white px-2 py-1.5 ring-1 ring-stone-300"
              />
            </label>
          </div>
          <p className="text-xs text-stone-500">Para vacaciones: ni el aviso diario, ni el de la tarde, ni el resumen del domingo.</p>
        </fieldset>
      )}

      {error && <p role="alert" className={avisoError}>{error}</p>}
    </section>
  )
}

// «viernes 5 de diciembre»
function diaBonito(fecha: string): string {
  return leerFecha(fecha).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
}

function Fila({ dibujo, titulo, texto, children }: { dibujo: string; titulo: string; texto: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-stone-700">
          {dibujo && <span aria-hidden="true">{dibujo} </span>}
          {titulo}
        </p>
        {texto && <p className="text-xs text-stone-500">{texto}</p>}
      </div>
      {children}
    </div>
  )
}

function SelectorHora({ etiqueta, valor, horas, onCambiar }: { etiqueta: string; valor: number; horas: number[]; onCambiar: (h: number) => void }) {
  return (
    <select
      aria-label={etiqueta}
      value={valor}
      onChange={(e) => onCambiar(Number(e.target.value))}
      className="shrink-0 rounded-xl bg-white px-3 py-2 text-base font-semibold text-marca ring-1 ring-stone-300"
    >
      {horas.map((h) => (
        <option key={h} value={h}>
          {textoHora(h)}
        </option>
      ))}
    </select>
  )
}

function Interruptor({ etiqueta, activo, desactivado, onCambiar }: { etiqueta: string; activo: boolean; desactivado?: boolean; onCambiar: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={desactivado}
      onClick={() => onCambiar(!activo)}
      className="shrink-0 disabled:opacity-40"
    >
      <span aria-hidden="true" className={`relative block h-7 w-12 rounded-full transition-colors ${activo ? 'bg-marca' : 'bg-stone-300'}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${activo ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  )
}
