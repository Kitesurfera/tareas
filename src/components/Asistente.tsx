import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { aPropuesta, cargarDatosAcciones, desdePropuesta, SIN_GUARDAR, type Borrador, type DatosAcciones } from '../lib/acciones'
import { preguntarAlAsistente, responder, type Respuesta } from '../lib/asistente'
import { contextoDelHogar, guardarPropuesta, soltar, type ContextoHogar } from '../lib/bandeja'
import { hoyComoTexto, saludoDelMomento } from '../lib/fechas'
import { mensajeDeError } from '../lib/errores'
import { ir } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import { useDictado } from '../lib/useDictado'
import { avisoError, botonPrincipal, botonSecundario, campo } from './estilos'
import { TarjetaAccion } from './TarjetaAccion'

const MAX_LETRAS = 600
const CLAVE_ESCUCHAR = 'tareas.asistente.escuchar'

// ¿Empezar a escuchar al abrir? (Sí, salvo que se haya quitado en este móvil.)
function escucharAlAbrir(): boolean {
  try {
    return localStorage.getItem(CLAVE_ESCUCHAR) !== 'no'
  } catch {
    return true
  }
}

const EJEMPLOS = ['¿Qué me toca hoy?', 'Ya he sacado la basura', 'Recuérdame pagar el IBI el lunes', 'Leche, pilas y pan', '¿Cuándo fue la última vez que cambiamos las sábanas?', 'Sin avisos hasta el lunes']

type Resultado = {
  dicho: string
  borradores: Borrador[]
  respuestas: Respuesta[]
  contexto: ContextoHogar
  datos: DatosAcciones | null
}

