import { useEffect, useRef, useState } from 'react'
import { aPropuesta, cargarDatosAcciones, desdePropuesta, SIN_GUARDAR, type Borrador, type DatosAcciones } from '../lib/acciones'
import { borrarNotas, cambiarNota, contextoDelHogar, guardarPropuesta, repartir, useBandeja, type ContextoHogar, type NotaBandeja } from '../lib/bandeja'
import { volver } from '../lib/ruta'
import { avisoError, botonPrincipal, botonSecundario, campoBase } from './estilos'
import { TituloSeccion, Vacio } from './Piezas'
import { CajaCabeza } from './CajaCabeza'
import { TarjetaAccion } from './TarjetaAccion'

type Props = { hogarId: string; miUserId: string }

const MAX_POR_REPARTO = 30

// #/bandeja: «🧠 Tu bandeja». Lo que soltaste con el botón 🧠; con
// «✨ Repartir», la IA propone dónde va cada cosa y tú lo revisas.
export function PantallaBandeja({ hogarId, miUserId }: Props) {
  const { notas, error, recargar } = useBandeja()
  const [reparto, setReparto] = useState<{ borradores: Borrador[]; contexto: ContextoHogar; datos: DatosAcciones; notas: NotaBandeja[] } | null>(null)
  const [repartiendo, setRepartiendo] = useState(false)
  const [errorReparto, setErrorReparto] = useState<string | null>(null)
  const [resumen, setResumen] = useState<string | null>(null)
  const caja = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!reparto) return
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    caja.current?.scrollIntoView({ behavior: quieto ? 'auto' : 'smooth', block: 'start' })
  }, [reparto])

  async function empezarReparto() {
    if (!notas || notas.length === 0) return
    setRepartiendo(true)
    setErrorReparto(null)
    setResumen(null)
    try {
      const estas = notas.slice(0, MAX_POR_REPARTO)
      const contexto = await contextoDelHogar(miUserId)
      const [propuestas, datos] = await Promise.all([repartir(estas, contexto), cargarDatosAcciones(contexto)])
      setReparto({ borradores: propuestas.map((p) => desdePropuesta(p, datos)), contexto, datos, notas: estas })
    } catch (e) {
      setErrorReparto(e instanceof Error ? e.message : 'No se ha podido repartir.')
    } finally {
      setRepartiendo(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-3xl lg:px-10 lg:py-10">
      <button type="button" onClick={() => volver('/')} className="self-start text-sm font-medium text-marca">
        ← Inicio
      </button>
      <div>
        <h1 className="text-2xl font-extrabold text-marca">🧠 Tu bandeja</h1>
        <p className="mt-1 text-stone-600">Lo que soltaste para no tenerlo en la cabeza. Solo la ves tú; cuando tengas un momento, repártela.</p>
      </div>

      {error && <p role="alert" className={avisoError}>{error}</p>}

      <section className="tarjeta flex flex-col gap-3">
        <TituloSeccion dibujo="✍️" titulo="Soltar algo más" color="inicio" />
        <CajaCabeza hogarId={hogarId} onGuardado={recargar} />
      </section>

      {notas && (
        <section className="tarjeta flex flex-col gap-3">
          <TituloSeccion dibujo="📥" titulo="En tu bandeja" subtitulo={notas.length === 1 ? '1 cosa' : `${notas.length} cosas`} color="inicio" />
          {notas.length === 0 ? (
            <Vacio dibujo="🌿" color="inicio">
              {resumen ?? 'Cabeza despejada. Cuando algo te ronde, toca el botón 🧠.'}
            </Vacio>
          ) : (
            <>
              <ul className="flex flex-col gap-1.5">
                {notas.map((n) => (
                  <FilaNota key={n.id} nota={n} onCambio={recargar} />
                ))}
              </ul>
              {resumen && (
                <p role="status" className="text-sm font-semibold text-marca">
                  {resumen}
                </p>
              )}
              {!reparto && (
                <button type="button" onClick={empezarReparto} disabled={repartiendo} className={botonPrincipal}>
                  {repartiendo
                    ? 'Repartiendo…'
                    : notas.length > MAX_POR_REPARTO
                      ? `✨ Repartir las ${MAX_POR_REPARTO} primeras con la IA`
                      : '✨ Repartir con la IA'}
                </button>
              )}
              {errorReparto && <p role="alert" className={avisoError}>{errorReparto}</p>}
            </>
          )}
        </section>
      )}

      {reparto && (
        <section ref={caja} className="scroll-mt-4">
          <Revision
            hogarId={hogarId}
            reparto={reparto}
            onCambiar={(borradores) => setReparto({ ...reparto, borradores })}
            onCancelar={() => setReparto(null)}
            onTerminado={(texto) => {
              setReparto(null)
              setResumen(texto)
              recargar()
            }}
          />
        </section>
      )}
    </main>
  )
}

function FilaNota({ nota, onCambio }: { nota: NotaBandeja; onCambio: () => void }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(nota.texto)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    const fallo = await cambiarNota(nota.id, texto)
    if (fallo) return setError(fallo)
    setEditando(false)
    onCambio()
  }

  return (
    <li className="flex flex-col gap-1 rounded-2xl bg-stone-50 px-3 py-2">
      {editando ? (
        <div className="flex gap-2">
          <input className={`${campoBase} min-w-0 flex-1 py-2`} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={500} aria-label="Cambiar la nota" autoFocus />
          <button type="button" onClick={guardar} disabled={!texto.trim()} className="text-sm font-semibold text-marca">
            Guardar
          </button>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 py-1 break-words">{nota.texto}</p>
          <button type="button" onClick={() => setEditando(true)} aria-label={`Cambiar «${nota.texto}»`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm hover:bg-white">
            ✏️
          </button>
          <button
            type="button"
            onClick={async () => {
              const fallo = await borrarNotas([nota.id])
              if (fallo) setError(fallo)
              else onCambio()
            }}
            aria-label={`Borrar «${nota.texto}»`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm hover:bg-white"
          >
            🗑️
          </button>
        </div>
      )}
      {error && <p role="alert" className={avisoError}>{error}</p>}
    </li>
  )
}

// ---------------------------------------------------------------------
// La revisión: cada propuesta se puede cambiar de sitio, corregir o no guardar
// (las tarjetas, en TarjetaAccion.tsx, las comparte con el asistente 🧠)
// ---------------------------------------------------------------------

function Revision({
  hogarId,
  reparto,
  onCambiar,
  onCancelar,
  onTerminado,
}: {
  hogarId: string
  reparto: { borradores: Borrador[]; contexto: ContextoHogar; datos: DatosAcciones; notas: NotaBandeja[] }
  onCambiar: (b: Borrador[]) => void
  onCancelar: () => void
  onTerminado: (resumen: string) => void
}) {
  const { borradores, contexto, datos, notas } = reparto
  const [guardando, setGuardando] = useState(false)
  const aGuardar = borradores.filter((b) => b.guardar && b.estado !== 'guardado' && !SIN_GUARDAR.includes(b.destino))

  function cambiar(clave: string, cambios: Partial<Borrador>) {
    onCambiar(borradores.map((b) => (b.clave === clave ? { ...b, ...cambios, error: null } : b)))
  }

  async function guardarTodo() {
    setGuardando(true)
    const nuevos = [...borradores]
    for (let i = 0; i < nuevos.length; i++) {
      const b = nuevos[i]
      if (!b.guardar || b.estado === 'guardado' || SIN_GUARDAR.includes(b.destino)) continue
      const propuesta = aPropuesta(b)
      const fallo = 'error' in propuesta ? propuesta.error : await guardarPropuesta(hogarId, propuesta, { miMiembroId: datos.miMiembroId, planes: datos.planes })
      nuevos[i] = fallo ? { ...b, error: fallo } : { ...b, estado: 'guardado', error: null }
    }
    onCambiar(nuevos)
    // Se quitan de la bandeja las notas con todo guardado (lo que se dejó
    // sin marcar o «en la bandeja» se queda).
    const terminadas = notas.filter((n) => {
      const suyos = nuevos.filter((b) => b.nota === n.id)
      return suyos.length > 0 && suyos.every((b) => b.estado === 'guardado')
    })
    await borrarNotas(terminadas.map((n) => n.id))
    setGuardando(false)
    const guardados = nuevos.filter((b) => b.estado === 'guardado').length
    const conError = nuevos.filter((b) => b.error).length
    if (conError === 0) {
      onTerminado(`✓ ${guardados === 1 ? 'Guardada 1 cosa' : `Guardadas ${guardados} cosas`} en su sitio.`)
    }
  }

  return (
    <div className="tarjeta flex flex-col gap-4">
      <TituloSeccion dibujo="✨" titulo="Así lo repartiría" subtitulo="Revisa, cambia lo que quieras y guarda" color="inicio" />
      {notas.map((n) => {
        const suyos = borradores.filter((b) => b.nota === n.id)
        return (
          <div key={n.id} className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-stone-500">«{n.texto}»</p>
            {suyos.map((b) => (
              <TarjetaAccion key={b.clave} b={b} contexto={contexto} datos={datos} onCambiar={(c) => cambiar(b.clave, c)} />
            ))}
          </div>
        )
      })}
      <div className="sticky bottom-4 z-10 -mx-2 flex flex-col gap-2 rounded-2xl bg-white/95 p-2 shadow-[0_-6px_20px_-12px_rgb(60_40_20/0.4)] ring-1 ring-stone-900/5 backdrop-blur">
        {borradores.some((b) => b.error) && <p role="alert" className={avisoError}>Algunas cosas no se han podido guardar: míralas arriba (en rojo).</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onCancelar} className={`${botonSecundario} flex-1`}>
            Cancelar
          </button>
          <button type="button" onClick={guardarTodo} disabled={guardando || aGuardar.length === 0} className={`${botonPrincipal} flex-[2]`}>
            {guardando ? 'Guardando…' : aGuardar.length === 0 ? 'Nada que guardar' : aGuardar.length === 1 ? 'Guardar 1 cosa' : `Guardar ${aGuardar.length} cosas`}
          </button>
        </div>
      </div>
    </div>
  )
}
