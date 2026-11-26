import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  MOTIVOS,
  cancelarAyuda,
  cosas,
  marcarRespuestaVista,
  pedirAyuda,
  responderAyuda,
  respuestasVistas,
  usePeticionesAyuda,
  type PeticionAyuda,
} from '../lib/ayuda'
import { cuandoToca, hoyComoTexto } from '../lib/fechas'
import { mensajeDeError } from '../lib/errores'
import { supabase } from '../lib/supabase'
import type { Miembro, Tarea } from '../lib/tipos'
import { useMiembros } from '../lib/useMiembros'
import { avisoError, botonPrincipal, botonSecundario, campo, estiloChip } from './estilos'
import { Avatar } from './Piezas'

// ---------------------------------------------------------------------
// «🙋 Hoy no puedo»: el botón y la hoja para pedir ayuda
// ---------------------------------------------------------------------

export function BotonHoyNoPuedo({ miUserId }: { miUserId: string }) {
  const [abierta, setAbierta] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className="shrink-0 rounded-full bg-coral-suave px-3 py-1.5 text-sm font-semibold text-coral-tinta transition hover:brightness-95 active:scale-95"
      >
        🙋 Hoy no puedo
      </button>
      {abierta && createPortal(<HojaPedirAyuda miUserId={miUserId} onCerrar={() => setAbierta(false)} />, document.body)}
    </>
  )
}