// El asistente del botón 🧠: te saluda, te escucha (o escribes) y lo
// convierte en acciones que revisas y confirmas, y en respuestas. También
// se puede dejar en la bandeja para repartirlo luego.
export function Asistente({ hogarId, miUserId, nombre, enBandeja, onCerrar }: { hogarId: string; miUserId: string; nombre: string; enBandeja: number | null; onCerrar: () => void }) {
  const saludo = saludoDelMomento()
  const [texto, setTexto] = useState('')
  const [antesDeDictar, setAntesDeDictar] = useState('')
  const [pensando, setPensando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [escuchar, setEscuchar] = useState(escucharAlAbrir)
  const porVoz = useRef(false)
  const caja = useRef<HTMLTextAreaElement>(null)
  const contexto = useRef<ContextoHogar | null>(null)
  const dictado = useDictado((t) => {
    porVoz.current = true
    setTexto(`${antesDeDictar} ${t}`.trim().slice(0, MAX_LETRAS))
  })

  // Al abrir: a escuchar (si se puede y no se ha quitado); si no, a escribir.
  // (Nada más pintarse, aún «dentro» del toque en el botón 🧠: algunos
  // móviles solo dejan usar el micrófono así.)
  const empezado = useRef(false)
  useLayoutEffect(() => {
    if (empezado.current) return
    empezado.current = true
    if (escucharAlAbrir() && dictado.soportado) {
      setAntesDeDictar('')
      dictado.empezar()
    } else caja.current?.focus()
  }, [dictado])

  // Cuando te callas (el dictado se para solo), lo preparo.
  const escuchaba = useRef(false)
  useEffect(() => {
    if (escuchaba.current && !dictado.escuchando && porVoz.current && texto.trim()) void hacer()
    escuchaba.current = dictado.escuchando
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictado.escuchando])

  async function hacer(frase = texto) {
    const dicho = frase.replace(/\s+/g, ' ').trim()
    if (dicho.length < 2 || pensando) return
    if (dictado.escuchando) dictado.parar()
    porVoz.current = false
    setPensando(true)
    setError(null)
    setAviso(null)
    try {
      contexto.current ??= await contextoDelHogar(miUserId)
      const c = contexto.current
      const { acciones, preguntas } = await preguntarAlAsistente(dicho, c)
      const [datos, respuestas] = await Promise.all([acciones.length > 0 ? cargarDatosAcciones(c) : Promise.resolve(null), Promise.all(preguntas.map((p) => responder(p, c)))])
      setResultado({ dicho, borradores: acciones.map((a) => desdePropuesta(a, datos)), respuestas, contexto: c, datos })
      setTexto('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo ha fallado. Prueba otra vez.')
    }
    setPensando(false)
  }

  async function aLaBandeja(frase: string) {
    if (dictado.escuchando) dictado.parar()
    const r = await soltar(hogarId, frase)
    if ('error' in r) return setError(r.error)
    setTexto('')
    setResultado(null)
    setAviso(r.guardadas === 1 ? '🧠 Guardado en tu bandeja.' : `🧠 ${r.guardadas} cosas guardadas en tu bandeja.`)
  }

  function cambiar(clave: string, cambios: Partial<Borrador>) {
    setResultado((r) => (r ? { ...r, borradores: r.borradores.map((b) => (b.clave === clave ? { ...b, ...cambios, error: null } : b)) } : r))
  }

  async function guardarTodo() {
    if (!resultado) return
    setGuardando(true)
    const nuevos = [...resultado.borradores]
    for (let i = 0; i < nuevos.length; i++) {
      const b = nuevos[i]
      if (!b.guardar || b.estado === 'guardado' || SIN_GUARDAR.includes(b.destino)) continue
      const p = aPropuesta(b)
      const fallo = 'error' in p ? p.error : await guardarPropuesta(hogarId, p, { miMiembroId: resultado.datos?.miMiembroId ?? null, planes: resultado.datos?.planes ?? [] })
      nuevos[i] = fallo ? { ...b, error: fallo } : { ...b, estado: 'guardado', error: null }
    }
    setResultado({ ...resultado, borradores: nuevos })
    setGuardando(false)
    // Que se entere el resto de la app (listas, calendario, ayuda…).
    window.dispatchEvent(new Event('ayuda-cambiada'))
    window.dispatchEvent(new Event('plantillas-cambiadas'))
    const hechas = nuevos.filter((b) => b.estado === 'guardado').length
    if (!nuevos.some((b) => b.error)) setAviso(hechas === 1 ? '✓ Hecho.' : `✓ Hechas ${hechas} cosas.`)
  }

  async function marcarHecha(tareaId: string) {
    if (!supabase) return
    const { error } = await supabase.rpc('completar_tarea', { tarea_id: tareaId, hecha_el: hoyComoTexto() })
    if (error) return setError(mensajeDeError(error))
    setResultado((r) => (r ? { ...r, respuestas: r.respuestas.map((x) => ({ ...x, filas: x.filas.map((f) => (f.tareaId === tareaId ? { ...f, tareaId: undefined, texto: `✓ ${f.texto}` } : f)) })) } : r))
  }

  const aGuardar = resultado?.borradores.filter((b) => b.guardar && b.estado !== 'guardado' && !SIN_GUARDAR.includes(b.destino)) ?? []
  const nadaEntendido = resultado && resultado.borradores.length === 0 && resultado.respuestas.length === 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="titulo-cabeza" className="text-xl font-extrabold text-marca">
            {saludo.dibujo} {saludo.texto}, {nombre}
          </h2>
          <p className="text-sm text-stone-600">¿Qué necesitas? Pídemelo, pregúntame o suéltalo.</p>
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-stone-500 shadow-sm">
          ✕
        </button>
      </div>

      {dictado.escuchando && (
        <p role="status" className="flex items-center gap-2 rounded-2xl bg-coral-suave p-3 text-sm font-semibold text-coral-tinta">
          <span aria-hidden="true" className="text-xl motion-safe:animate-pulse">🎙️</span> Te escucho… habla y, al callarte, lo preparo.
        </p>
      )}

      <textarea
        ref={caja}
        className={`${campo} min-h-20`}
        value={texto}
        onChange={(e) => {
          porVoz.current = false
          setTexto(e.target.value.slice(0, MAX_LETRAS))
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void hacer()
          }
        }}
        enterKeyHint="go"
        maxLength={MAX_LETRAS}
        aria-label="Qué necesitas"
        placeholder="Por ejemplo: ya he regado el ficus, ¿qué me toca hoy?"
      />
      <div className="flex gap-2">
        {dictado.soportado && (
          <button
            type="button"
            onClick={() => {
              if (dictado.escuchando) return dictado.parar()
              setAntesDeDictar(texto)
              dictado.empezar()
            }}
            aria-pressed={dictado.escuchando}
            className={`${botonSecundario.replace('w-full ', '')} shrink-0 px-4 ${dictado.escuchando ? 'bg-coral-suave text-coral-tinta ring-coral/30' : ''}`}
          >
            {dictado.escuchando ? '⏹️ Parar' : '🎤 Hablar'}
          </button>
        )}
        <button type="button" onClick={() => hacer()} disabled={pensando || texto.trim().length < 2} className={`${botonPrincipal} flex-1`}>
          {pensando ? 'Pensando…' : '✨ Hazlo'}
        </button>
      </div>
      {texto.trim() && (
        <button type="button" onClick={() => aLaBandeja(texto)} className="-mt-2 self-start text-sm font-semibold text-marca">
          🧠 Mejor guárdalo en mi bandeja
        </button>
      )}

      {dictado.error && <p role="alert" className={avisoError}>{dictado.error}</p>}
      {error && <p role="alert" className={avisoError}>{error}</p>}
      {aviso && <p role="status" className="rounded-xl bg-marca-suave p-3 text-sm font-semibold text-marca">{aviso}</p>}

      {!resultado && !pensando && !texto.trim() && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-stone-500">Prueba con…</p>
          <div className="flex flex-wrap gap-1.5">
            {EJEMPLOS.map((e) => (
              <button key={e} type="button" onClick={() => void hacer(e)} className="rounded-full bg-white px-3 py-1.5 text-sm text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50">
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      {resultado && (
        <section aria-label="Lo que he entendido" className="flex flex-col gap-3">
          <p className="text-xs font-semibold text-stone-500">Has dicho: «{resultado.dicho}»</p>

          {resultado.respuestas.map((r, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-2xl bg-white p-3 ring-1 ring-stone-200">
              <h3 className="font-bold">
                <span aria-hidden="true">{r.dibujo}</span> {r.titulo}
              </h3>
              {r.filas.length === 0 ? (
                <p className="text-sm text-stone-500">{r.vacio}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-stone-100">
                  {r.filas.map((f, j) => (
                    <li key={j} className="flex items-center gap-2 py-1.5">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium break-words">{f.texto}</span>
                        {f.detalle && <span className="block text-xs text-stone-500">{f.detalle}</span>}
                      </span>
                      {f.tareaId && (
                        <button type="button" onClick={() => marcarHecha(f.tareaId!)} className="shrink-0 rounded-full bg-marca-suave px-3 py-1 text-xs font-semibold text-marca">
                          ✓ Hecha
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {r.enlace && (
                <button
                  type="button"
                  onClick={() => {
                    onCerrar()
                    ir(r.enlace!.ruta)
                  }}
                  className="self-start text-sm font-semibold text-marca"
                >
                  {r.enlace.texto}
                </button>
              )}
            </div>
          ))}

          {resultado.borradores.map((b) => (
            <TarjetaAccion key={b.clave} b={b} contexto={resultado.contexto} datos={resultado.datos} onCambiar={(c) => cambiar(b.clave, c)} onSalir={onCerrar} />
          ))}
          {aGuardar.length > 0 && (
            <button type="button" onClick={guardarTodo} disabled={guardando} className={botonPrincipal}>
              {guardando ? 'Haciéndolo…' : aGuardar.length === 1 ? '✅ Hazlo' : `✅ Hacer las ${aGuardar.length}`}
            </button>
          )}
          {resultado.borradores.some((b) => b.error) && <p role="alert" className={avisoError}>Algo no se ha podido hacer: míralo arriba (en rojo).</p>}

          {nadaEntendido && (
            <div className="flex flex-col gap-2 rounded-2xl bg-stone-50 p-3 text-sm text-stone-600">
              <p>No te he entendido del todo. ¿Lo guardo en tu bandeja para repartirlo luego?</p>
              <button type="button" onClick={() => aLaBandeja(resultado.dicho)} className={botonSecundario}>
                🧠 Guardar en la bandeja
              </button>
            </div>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 pt-3">
        <button
          type="button"
          onClick={() => {
            onCerrar()
            ir('/bandeja')
          }}
          className="text-sm font-semibold text-marca"
        >
          {enBandeja ? `Ver mi bandeja (${enBandeja}) ›` : 'Ver mi bandeja ›'}
        </button>
        {dictado.soportado && (
          <label className="flex items-center gap-2 text-xs text-stone-600">
            <input
              type="checkbox"
              className="h-4 w-4 accent-marca"
              checked={escuchar}
              onChange={(e) => {
                setEscuchar(e.target.checked)
                try {
                  localStorage.setItem(CLAVE_ESCUCHAR, e.target.checked ? 'si' : 'no')
                } catch {
                  // Sin almacenamiento: vale solo para esta vez.
                }
              }}
            />
            🎤 Escuchar al abrir
          </label>
        )}
      </div>
    </div>
  )
}
