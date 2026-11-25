import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  DESTINOS,
  TIPOS_CUIDADO,
  borrarNotas,
  cambiarNota,
  contextoDelHogar,
  guardarPropuesta,
  infoDestino,
  repartir,
  useBandeja,
  type ContextoHogar,
  type Destino,
  type NotaBandeja,
  type Propuesta,
  type TipoCuidadoHecho,
  type TipoFechaBandeja,
} from '../lib/bandeja'
import { fechaCorta } from '../lib/fechas'
import { MESES, TIPOS_FECHA } from '../lib/regalos'
import { volver } from '../lib/ruta'
import { CATEGORIAS, type Categoria } from '../lib/tipos'
import { avisoError, botonPrincipal, botonSecundario, campoBase } from './estilos'
import { TituloSeccion, Vacio } from './Piezas'
import { CajaCabeza } from './CajaCabeza'

type Props = { hogarId: string; miUserId: string }

const MAX_POR_REPARTO = 30

// #/bandeja: «🧠 Tu bandeja». Lo que soltaste con el botón 🧠; con
// «✨ Repartir», la IA propone dónde va cada cosa y tú lo revisas.
export function PantallaBandeja({ hogarId, miUserId }: Props) {
  const { notas, error, recargar } = useBandeja()
  const [reparto, setReparto] = useState<{ borradores: Borrador[]; contexto: ContextoHogar; notas: NotaBandeja[] } | null>(null)
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
      const propuestas = await repartir(estas, contexto)
      setReparto({ borradores: propuestas.map(desdePropuesta), contexto, notas: estas })
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
// ---------------------------------------------------------------------

type Borrador = {
  clave: string
  nota: string
  destino: Destino
  texto: string // título, nombre o el texto de la nota
  fecha: string
  responsable: string
  categoria: Categoria
  mascota: string
  detalles: string
  cantidad: string
  categoriaPlan: string
  para: string // «m:<id>», «p:<id>» o ''
  tipoFecha: TipoFechaBandeja
  dia: number
  mes: number
  anio: string
  kg: string
  planta: string
  tipoCuidado: TipoCuidadoHecho
  guardar: boolean
  estado: 'pendiente' | 'guardado'
  error: string | null
}

let contador = 0

function desdePropuesta(p: Propuesta): Borrador {
  const b: Borrador = {
    clave: `b${++contador}`,
    nota: p.nota,
    destino: p.destino,
    texto: '',
    fecha: '',
    responsable: '',
    categoria: 'otros',
    mascota: '',
    detalles: '',
    cantidad: '',
    categoriaPlan: '',
    para: '',
    tipoFecha: 'cumpleanos',
    dia: 1,
    mes: 1,
    anio: '',
    kg: '',
    planta: '',
    tipoCuidado: 'riego',
    guardar: p.destino !== 'sin_clasificar',
    estado: 'pendiente',
    error: null,
  }
  switch (p.destino) {
    case 'tarea':
      return { ...b, texto: p.titulo, fecha: p.fecha ?? '', responsable: p.responsable_id ?? '', categoria: p.categoria, mascota: p.mascota_id ?? '', detalles: p.detalles ?? '' }
    case 'compra':
      return { ...b, texto: p.nombre, cantidad: p.cantidad ?? '' }
    case 'plan':
      return { ...b, texto: p.nombre, categoriaPlan: p.categoria_id ?? '' }
    case 'pelicula':
    case 'serie':
    case 'deseo':
      return { ...b, texto: p.titulo }
    case 'idea_regalo':
      return { ...b, texto: p.titulo, para: p.miembro_id ? `m:${p.miembro_id}` : p.persona_id ? `p:${p.persona_id}` : '' }
    case 'fecha':
      return { ...b, texto: p.titulo, tipoFecha: p.tipo, dia: p.dia, mes: p.mes, anio: p.anio ? String(p.anio) : '', para: p.miembro_id ? `m:${p.miembro_id}` : p.persona_id ? `p:${p.persona_id}` : '' }
    case 'peso':
      return { ...b, mascota: p.mascota_id, kg: String(p.kg).replace('.', ',') }
    case 'cuidado_hecho':
      return { ...b, planta: p.planta_id, tipoCuidado: p.tipo }
    case 'sin_clasificar':
      return { ...b, texto: p.texto }
  }
}

// El borrador (corregido) → lo que hay que guardar, o por qué no se puede.
function aPropuesta(b: Borrador): Propuesta | { error: string } {
  const texto = b.texto.replace(/\s+/g, ' ').trim()
  const base = { nota: b.nota }
  const necesitaTexto = !['peso', 'cuidado_hecho', 'sin_clasificar'].includes(b.destino)
  if (necesitaTexto && !texto) return { error: 'Falta el texto.' }
  const para = { miembro_id: b.para.startsWith('m:') ? b.para.slice(2) : null, persona_id: b.para.startsWith('p:') ? b.para.slice(2) : null }
  switch (b.destino) {
    case 'tarea':
      return { ...base, destino: 'tarea', titulo: texto.slice(0, 120), fecha: b.fecha || null, categoria: b.mascota ? 'mascota' : b.categoria, responsable_id: b.responsable || null, mascota_id: b.mascota || null, detalles: b.detalles.trim() || null }
    case 'compra':
      return { ...base, destino: 'compra', nombre: texto.slice(0, 80), cantidad: b.cantidad.trim().slice(0, 30) || null }
    case 'plan':
      return { ...base, destino: 'plan', nombre: texto.slice(0, 80), categoria_id: b.categoriaPlan || null }
    case 'pelicula':
    case 'serie':
      return { ...base, destino: b.destino, titulo: texto.slice(0, 120) }
    case 'deseo':
      return { ...base, destino: 'deseo', titulo: texto.slice(0, 120) }
    case 'idea_regalo':
      if (!b.para) return { error: 'Elige para quién es la idea.' }
      return { ...base, destino: 'idea_regalo', titulo: texto.slice(0, 120), ...para }
    case 'fecha': {
      const anio = Number(b.anio)
      return { ...base, destino: 'fecha', titulo: texto.slice(0, 80), tipo: b.tipoFecha, dia: b.dia, mes: b.mes, anio: b.anio && Number.isInteger(anio) && anio >= 1900 && anio <= 2100 ? anio : null, ...para }
    }
    case 'peso': {
      const kg = Number(b.kg.replace(',', '.'))
      if (!b.mascota) return { error: 'Elige la mascota.' }
      if (!Number.isFinite(kg) || kg <= 0 || kg >= 500) return { error: 'El peso no es válido.' }
      return { ...base, destino: 'peso', mascota_id: b.mascota, kg: Math.round(kg * 1000) / 1000 }
    }
    case 'cuidado_hecho':
      if (!b.planta) return { error: 'Elige la planta.' }
      return { ...base, destino: 'cuidado_hecho', planta_id: b.planta, tipo: b.tipoCuidado }
    case 'sin_clasificar':
      return { ...base, destino: 'sin_clasificar', texto }
  }
}

function Revision({
  hogarId,
  reparto,
  onCambiar,
  onCancelar,
  onTerminado,
}: {
  hogarId: string
  reparto: { borradores: Borrador[]; contexto: ContextoHogar; notas: NotaBandeja[] }
  onCambiar: (b: Borrador[]) => void
  onCancelar: () => void
  onTerminado: (resumen: string) => void
}) {
  const { borradores, contexto, notas } = reparto
  const [guardando, setGuardando] = useState(false)
  const aGuardar = borradores.filter((b) => b.guardar && b.estado !== 'guardado' && b.destino !== 'sin_clasificar')

  function cambiar(clave: string, cambios: Partial<Borrador>) {
    onCambiar(borradores.map((b) => (b.clave === clave ? { ...b, ...cambios, error: null } : b)))
  }

  async function guardarTodo() {
    setGuardando(true)
    const nuevos = [...borradores]
    for (let i = 0; i < nuevos.length; i++) {
      const b = nuevos[i]
      if (!b.guardar || b.estado === 'guardado' || b.destino === 'sin_clasificar') continue
      const propuesta = aPropuesta(b)
      const fallo = 'error' in propuesta ? propuesta.error : await guardarPropuesta(hogarId, propuesta)
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
              <TarjetaBorrador key={b.clave} b={b} contexto={contexto} onCambiar={(c) => cambiar(b.clave, c)} />
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

function TarjetaBorrador({ b, contexto, onCambiar }: { b: Borrador; contexto: ContextoHogar; onCambiar: (c: Partial<Borrador>) => void }) {
  const info = infoDestino(b.destino)
  const guardado = b.estado === 'guardado'
  const pequeno = `${campoBase} w-full py-2 text-sm`
  const otras = contexto.personas.filter((p) => !p.yo)
  const etiqueta = (texto: string, hijo: ReactNode, ancho = 'w-full') => (
    <label className={`flex min-w-0 flex-col gap-1 ${ancho}`}>
      <span className="text-xs font-medium text-stone-600">{texto}</span>
      {hijo}
    </label>
  )
  const textoPrincipal: Partial<Record<Destino, string>> = {
    tarea: 'Tarea',
    compra: 'Qué comprar',
    plan: 'Plan',
    pelicula: 'Título',
    serie: 'Título',
    deseo: 'Qué te gustaría',
    idea_regalo: 'Idea',
    fecha: '¿Qué se celebra?',
    sin_clasificar: 'Nota',
  }

  if (guardado) {
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-marca-suave/50 px-3 py-2 text-sm font-semibold text-marca">
        <span aria-hidden="true">✓</span> {info.dibujo} {info.texto}: {b.texto || (b.destino === 'peso' ? `${b.kg} kg` : 'hecho')}
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-3 rounded-2xl p-3 ring-1 ${b.error ? 'bg-red-50/60 ring-red-200' : b.guardar ? 'bg-white ring-stone-200' : 'bg-stone-50 ring-stone-200 opacity-70'}`}>
      <div className="flex items-center gap-2">
        {b.destino !== 'sin_clasificar' && (
          <input type="checkbox" className="h-5 w-5 shrink-0 accent-marca" checked={b.guardar} onChange={(e) => onCambiar({ guardar: e.target.checked })} aria-label={`Guardar «${b.texto || info.texto}»`} />
        )}
        <select
          className={`${campoBase} min-w-0 flex-1 py-2 text-sm font-semibold`}
          value={b.destino}
          onChange={(e) => onCambiar({ destino: e.target.value as Destino, guardar: e.target.value !== 'sin_clasificar' })}
          aria-label="Dónde va"
        >
          {DESTINOS.map((d) => (
            <option key={d.valor} value={d.valor}>
              {d.dibujo} {d.texto}
            </option>
          ))}
        </select>
      </div>

      {textoPrincipal[b.destino] && etiqueta(textoPrincipal[b.destino]!, <input className={pequeno} value={b.texto} onChange={(e) => onCambiar({ texto: e.target.value })} maxLength={120} />, 'w-full')}

      {b.destino === 'tarea' && (
        <div className="flex flex-wrap gap-2">
          {etiqueta('Fecha', <input type="date" className={pequeno} value={b.fecha} onChange={(e) => onCambiar({ fecha: e.target.value })} />, 'flex-1 basis-40')}
          {etiqueta(
            'Quién',
            <select className={pequeno} value={b.responsable} onChange={(e) => onCambiar({ responsable: e.target.value })}>
              <option value="">Nadie en concreto</option>
              {contexto.personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                  {p.yo ? ' (tú)' : ''}
                </option>
              ))}
            </select>,
            'flex-1 basis-40',
          )}
          {etiqueta(
            'Tipo',
            <select className={pequeno} value={b.categoria} onChange={(e) => onCambiar({ categoria: e.target.value as Categoria })}>
              {CATEGORIAS.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.dibujo} {c.texto}
                </option>
              ))}
            </select>,
            'flex-1 basis-40',
          )}
          {b.fecha && <p className="w-full text-xs text-stone-500">📅 {fechaCorta(b.fecha)}</p>}
        </div>
      )}
      {b.destino === 'compra' && etiqueta('Cantidad (opcional)', <input className={pequeno} value={b.cantidad} onChange={(e) => onCambiar({ cantidad: e.target.value })} maxLength={30} />)}
      {b.destino === 'plan' &&
        etiqueta(
          'Categoría',
          <select className={pequeno} value={b.categoriaPlan} onChange={(e) => onCambiar({ categoriaPlan: e.target.value })}>
            <option value="">Sin categoría</option>
            {contexto.categoriasPlan.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>,
        )}
      {(b.destino === 'idea_regalo' || b.destino === 'fecha') &&
        etiqueta(
          b.destino === 'idea_regalo' ? 'Para quién' : 'De quién (opcional)',
          <select className={pequeno} value={b.para} onChange={(e) => onCambiar({ para: e.target.value })}>
            <option value="">{b.destino === 'idea_regalo' ? 'Elige…' : 'De nadie en concreto'}</option>
            {(b.destino === 'fecha' ? contexto.personas : otras).map((p) => (
              <option key={p.id} value={`m:${p.id}`}>
                {p.nombre} (de casa)
              </option>
            ))}
            {contexto.gente.map((p) => (
              <option key={p.id} value={`p:${p.id}`}>
                {p.nombre}
              </option>
            ))}
          </select>,
        )}
      {b.destino === 'idea_regalo' && b.para.startsWith('m:') && <p className="text-xs font-medium text-stone-500">🔒 Esa persona no verá la idea.</p>}
      {b.destino === 'fecha' && (
        <div className="flex flex-wrap gap-2">
          {etiqueta(
            'Tipo',
            <select className={pequeno} value={b.tipoFecha} onChange={(e) => onCambiar({ tipoFecha: e.target.value as TipoFechaBandeja })}>
              {(Object.keys(TIPOS_FECHA) as TipoFechaBandeja[]).map((t) => (
                <option key={t} value={t}>
                  {TIPOS_FECHA[t].dibujo} {TIPOS_FECHA[t].texto}
                </option>
              ))}
            </select>,
            'flex-1 basis-40',
          )}
          {etiqueta(
            'Día',
            <select className={pequeno} value={b.dia} onChange={(e) => onCambiar({ dia: Number(e.target.value) })}>
              {Array.from({ length: b.mes === 2 ? 29 : [4, 6, 9, 11].includes(b.mes) ? 30 : 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>,
            'w-20',
          )}
          {etiqueta(
            'Mes',
            <select className={pequeno} value={b.mes} onChange={(e) => onCambiar({ mes: Number(e.target.value), dia: Math.min(b.dia, Number(e.target.value) === 2 ? 29 : [4, 6, 9, 11].includes(Number(e.target.value)) ? 30 : 31) })}>
              {MESES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>,
            'w-36',
          )}
          {etiqueta('Año', <input className={pequeno} value={b.anio} onChange={(e) => onCambiar({ anio: e.target.value.replace(/\D/g, '').slice(0, 4) })} inputMode="numeric" />, 'w-20')}
        </div>
      )}
      {b.destino === 'peso' && (
        <div className="flex flex-wrap gap-2">
          {etiqueta(
            'Mascota',
            <select className={pequeno} value={b.mascota} onChange={(e) => onCambiar({ mascota: e.target.value })}>
              <option value="">Elige…</option>
              {contexto.mascotas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>,
            'flex-1 basis-40',
          )}
          {etiqueta('Kilos (hoy)', <input className={pequeno} value={b.kg} onChange={(e) => onCambiar({ kg: e.target.value.replace(/[^\d,.]/g, '') })} inputMode="decimal" />, 'w-28')}
        </div>
      )}
      {b.destino === 'cuidado_hecho' && (
        <div className="flex flex-wrap gap-2">
          {etiqueta(
            'Planta',
            <select className={pequeno} value={b.planta} onChange={(e) => onCambiar({ planta: e.target.value })}>
              <option value="">Elige…</option>
              {contexto.plantas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>,
            'flex-1 basis-40',
          )}
          {etiqueta(
            'Qué se ha hecho',
            <select className={pequeno} value={b.tipoCuidado} onChange={(e) => onCambiar({ tipoCuidado: e.target.value as TipoCuidadoHecho })}>
              {TIPOS_CUIDADO.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>,
            'flex-1 basis-40',
          )}
          <p className="w-full text-xs text-stone-500">Se marcará como hecha la tarea pendiente de ese cuidado (hoy).</p>
        </div>
      )}
      {b.destino === 'sin_clasificar' && <p className="text-xs text-stone-500">Se queda en tu bandeja. Elige otro sitio si sabes dónde va.</p>}
      {b.error && <p role="alert" className="text-sm font-semibold text-red-700">✕ {b.error}</p>}
    </div>
  )
}
