import { useState, type FormEvent, type ReactNode } from 'react'
import { hoyComoTexto } from '../lib/fechas'
import {
  MESES,
  PRIORIDADES,
  TIPOS_FECHA,
  borrar,
  cambiarReserva,
  cuandoFalta,
  cuantosAnios,
  diaYMes,
  euros,
  guardar,
  proximasFechas,
  quienRecordado,
  quitarReserva,
  recordarQuien,
  reservar,
  useRegalos,
  type DatosRegalos,
  type Deseo,
  type FechaEspecial,
  type IdeaRegalo,
  type PersonaRegalo,
  type TipoFecha,
} from '../lib/regalos'
import { volver } from '../lib/ruta'
import type { Miembro } from '../lib/tipos'
import { useMiembros } from '../lib/useMiembros'
import { avisoError, botonPrincipal, botonSecundario, campo, estiloChip } from './estilos'
import { Avatar, Etiqueta, TituloSeccion, Vacio } from './Piezas'

type Props = { hogarId: string; miUserId: string }

// #/regalos: fechas especiales, vuestras listas de deseos e ideas para regalar.
export function PantallaRegalos({ hogarId, miUserId }: Props) {
  const { datos, error, recargar } = useRegalos()
  const { miembros } = useMiembros()
  const [quien, setQuien] = useState(quienRecordado)
  const yo = miembros?.find((m) => m.user_id === miUserId)

  function elegir(nuevo: string) {
    setQuien(nuevo)
    recordarQuien(nuevo)
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-6xl lg:px-10 lg:py-10">
      <button type="button" onClick={() => volver('/tareas')} className="self-start text-sm font-medium text-marca">
        ← Tareas
      </button>
      <div>
        <h1 className="text-2xl font-extrabold text-tareas-tinta lg:text-3xl">🎁 Regalos</h1>
        <p className="mt-1 text-stone-600">Fechas especiales, vuestras listas de deseos e ideas. Lo que es sorpresa no lo ve quien lo va a recibir.</p>
      </div>

      {error && <p role="alert" className={avisoError}>{error}</p>}
      {(datos === null || miembros === null) && !error && <p className="text-center text-stone-400">Cargando…</p>}

      {datos && miembros && yo && (
        // En el ordenador: las fechas a la izquierda; las listas e ideas a la derecha.
        <div className="contents lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-start lg:gap-6">
          <div className="contents lg:flex lg:flex-col lg:gap-6">
            <Fechas hogarId={hogarId} datos={datos} miembros={miembros} onCambio={recargar} onVerPersona={elegir} />
          </div>
          <div className="contents lg:flex lg:flex-col lg:gap-6">
            <ParaQuien hogarId={hogarId} datos={datos} miembros={miembros} yo={yo} quien={quien} onElegir={elegir} onCambio={recargar} />
          </div>
        </div>
      )}
    </main>
  )
}

// Quién es cada clave: «yo», «m:<miembro>» o «p:<persona de fuera>».
function nombreDe(clave: string, miembros: Miembro[], personas: PersonaRegalo[]): string {
  if (clave.startsWith('m:')) return miembros.find((m) => m.id === clave.slice(2))?.nombre_visible ?? ''
  if (clave.startsWith('p:')) return personas.find((p) => p.id === clave.slice(2))?.nombre ?? ''
  return ''
}

// ---------------------------------------------------------------------
// 📅 Próximas fechas
// ---------------------------------------------------------------------