function HojaPedirAyuda({ miUserId, onCerrar }: { miUserId: string; onCerrar: () => void }) {
  const { miembros } = useMiembros()
  const yo = miembros?.find((m) => m.user_id === miUserId)
  const otras = miembros?.filter((m) => m.id !== yo?.id) ?? []
  const [tareas, setTareas] = useState<Tarea[] | null>(null)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [para, setPara] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  const hoy = hoyComoTexto()
  const elegida = para ?? (otras.length === 1 ? otras[0].id : null)

  // Tus tareas pendientes: las de hoy y las atrasadas, marcadas de entrada.
  useEffect(() => {
    if (!supabase || !yo) return
    let vigente = true
    supabase
      .from('tareas')
      .select('*')
      .eq('completada', false)
      .eq('responsable_id', yo.id)
      .order('fecha_limite', { ascending: true, nullsFirst: false })
      .limit(40)
      .then(({ data, error }) => {
        if (!vigente) return
        if (error) return setError(mensajeDeError(error))
        const lista = data as Tarea[]
        setTareas(lista)
        setMarcadas(new Set(lista.filter((t) => t.fecha_limite && t.fecha_limite <= hoy).map((t) => t.id)))
      })
    return () => {
      vigente = false
    }
  }, [yo, hoy])

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar])

  async function enviar() {
    if (!elegida) return
    setEnviando(true)
    setError(null)
    const fallo = await pedirAyuda(elegida, [...marcadas], mensaje)
    setEnviando(false)
    if (fallo) return setError(fallo)
    const nombre = otras.find((m) => m.id === elegida)?.nombre_visible ?? 'la otra persona'
    setHecho(`💚 Se lo hemos pedido a ${nombre}. Te avisaremos cuando conteste.`)
  }

  function cambiar(id: string) {
    const nuevas = new Set(marcadas)
    if (nuevas.has(id)) nuevas.delete(id)
    else nuevas.add(id)
    setMarcadas(nuevas)
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-stone-900/40 backdrop-blur-[2px] md:items-center md:p-6" onClick={onCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-ayuda"
        className="flex max-h-[92svh] w-full max-w-lg animate-aparecer flex-col gap-4 overflow-y-auto rounded-t-[2rem] bg-crema p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl md:rounded-[2rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="titulo-ayuda" className="text-xl font-extrabold text-coral-tinta">
              🙋 Hoy no puedo
            </h2>
            <p className="text-sm text-stone-600">Pasa a otra persona lo que hoy no te da la vida. Si acepta, lo hace esta vez.</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-stone-500 shadow-sm">
            ✕
          </button>
        </div>

        {hecho ? (
          <>
            <p role="status" className="rounded-2xl bg-marca-suave/60 p-4 font-semibold text-marca">
              {hecho}
            </p>
            <button type="button" onClick={onCerrar} className={botonPrincipal}>
              Listo
            </button>
          </>
        ) : otras.length === 0 && miembros ? (
          <p className="rounded-2xl bg-white p-4 text-sm text-stone-600">Aún no hay nadie más en casa. Invita a alguien desde Ajustes.</p>
        ) : (
          <>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold text-stone-700">¿Qué no puedes hacer?</legend>
              {tareas === null && <p className="text-sm text-stone-400">Cargando…</p>}
              {tareas?.length === 0 && <p className="text-sm text-stone-500">No tienes nada pendiente a tu nombre. ¡Descansa! 💚</p>}
              <ul className="flex flex-col gap-1.5">
                {tareas?.map((t) => (
                  <li key={t.id}>
                    <label className={`flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 ring-1 ${marcadas.has(t.id) ? 'bg-white ring-coral/40' : 'bg-white/60 ring-stone-200'}`}>
                      <input type="checkbox" className="h-5 w-5 shrink-0 accent-coral" checked={marcadas.has(t.id)} onChange={() => cambiar(t.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium break-words">{t.titulo}</span>
                        {t.fecha_limite && (
                          <span className={`block text-xs ${t.fecha_limite < hoy ? 'text-red-700' : 'text-stone-500'}`}>{cuandoToca(t.fecha_limite)}</span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>

            {otras.length > 1 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-semibold text-stone-700">¿A quién se lo pides?</legend>
                <div className="flex flex-wrap gap-2">
                  {otras.map((m) => (
                    <button key={m.id} type="button" aria-pressed={elegida === m.id} onClick={() => setPara(m.id)} className={`${estiloChip(elegida === m.id, true)} inline-flex items-center gap-1.5`}>
                      <Avatar id={m.id} nombre={m.nombre_visible} pequeno /> {m.nombre_visible}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold text-stone-700">
                Un mensaje <span className="font-normal text-stone-400">(opcional)</span>
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {MOTIVOS.map((m) => (
                  <button key={m} type="button" aria-pressed={mensaje === m} onClick={() => setMensaje(mensaje === m ? '' : m)} className={estiloChip(mensaje === m, true)}>
                    {m}
                  </button>
                ))}
              </div>
              <input className={campo} value={mensaje} onChange={(e) => setMensaje(e.target.value)} maxLength={200} aria-label="Mensaje" placeholder="O escribe el tuyo…" />
            </fieldset>

            {error && <p role="alert" className={avisoError}>{error}</p>}
            <button type="button" onClick={enviar} disabled={enviando || marcadas.size === 0 || !elegida} className={botonPrincipal}>
              {enviando
                ? 'Pidiendo…'
                : marcadas.size === 0
                  ? 'Elige qué no puedes hacer'
                  : `🙋 Pedir ayuda con ${cosas(marcadas.size)}${elegida && otras.length > 1 ? ` a ${otras.find((m) => m.id === elegida)?.nombre_visible}` : ''}`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// En el inicio: lo que te piden, lo que has pedido y lo que te contestan
// ---------------------------------------------------------------------

export function TarjetaHoyNoPuedo({ miUserId }: { miUserId: string }) {
  const { peticiones } = usePeticionesAyuda()
  const { miembros } = useMiembros()
  const [titulos, setTitulos] = useState<Record<string, { titulo: string; fecha: string | null }>>({})
  const [vistas, setVistas] = useState(respuestasVistas)
  const yo = miembros?.find((m) => m.user_id === miUserId)

  const paraMi = (peticiones ?? []).filter((p) => p.para_miembro === yo?.id && p.estado === 'pendiente')
  const mias = (peticiones ?? []).filter(
    (p) => p.de_miembro === yo?.id && (p.estado === 'pendiente' || ((p.estado === 'aceptada' || p.estado === 'rechazada') && !vistas.includes(p.id))),
  )
  const ids = [...new Set(paraMi.flatMap((p) => p.tareas))].sort().join(',')

  // Los títulos de las tareas que te piden.
  useEffect(() => {
    if (!supabase || !ids) return
    let vigente = true
    supabase
      .from('tareas')
      .select('id, titulo, fecha_limite')
      .in('id', ids.split(','))
      .then(({ data }) => {
        if (!vigente || !data) return
        setTitulos(Object.fromEntries(data.map((t) => [t.id as string, { titulo: t.titulo as string, fecha: t.fecha_limite as string | null }])))
      })
    return () => {
      vigente = false
    }
  }, [ids])

  if (!yo || !miembros || (paraMi.length === 0 && mias.length === 0)) return null
  const nombre = (id: string) => miembros.find((m) => m.id === id)?.nombre_visible ?? 'Alguien'

  return (
    <div className="flex flex-col gap-3">
      {paraMi.map((p) => (
        <PeticionParaMi key={p.id} p={p} de={miembros.find((m) => m.id === p.de_miembro)} titulos={titulos} />
      ))}
      {mias.map((p) => (
        <PeticionMia
          key={p.id}
          p={p}
          para={nombre(p.para_miembro)}
          onVista={() => {
            marcarRespuestaVista(p.id)
            setVistas(respuestasVistas())
          }}
        />
      ))}
    </div>
  )
}

function PeticionParaMi({ p, de, titulos }: { p: PeticionAyuda; de: Miembro | undefined; titulos: Record<string, { titulo: string; fecha: string | null }> }) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const quien = de?.nombre_visible ?? 'Alguien'

  async function contestar(acepta: boolean) {
    setEnviando(true)
    setError(null)
    const fallo = await responderAyuda(p.id, acepta)
    setEnviando(false)
    if (fallo) setError(fallo)
  }

  return (
    <section className="tarjeta flex flex-col gap-3 ring-2 ring-coral/40" aria-label={`Petición de ayuda de ${quien}`}>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex h-11 w-11 shrink-0 -rotate-6 items-center justify-center rounded-2xl bg-coral-suave text-2xl">
          🙋
        </span>
        <div className="min-w-0">
          <h2 className="text-lg leading-tight font-bold">{quien} no llega hoy</h2>
          <p className="text-sm text-stone-600">{p.mensaje ? `«${p.mensaje}» · ` : ''}¿Te encargas de {cosas(p.tareas.length)}?</p>
        </div>
      </div>
      <ul className="flex flex-col gap-1 rounded-2xl bg-stone-50 p-3 text-sm">
        {p.tareas.map((id) => (
          <li key={id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 break-words">• {titulos[id]?.titulo ?? '…'}</span>
            {titulos[id]?.fecha && <span className="shrink-0 text-xs text-stone-500">{cuandoToca(titulos[id].fecha!)}</span>}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className={avisoError}>{error}</p>}
      <div className="flex flex-col gap-2 md:flex-row">
        <button type="button" disabled={enviando} onClick={() => contestar(true)} className={botonPrincipal}>
          💚 Me encargo
        </button>
        <button type="button" disabled={enviando} onClick={() => contestar(false)} className={botonSecundario}>
          Hoy tampoco puedo
        </button>
      </div>
    </section>
  )
}

function PeticionMia({ p, para, onVista }: { p: PeticionAyuda; para: string; onVista: () => void }) {
  const [error, setError] = useState<string | null>(null)
  if (p.estado === 'pendiente') {
    return (
      <section className="tarjeta flex flex-wrap items-center gap-3" aria-label="Tu petición de ayuda">
        <span aria-hidden="true" className="text-2xl">⏳</span>
        <p className="min-w-0 flex-1 text-sm text-stone-700">
          Le has pedido a <b>{para}</b> que se encargue de {cosas(p.tareas.length)}. Esperando su respuesta…
        </p>
        <button
          type="button"
          onClick={async () => {
            const fallo = await cancelarAyuda(p.id)
            if (fallo) setError(fallo)
          }}
          className="shrink-0 text-sm font-semibold text-stone-500"
        >
          Cancelar
        </button>
        {error && <p role="alert" className={avisoError}>{error}</p>}
      </section>
    )
  }
  const acepta = p.estado === 'aceptada'
  return (
    <section className={`tarjeta flex items-center gap-3 ${acepta ? 'ring-2 ring-marca/30' : ''}`} aria-label="Respuesta a tu petición de ayuda">
      <span aria-hidden="true" className="text-2xl">{acepta ? '💚' : '🙂'}</span>
      <p className="min-w-0 flex-1 text-sm text-stone-700">
        {acepta ? (
          <>
            <b>{para}</b> se encarga de {cosas(p.tareas.length)}. ¡Cuídate!
          </>
        ) : (
          <>
            <b>{para}</b> hoy tampoco puede. Quizá otra persona, o moverlo a otro día.
          </>
        )}
      </p>
      <button type="button" onClick={onVista} className="shrink-0 text-sm font-semibold text-marca">
        Vale
      </button>
    </section>
  )
}