function Fechas({
  hogarId,
  datos,
  miembros,
  onCambio,
  onVerPersona,
}: {
  hogarId: string
  datos: DatosRegalos
  miembros: Miembro[]
  onCambio: () => void
  onVerPersona: (clave: string) => void
}) {
  const hoy = hoyComoTexto()
  const [abierta, setAbierta] = useState<string | null>(null)
  const [editando, setEditando] = useState<FechaEspecial | 'nueva' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lista = proximasFechas(datos.fechas, hoy)

  async function quitar(f: FechaEspecial) {
    if (!window.confirm(`¿Borrar «${f.titulo}»?`)) return
    const fallo = await borrar('fechas_especiales', f.id)
    if (fallo) return setError(fallo)
    setAbierta(null)
    onCambio()
  }

  return (
    <section className="tarjeta flex flex-col gap-3">
      <TituloSeccion dibujo="📅" titulo="Fechas especiales" subtitulo="Os las recordamos ese día a las 8:00" color="tareas" />
      {lista.length === 0 && !editando && (
        <Vacio dibujo="🎂" color="tareas">
          Apuntad cumpleaños, aniversarios y fechas señaladas. Salen en el calendario y os las recordamos el mismo día.
        </Vacio>
      )}
      <ul className="flex flex-col gap-1.5">
        {lista.map(({ fecha: f, cuando, dias }) => {
          const tipo = TIPOS_FECHA[f.tipo]
          const anios = cuantosAnios(f, cuando)
          const deQuien = f.miembro_id ? `m:${f.miembro_id}` : f.persona_id ? `p:${f.persona_id}` : null
          const nombre = deQuien ? nombreDe(deQuien, miembros, datos.personas) : ''
          return (
            <li key={f.id} className={`rounded-2xl ${dias === 0 ? 'bg-sol ring-2 ring-sol-tinta/30' : 'bg-stone-50'}`}>
              <button type="button" onClick={() => setAbierta(abierta === f.id ? null : f.id)} aria-expanded={abierta === f.id} className="flex w-full items-center gap-3 p-3 text-left">
                <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-xl shadow-sm">
                  {tipo.dibujo}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{f.titulo}</span>
                  <span className="block text-sm text-stone-600">
                    {diaYMes(f)}
                    {anios && ` · ${anios}`}
                  </span>
                </span>
                <span className={`shrink-0 text-xs font-bold ${dias <= 7 ? 'text-sol-tinta' : 'text-stone-500'}`}>{cuandoFalta(dias)}</span>
              </button>
              {abierta === f.id && (
                <div className="flex flex-col gap-2 px-3 pb-3">
                  {f.notas && <p className="text-sm whitespace-pre-line text-stone-600">📝 {f.notas}</p>}
                  <div className="flex flex-wrap gap-2">
                    {deQuien && nombre && (
                      <button type="button" onClick={() => onVerPersona(deQuien)} className="rounded-full bg-tareas px-3 py-1.5 text-sm font-semibold text-tareas-tinta">
                        🎁 Regalos para {nombre}
                      </button>
                    )}
                    <button type="button" onClick={() => setEditando(f)} className="rounded-full px-3 py-1.5 text-sm font-semibold text-stone-600 ring-1 ring-stone-200">
                      ✏️ Editar
                    </button>
                    <button type="button" onClick={() => quitar(f)} className="rounded-full px-3 py-1.5 text-sm font-semibold text-red-700 ring-1 ring-red-200">
                      🗑️ Borrar
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {error && <p role="alert" className={avisoError}>{error}</p>}
      {editando ? (
        <FormularioFecha
          key={editando === 'nueva' ? 'nueva' : editando.id}
          hogarId={hogarId}
          fecha={editando === 'nueva' ? null : editando}
          miembros={miembros}
          personas={datos.personas}
          onListo={() => {
            setEditando(null)
            onCambio()
          }}
          onCancelar={() => setEditando(null)}
        />
      ) : (
        <button type="button" onClick={() => setEditando('nueva')} className={botonSecundario}>
          + Añadir fecha
        </button>
      )}
    </section>
  )
}

function FormularioFecha({
  hogarId,
  fecha,
  miembros,
  personas,
  onListo,
  onCancelar,
}: {
  hogarId: string
  fecha: FechaEspecial | null
  miembros: Miembro[]
  personas: PersonaRegalo[]
  onListo: () => void
  onCancelar: () => void
}) {
  const [titulo, setTitulo] = useState(fecha?.titulo ?? '')
  const [tipo, setTipo] = useState<TipoFecha>(fecha?.tipo ?? 'cumpleanos')
  const [dia, setDia] = useState(fecha?.dia ?? 1)
  const [mes, setMes] = useState(fecha?.mes ?? 1)
  const [anio, setAnio] = useState(fecha?.anio ? String(fecha.anio) : '')
  const [deQuien, setDeQuien] = useState(fecha?.miembro_id ? `m:${fecha.miembro_id}` : fecha?.persona_id ? `p:${fecha.persona_id}` : '')
  const [notas, setNotas] = useState(fecha?.notas ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const maximo = mes === 2 ? 29 : [4, 6, 9, 11].includes(mes) ? 30 : 31

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    const numero = Number(anio)
    setGuardando(true)
    setError(null)
    const fallo = await guardar('fechas_especiales', hogarId, fecha?.id ?? null, {
      titulo: titulo.trim(),
      tipo,
      dia: Math.min(dia, maximo),
      mes,
      anio: anio && Number.isInteger(numero) && numero >= 1900 && numero <= 2100 ? numero : null,
      miembro_id: deQuien.startsWith('m:') ? deQuien.slice(2) : null,
      persona_id: deQuien.startsWith('p:') ? deQuien.slice(2) : null,
      notas: notas.trim() || null,
    })
    setGuardando(false)
    if (fallo) return setError(fallo)
    onListo()
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4 rounded-2xl bg-tareas/50 p-4">
      <h3 className="font-bold text-tareas-tinta">{fecha ? 'Editar fecha' : 'Nueva fecha'}</h3>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de fecha">
        {(Object.keys(TIPOS_FECHA) as TipoFecha[]).map((t) => (
          <button key={t} type="button" aria-pressed={tipo === t} onClick={() => setTipo(t)} className={estiloChip(tipo === t, true)}>
            {TIPOS_FECHA[t].dibujo} {TIPOS_FECHA[t].texto}
          </button>
        ))}
      </div>
      <Campo texto="¿Qué se celebra?">
        <input className={campo} value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={80} required placeholder={tipo === 'cumpleanos' ? 'Cumpleaños de mamá' : tipo === 'aniversario' ? 'Nuestro aniversario' : 'Día de la Madre'} />
      </Campo>
      <div className="flex flex-wrap gap-3">
        <Campo texto="Día">
          <select className={`${campo} w-24`} value={Math.min(dia, maximo)} onChange={(e) => setDia(Number(e.target.value))}>
            {Array.from({ length: maximo }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Campo>
        <Campo texto="Mes">
          <select className={`${campo} w-40`} value={mes} onChange={(e) => setMes(Number(e.target.value))}>
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </Campo>
        <Campo texto="Año (opcional)">
          <input className={`${campo} w-28`} value={anio} onChange={(e) => setAnio(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder={tipo === 'cumpleanos' ? 'Nació en…' : 'Desde…'} />
        </Campo>
      </div>
      <Campo texto="¿De quién es? (opcional)">
        <select className={campo} value={deQuien} onChange={(e) => setDeQuien(e.target.value)}>
          <option value="">De nadie en concreto</option>
          {miembros.map((m) => (
            <option key={m.id} value={`m:${m.id}`}>
              {m.nombre_visible} (de casa)
            </option>
          ))}
          {personas.map((p) => (
            <option key={p.id} value={`p:${p.id}`}>
              {p.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <Campo texto="Notas (opcional)">
        <textarea className={`${campo} min-h-16`} value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={1000} placeholder="Le gusta celebrarlo con una comida en familia…" />
      </Campo>
      {error && <p role="alert" className={avisoError}>{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancelar} className={`${botonSecundario} flex-1`}>
          Cancelar
        </button>
        <button type="submit" disabled={guardando || !titulo.trim()} className={`${botonPrincipal} flex-1`}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}

function Campo({ texto, children }: { texto: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-stone-700">{texto}</span>
      {children}
    </label>
  )
}

// ---------------------------------------------------------------------
// 🎁 Para quién: tu lista, las de las demás e ideas
// ---------------------------------------------------------------------

function ParaQuien({
  hogarId,
  datos,
  miembros,
  yo,
  quien,
  onElegir,
  onCambio,
}: {
  hogarId: string
  datos: DatosRegalos
  miembros: Miembro[]
  yo: Miembro
  quien: string
  onElegir: (clave: string) => void
  onCambio: () => void
}) {
  const [nuevaPersona, setNuevaPersona] = useState(false)
  const otras = miembros.filter((m) => m.id !== yo.id)
  // Si la persona recordada ya no existe, tu lista.
  const valida =
    quien === 'yo' ||
    (quien.startsWith('m:') && otras.some((m) => m.id === quien.slice(2))) ||
    (quien.startsWith('p:') && datos.personas.some((p) => p.id === quien.slice(2)))
  const actual = valida ? quien : 'yo'

  const chip = (clave: string, contenido: ReactNode) => (
    <button
      key={clave}
      type="button"
      role="tab"
      aria-selected={actual === clave}
      onClick={() => {
        setNuevaPersona(false)
        onElegir(clave)
      }}
      className={`${estiloChip(actual === clave && !nuevaPersona, true)} inline-flex items-center gap-1.5`}
    >
      {contenido}
    </button>
  )

  return (
    <section className="tarjeta flex flex-col gap-4">
      <TituloSeccion dibujo="🎁" titulo="Listas e ideas" subtitulo="Elige para quién" color="tareas" />
      <div role="tablist" aria-label="Para quién" className="flex flex-wrap gap-2">
        {chip('yo', <>⭐ Mi lista</>)}
        {otras.map((m) =>
          chip(
            `m:${m.id}`,
            <>
              <Avatar id={m.id} nombre={m.nombre_visible} pequeno /> {m.nombre_visible}
            </>,
          ),
        )}
        {datos.personas.map((p) => chip(`p:${p.id}`, <>👤 {p.nombre}</>))}
        <button type="button" onClick={() => setNuevaPersona(true)} aria-pressed={nuevaPersona} className="rounded-full px-3 py-1.5 text-sm font-semibold text-marca">
          + Persona
        </button>
      </div>

      {nuevaPersona ? (
        <FormularioPersona
          hogarId={hogarId}
          persona={null}
          onListo={() => {
            setNuevaPersona(false)
            onCambio()
          }}
          onCancelar={() => setNuevaPersona(false)}
        />
      ) : actual === 'yo' ? (
        <MiLista hogarId={hogarId} deseos={datos.deseos.filter((d) => d.miembro_id === yo.id)} onCambio={onCambio} />
      ) : actual.startsWith('m:') ? (
        <DeAlguienDeCasa
          key={actual}
          hogarId={hogarId}
          datos={datos}
          miembro={otras.find((m) => m.id === actual.slice(2))!}
          miembros={miembros}
          yo={yo}
          onCambio={onCambio}
        />
      ) : (
        <DeAlguienDeFuera key={actual} hogarId={hogarId} datos={datos} persona={datos.personas.find((p) => p.id === actual.slice(2))!} onCambio={onCambio} onBorrada={() => onElegir('yo')} />
      )}
    </section>
  )
}

// Tu lista de deseos (la ven las demás).
function MiLista({ hogarId, deseos, onCambio }: { hogarId: string; deseos: Deseo[]; onCambio: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-xl bg-tareas/50 p-3 text-sm text-tareas-tinta">
        ⭐ Lo que te gustaría que te regalaran. La ven las demás; lo que te regalen es sorpresa: no verás quién reserva qué.
      </p>
      <ListaDeCosas
        tabla="deseos"
        hogarId={hogarId}
        cosas={deseos}
        vacio="Todavía no hay nada en tu lista. ¿Qué te haría ilusión?"
        anadir="+ Añadir a mi lista"
        conPrioridad
        onCambio={onCambio}
      />
    </div>
  )
}

// Alguien de casa: su lista de deseos (con «Lo regalo yo») y las ideas
// para esa persona (que ella no ve).
function DeAlguienDeCasa({
  hogarId,
  datos,
  miembro,
  miembros,
  yo,
  onCambio,
}: {
  hogarId: string
  datos: DatosRegalos
  miembro: Miembro
  miembros: Miembro[]
  yo: Miembro
  onCambio: () => void
}) {
  const deseos = datos.deseos.filter((d) => d.miembro_id === miembro.id)
  const nombre = miembro.nombre_visible
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h3 className="font-bold">⭐ Lista de deseos de {nombre}</h3>
        {deseos.length > 0 && <p className="text-xs font-medium text-stone-500">🔒 {nombre} no ve quién reserva qué.</p>}
        {deseos.length === 0 && <p className="text-sm text-stone-500">{nombre} todavía no ha apuntado nada en su lista.</p>}
        <ul className="flex flex-col gap-2">
          {deseos.map((d) => (
            <DeseoAjeno key={d.id} hogarId={hogarId} deseo={d} reserva={datos.reservas.find((r) => r.deseo_id === d.id)} miembros={miembros} yo={yo} onCambio={onCambio} />
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="font-bold">💡 Ideas para {nombre}</h3>
        <p className="text-xs font-medium text-stone-500">🔒 {nombre} no las ve. Ojo: si creas una tarea con el regalo, esa sí la verá.</p>
        <ListaDeCosas
          tabla="ideas_regalo"
          hogarId={hogarId}
          cosas={datos.ideas.filter((i) => i.miembro_id === miembro.id)}
          para={{ miembro_id: miembro.id }}
          vacio={`Apuntad aquí lo que se os ocurra para ${nombre} durante el año.`}
          anadir="+ Añadir idea"
          onCambio={onCambio}
        />
      </div>
    </div>
  )
}

function DeseoAjeno({
  hogarId,
  deseo,
  reserva,
  miembros,
  yo,
  onCambio,
}: {
  hogarId: string
  deseo: Deseo
  reserva: { miembro_id: string; comprado: boolean } | undefined
  miembros: Miembro[]
  yo: Miembro
  onCambio: () => void
}) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mia = reserva?.miembro_id === yo.id
  const quienReserva = reserva ? miembros.find((m) => m.id === reserva.miembro_id)?.nombre_visible ?? 'alguien' : null

  async function hacer(accion: () => Promise<string | null>) {
    setEnviando(true)
    setError(null)
    const fallo = await accion()
    setEnviando(false)
    if (fallo) return setError(fallo)
    onCambio()
  }

  const boton = 'rounded-full px-3 py-1.5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-60'
  return (
    <li className={`flex flex-col gap-2 rounded-2xl p-3 ring-1 ${reserva ? 'bg-marca-suave/30 ring-marca/20' : 'bg-white ring-stone-200'}`}>
      <DatosCosa cosa={deseo} prioridad={deseo.prioridad} />
      <div className="flex flex-wrap items-center gap-2">
        {!reserva && (
          <button type="button" disabled={enviando} onClick={() => hacer(() => reservar(hogarId, deseo.id))} className={`${boton} bg-tareas text-tareas-tinta`}>
            🎁 Lo regalo yo
          </button>
        )}
        {reserva && (
          <Etiqueta className={reserva.comprado ? 'bg-marca text-white' : 'bg-marca-suave text-marca'}>
            {reserva.comprado ? '✅ Comprado' : '🎁 Reservado'} · {mia ? 'lo regalas tú' : `lo regala ${quienReserva}`}
          </Etiqueta>
        )}
        {mia && reserva && (
          <>
            <button type="button" disabled={enviando} onClick={() => hacer(() => cambiarReserva(deseo.id, !reserva.comprado))} className={`${boton} text-stone-600 ring-1 ring-stone-200`}>
              {reserva.comprado ? '↩️ Aún no comprado' : '✅ Ya lo tengo'}
            </button>
            <button type="button" disabled={enviando} onClick={() => hacer(() => quitarReserva(deseo.id))} className={`${boton} text-stone-500`}>
              Quitar
            </button>
          </>
        )}
      </div>
      {error && <p role="alert" className={avisoError}>{error}</p>}
    </li>
  )
}

// Alguien de fuera: sus gustos, sus ideas y editar o borrar la persona.
function DeAlguienDeFuera({
  hogarId,
  datos,
  persona,
  onCambio,
  onBorrada,
}: {
  hogarId: string
  datos: DatosRegalos
  persona: PersonaRegalo
  onCambio: () => void
  onBorrada: () => void
}) {
  const [editando, setEditando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function quitar() {
    if (!window.confirm(`¿Borrar a ${persona.nombre}? También se borrarán sus ideas (sus fechas se quedan).`)) return
    const fallo = await borrar('personas_regalo', persona.id)
    if (fallo) return setError(fallo)
    onBorrada()
    onCambio()
  }

  if (editando) {
    return (
      <FormularioPersona
        hogarId={hogarId}
        persona={persona}
        onListo={() => {
          setEditando(false)
          onCambio()
        }}
        onCancelar={() => setEditando(false)}
      />
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 rounded-2xl bg-stone-50 p-3">
        <p className="font-bold">
          👤 {persona.nombre}
          {persona.relacion && <span className="font-normal text-stone-500"> · {persona.relacion}</span>}
        </p>
        {persona.gustos && <p className="text-sm whitespace-pre-line text-stone-600">{persona.gustos}</p>}
        <div className="mt-1 flex gap-2">
          <button type="button" onClick={() => setEditando(true)} className="text-sm font-semibold text-marca">
            ✏️ Editar
          </button>
          <button type="button" onClick={quitar} className="text-sm font-semibold text-red-700">
            🗑️ Borrar
          </button>
        </div>
        {error && <p role="alert" className={avisoError}>{error}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="font-bold">💡 Ideas para {persona.nombre}</h3>
        <ListaDeCosas
          tabla="ideas_regalo"
          hogarId={hogarId}
          cosas={datos.ideas.filter((i) => i.persona_id === persona.id)}
          para={{ persona_id: persona.id }}
          vacio={`Apuntad lo que se os ocurra para ${persona.nombre}.`}
          anadir="+ Añadir idea"
          onCambio={onCambio}
        />
      </div>
    </div>
  )
}

function FormularioPersona({ hogarId, persona, onListo, onCancelar }: { hogarId: string; persona: PersonaRegalo | null; onListo: () => void; onCancelar: () => void }) {
  const [nombre, setNombre] = useState(persona?.nombre ?? '')
  const [relacion, setRelacion] = useState(persona?.relacion ?? '')
  const [gustos, setGustos] = useState(persona?.gustos ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setGuardando(true)
    setError(null)
    const fallo = await guardar('personas_regalo', hogarId, persona?.id ?? null, {
      nombre: nombre.trim(),
      relacion: relacion.trim() || null,
      gustos: gustos.trim() || null,
    })
    setGuardando(false)
    if (fallo) return setError(fallo)
    onListo()
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4 rounded-2xl bg-tareas/50 p-4">
      <h3 className="font-bold text-tareas-tinta">{persona ? `Editar a ${persona.nombre}` : 'Nueva persona'}</h3>
      <Campo texto="Nombre">
        <input className={campo} value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} required placeholder="Mamá, Lucía, el abuelo…" />
      </Campo>
      <Campo texto="¿Quién es? (opcional)">
        <input className={campo} value={relacion} onChange={(e) => setRelacion(e.target.value)} maxLength={60} placeholder="Madre de Ana, amiga del trabajo…" />
      </Campo>
      <Campo texto="Gustos (opcional)">
        <textarea className={`${campo} min-h-16`} value={gustos} onChange={(e) => setGustos(e.target.value)} maxLength={1000} placeholder="Talla M, le encanta el morado, colecciona tazas…" />
      </Campo>
      {error && <p role="alert" className={avisoError}>{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancelar} className={`${botonSecundario} flex-1`}>
          Cancelar
        </button>
        <button type="submit" disabled={guardando || !nombre.trim()} className={`${botonPrincipal} flex-1`}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------
// Listas de deseos e ideas (mismos campos)
// ---------------------------------------------------------------------

type Cosa = Pick<Deseo, 'id' | 'titulo' | 'enlace' | 'precio' | 'notas'> & { prioridad?: 1 | 2 | 3; comprado?: boolean }

// Título, prioridad, precio, enlace y notas.
function DatosCosa({ cosa, prioridad }: { cosa: Cosa; prioridad?: 1 | 2 | 3 }) {
  const p = prioridad ? PRIORIDADES[prioridad - 1] : null
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className={`font-semibold break-words ${cosa.comprado ? 'text-stone-500 line-through' : ''}`}>{cosa.titulo}</p>
      <p className="flex flex-wrap items-center gap-1.5 text-xs">
        {p && (
          <Etiqueta className="bg-tareas text-tareas-tinta">
            <span aria-hidden="true">{p.dibujo}</span> {p.texto}
          </Etiqueta>
        )}
        {cosa.precio !== null && <Etiqueta className="bg-stone-100 text-stone-600">{euros(cosa.precio)}</Etiqueta>}
        {cosa.enlace && (
          <a href={cosa.enlace} target="_blank" rel="noopener noreferrer" className="font-semibold text-marca underline">
            Ver dónde ↗
          </a>
        )}
      </p>
      {cosa.notas && <p className="text-sm whitespace-pre-line break-words text-stone-600">{cosa.notas}</p>}
    </div>
  )
}

function ListaDeCosas({
  tabla,
  hogarId,
  cosas,
  para,
  vacio,
  anadir,
  conPrioridad,
  onCambio,
}: {
  tabla: 'deseos' | 'ideas_regalo'
  hogarId: string
  cosas: (Deseo | IdeaRegalo)[]
  para?: { miembro_id: string } | { persona_id: string }
  vacio: string
  anadir: string
  conPrioridad?: boolean
  onCambio: () => void
}) {
  const [editando, setEditando] = useState<string | 'nueva' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function hacer(accion: () => Promise<string | null>) {
    setError(null)
    const fallo = await accion()
    if (fallo) return setError(fallo)
    onCambio()
  }

  const formulario = (cosa: Cosa | null) => (
    <FormularioCosa
      key={cosa?.id ?? 'nueva'}
      cosa={cosa}
      conPrioridad={conPrioridad}
      onGuardar={async (campos) => {
        const fallo = await guardar(tabla, hogarId, cosa?.id ?? null, cosa ? campos : { ...campos, ...para })
        if (!fallo) {
          setEditando(null)
          onCambio()
        }
        return fallo
      }}
      onCancelar={() => setEditando(null)}
    />
  )

  return (
    <div className="flex flex-col gap-2">
      {cosas.length === 0 && editando !== 'nueva' && <p className="text-sm text-stone-500">{vacio}</p>}
      <ul className="flex flex-col gap-2">
        {cosas.map((c) =>
          editando === c.id ? (
            <li key={c.id}>{formulario(c)}</li>
          ) : (
            <li key={c.id} className="flex flex-col gap-2 rounded-2xl bg-white p-3 ring-1 ring-stone-200">
              <DatosCosa cosa={c} prioridad={'prioridad' in c ? c.prioridad : undefined} />
              <div className="flex flex-wrap gap-3 text-sm font-semibold">
                {'comprado' in c && (
                  <button type="button" onClick={() => hacer(() => guardar(tabla, hogarId, c.id, { comprado: !c.comprado }))} className="text-marca">
                    {c.comprado ? '↩️ Aún no comprado' : '✅ Ya lo tengo'}
                  </button>
                )}
                <button type="button" onClick={() => setEditando(c.id)} className="text-stone-600">
                  ✏️ Editar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`¿Borrar «${c.titulo}»?`)) void hacer(() => borrar(tabla, c.id))
                  }}
                  className="text-red-700"
                >
                  🗑️ Borrar
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
      {error && <p role="alert" className={avisoError}>{error}</p>}
      {editando === 'nueva' ? (
        formulario(null)
      ) : (
        <button type="button" onClick={() => setEditando('nueva')} className={botonSecundario}>
          {anadir}
        </button>
      )}
    </div>
  )
}

function FormularioCosa({
  cosa,
  conPrioridad,
  onGuardar,
  onCancelar,
}: {
  cosa: Cosa | null
  conPrioridad?: boolean
  onGuardar: (campos: Record<string, unknown>) => Promise<string | null>
  onCancelar: () => void
}) {
  const [titulo, setTitulo] = useState(cosa?.titulo ?? '')
  const [enlace, setEnlace] = useState(cosa?.enlace ?? '')
  const [precio, setPrecio] = useState(cosa?.precio !== null && cosa?.precio !== undefined ? String(cosa.precio).replace('.', ',') : '')
  const [notas, setNotas] = useState(cosa?.notas ?? '')
  const [prioridad, setPrioridad] = useState<1 | 2 | 3>(cosa?.prioridad ?? 1)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    const enlaceLimpio = enlace.trim()
    if (enlaceLimpio && !/^https?:\/\//i.test(enlaceLimpio)) return setError('El enlace tiene que empezar por https://')
    const numero = Number(precio.replace(',', '.'))
    if (precio.trim() && (!Number.isFinite(numero) || numero < 0 || numero >= 1_000_000)) return setError('El precio no es un número válido.')
    setGuardando(true)
    setError(null)
    const fallo = await onGuardar({
      titulo: titulo.trim(),
      enlace: enlaceLimpio || null,
      precio: precio.trim() ? Math.round(numero * 100) / 100 : null,
      notas: notas.trim() || null,
      ...(conPrioridad ? { prioridad } : {}),
    })
    setGuardando(false)
    if (fallo) setError(fallo)
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3 rounded-2xl bg-tareas/50 p-4">
      <Campo texto="¿Qué es?">
        <input className={campo} value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} required placeholder="Unos auriculares, una escapada, un libro…" />
      </Campo>
      {conPrioridad && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Cuánto te gustaría">
          {PRIORIDADES.map((p) => (
            <button key={p.valor} type="button" aria-pressed={prioridad === p.valor} onClick={() => setPrioridad(p.valor)} className={estiloChip(prioridad === p.valor, true)}>
              {p.dibujo} {p.texto}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <Campo texto="Precio aproximado (€, opcional)">
          <input className={`${campo} w-32`} value={precio} onChange={(e) => setPrecio(e.target.value.replace(/[^\d,.]/g, ''))} inputMode="decimal" placeholder="25" />
        </Campo>
        <div className="min-w-0 flex-1 basis-48">
          <Campo texto="Enlace (opcional)">
            <input className={campo} value={enlace} onChange={(e) => setEnlace(e.target.value)} maxLength={500} inputMode="url" placeholder="https://…" />
          </Campo>
        </div>
      </div>
      <Campo texto="Notas (opcional)">
        <textarea className={`${campo} min-h-16`} value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={1000} placeholder="Color, talla, dónde lo vimos…" />
      </Campo>
      {error && <p role="alert" className={avisoError}>{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancelar} className={`${botonSecundario} flex-1`}>
          Cancelar
        </button>
        <button type="submit" disabled={guardando || !titulo.trim()} className={`${botonPrincipal} flex-1`}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}
