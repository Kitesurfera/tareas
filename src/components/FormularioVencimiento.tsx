import { useEffect, useState, type FormEvent } from 'react'
import { MAX_ARCHIVOS, subirVarios, useArchivosNuevos } from '../lib/documentos'
import { mensajeDeError } from '../lib/errores'
import { cuandoToca, euros, fechaLarga, sumarDias, textoFrecuenciaMeses, textoPeriodo } from '../lib/fechas'
import { ir, volver } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import type { TipoVencimiento, Vencimiento } from '../lib/tipos'
import { useMiembros } from '../lib/useMiembros'
import { avisoError, botonPrincipal, campo, campoBase, estiloChip } from './estilos'
import { BotonElegirArchivos, Miniatura } from './PiezasDocumentos'

type Comun = {
  hogarId: string
  miUserId: string
}

const FRECUENCIAS: (number | null)[] = [1, 3, 6, 12, null]
// En las suscripciones, lo normal es pagar al mes o al año; el resto, en «Otra».
const OTRAS_FRECUENCIAS: (number | null)[] = [3, 6, null]
const AVISOS: { dias: number | null; texto: string }[] = [
  { dias: null, texto: 'Sin aviso' },
  { dias: 0, texto: 'El mismo día' },
  { dias: 3, texto: '3 días antes' },
  { dias: 7, texto: '1 semana antes' },
  { dias: 30, texto: '1 mes antes' },
]

// Aviso que proponemos según el tipo y la frecuencia.
function avisoHabitual(tipo: TipoVencimiento, meses: number | null): number | null {
  if (tipo === 'seguro') return 30
  if (meses === 1) return null // las mensuales se renuevan solas; avisar cada mes cansa
  return 7
}

// Pantalla para añadir un seguro o una suscripción.
export function PantallaNuevoVencimiento({ tipo, ...comun }: Comun & { tipo: TipoVencimiento }) {
  return <Formulario tipoInicial={tipo} {...comun} />
}

// Un documento que ya va con este seguro o suscripción.
type Adjunto = { id: string; titulo: string; archivos: number }

// Pantalla para editar uno que ya existe (con sus documentos).
export function PantallaEditarVencimiento({ id, ...comun }: Comun & { id: string }) {
  const [estado, setEstado] = useState<{ vencimiento: Vencimiento | null; documentos: Adjunto[]; error?: string } | null>(null)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    Promise.all([
      supabase.from('vencimientos').select('*').eq('id', id).maybeSingle(),
      supabase.from('documentos').select('id, titulo').eq('vencimiento_id', id).order('titulo'),
      supabase.from('documento_archivos').select('documento_id'),
    ]).then(([vencimiento, documentos, archivos]) => {
      if (!vigente) return
      const fallo = vencimiento.error ?? documentos.error ?? archivos.error
      if (fallo) return setEstado({ vencimiento: null, documentos: [], error: mensajeDeError(fallo) })
      const deCada = (archivos.data ?? []) as { documento_id: string }[]
      setEstado({
        vencimiento: vencimiento.data as Vencimiento | null,
        documentos: ((documentos.data ?? []) as { id: string; titulo: string }[]).map((d) => ({
          ...d,
          archivos: deCada.filter((a) => a.documento_id === d.id).length,
        })),
      })
    })
    return () => {
      vigente = false
    }
  }, [id])

  if (!estado) return <Aviso texto="Cargando…" />
  if (estado.error) return <Aviso texto={estado.error} />
  if (!estado.vencimiento) return <Aviso texto="No encontramos este vencimiento en tu hogar." />
  return (
    <Formulario
      tipoInicial={estado.vencimiento.tipo}
      vencimiento={estado.vencimiento}
      documentos={estado.documentos}
      {...comun}
    />
  )
}

function Aviso({ texto }: { texto: string }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md items-center justify-center px-5 text-center text-stone-500 md:max-w-2xl md:px-6 lg:max-w-xl lg:px-10">
      {texto}
    </main>
  )
}

type Props = Comun & {
  tipoInicial: TipoVencimiento
  vencimiento?: Vencimiento
  documentos?: Adjunto[]
}

function Formulario({ hogarId, miUserId, tipoInicial, vencimiento, documentos = [] }: Props) {
  const { miembros } = useMiembros()
  const editando = Boolean(vencimiento)
  const mesesIniciales = vencimiento ? vencimiento.frecuencia_meses : tipoInicial === 'seguro' ? 12 : 1

  const [tipo, setTipo] = useState<TipoVencimiento>(tipoInicial)
  const [nombre, setNombre] = useState(vencimiento?.nombre ?? '')
  const [fecha, setFecha] = useState(vencimiento?.fecha_renovacion ?? '')
  const [meses, setMeses] = useState<number | null>(mesesIniciales)
  const [importe, setImporte] = useState(
    vencimiento?.importe != null ? Number(vencimiento.importe).toFixed(2).replace('.', ',') : '',
  )
  const [aviso, setAviso] = useState<number | null>(
    vencimiento ? vencimiento.aviso_dias : avisoHabitual(tipoInicial, mesesIniciales),
  )
  const [avisoTocado, setAvisoTocado] = useState(editando)
  // undefined = todavía no se ha elegido (se pone «yo» al cargar la gente).
  const [responsable, setResponsable] = useState<string | null | undefined>(
    vencimiento ? vencimiento.responsable_id : undefined,
  )
  const [notas, setNotas] = useState(vencimiento?.notas ?? '')
  const [guardando, setGuardando] = useState(false)
  const [progreso, setProgreso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Documento nuevo (la póliza, el contrato…): sus archivos y su nombre.
  const archivosNuevos = useArchivosNuevos()
  const nuevos = archivosNuevos.nuevos
  const [tituloDoc, setTituloDoc] = useState<string | null>(null)
  const tituloAdjunto = tituloDoc ?? (tipo === 'seguro' ? 'Póliza' : 'Contrato')
  // Si algo falla después de guardar, lo ya guardado no se repite al
  // volver a pulsar el botón: se cambia en vez de crear otro.
  const [guardadoId, setGuardadoId] = useState<string | null>(vencimiento?.id ?? null)
  const [documentoId, setDocumentoId] = useState<string | null>(null)
  const [yaSubidos, setYaSubidos] = useState(0)

  const miMiembroId = miembros?.find((m) => m.user_id === miUserId)?.id ?? null
  const responsableElegido = responsable !== undefined ? responsable : miembros ? miMiembroId : undefined
  const fechaAviso = fecha && aviso !== null ? sumarDias(fecha, -aviso) : ''
  // «Otra» se ve abierta si se ha pulsado, o si la frecuencia no es mes ni año.
  const [otrasAbierto, setOtrasAbierto] = useState(false)
  const verOtras = otrasAbierto || (meses !== 1 && meses !== 12)
  // Precio escrito («12,99» o «12.99») convertido a número, si es válido.
  const precio = importe.trim() === '' ? null : Number(importe.replace(',', '.'))
  const precioValido = precio !== null && !Number.isNaN(precio) && precio > 0

  // Si aún no ha elegido aviso, proponemos el habitual.
  function cambiarTipoOFrecuencia(nuevoTipo: TipoVencimiento, nuevosMeses: number | null) {
    setTipo(nuevoTipo)
    setMeses(nuevosMeses)
    if (!avisoTocado) setAviso(avisoHabitual(nuevoTipo, nuevosMeses))
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    if (!supabase) return
    // Aceptamos «12,99» y «12.99».
    const numero = precio
    if (numero !== null && (Number.isNaN(numero) || numero < 0 || numero >= 1_000_000)) {
      setError('Escribe el importe como un número, por ejemplo 12,99.')
      return
    }
    setGuardando(true)
    setError(null)
    const datos = {
      tipo,
      nombre: nombre.trim(),
      fecha_renovacion: fecha,
      frecuencia_meses: meses,
      importe: numero === null ? null : Math.round(numero * 100) / 100,
      aviso_dias: aviso,
      responsable_id: responsableElegido ?? null,
      notas: notas.trim() || null,
    }
    let id = guardadoId
    if (id) {
      const { error } = await supabase.from('vencimientos').update(datos).eq('id', id)
      if (error) return fallar(mensajeDeError(error))
    } else {
      const { data, error } = await supabase.from('vencimientos').insert({ hogar_id: hogarId, ...datos }).select('id').single()
      if (error || !data) return fallar(mensajeDeError(error))
      id = (data as { id: string }).id
      setGuardadoId(id)
    }

    // El documento adjunto: se crea (enlazado a este seguro o suscripción) y
    // se suben sus archivos, igual que desde 📂 Documentos.
    if (nuevos.length > 0) {
      const guardado = tipo === 'seguro' ? 'El seguro se ha guardado' : 'La suscripción se ha guardado'
      let docId = documentoId
      if (!docId) {
        const { data, error } = await supabase
          .from('documentos')
          .insert({ hogar_id: hogarId, titulo: tituloAdjunto.trim(), tipo: tipo === 'seguro' ? 'seguro' : 'otros', vencimiento_id: id })
          .select('id')
          .single()
        if (error || !data) return fallar(`${guardado}, pero el documento no: ${mensajeDeError(error)}`)
        docId = (data as { id: string }).id
        setDocumentoId(docId)
      }
      const subida = await subirVarios(hogarId, docId, nuevos.map((n) => n.archivo), yaSubidos, (i) =>
        setProgreso(nuevos.length > 1 ? `Subiendo ${i + 1} de ${nuevos.length}…` : 'Subiendo…'),
      )
      if (subida.error) {
        // Lo ya subido se queda; lo que falta sigue en la lista para reintentar.
        archivosNuevos.olvidarSubidos(subida.subidos)
        setYaSubidos(yaSubidos + subida.subidos)
        return fallar(`${guardado}, pero ${subida.error.charAt(0).toLowerCase() + subida.error.slice(1)} Prueba otra vez.`)
      }
    }
    volver('/vencimientos')
  }

  function fallar(mensaje: string) {
    setError(mensaje)
    setProgreso(null)
    setGuardando(false)
  }

  async function borrar() {
    if (!supabase || !vencimiento) return
    const aviso = documentos.length > 0 ? ' Sus documentos no se borran: se quedan en 📂 Documentos.' : ''
    if (!window.confirm(`¿Borrar «${vencimiento.nombre}»? También se borrarán sus avisos.${aviso}`)) return
    setGuardando(true)
    const { error } = await supabase.from('vencimientos').delete().eq('id', vencimiento.id)
    if (error) {
      setError(mensajeDeError(error))
      setGuardando(false)
      return
    }
    volver('/vencimientos')
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-6 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-xl lg:px-10 lg:py-10">
      <button
        type="button"
        onClick={() => volver('/vencimientos')}
        className="self-start text-sm font-medium text-marca"
      >
        ← Cancelar
      </button>

      <h1 className="text-2xl font-extrabold text-marca">
        {editando ? `Editar ${tipo === 'seguro' ? 'seguro' : 'suscripción'}` : tipo === 'seguro' ? 'Nuevo seguro' : 'Nueva suscripción'}
      </h1>

      <form onSubmit={guardar} className="tarjeta flex flex-col gap-5">
        <div className="flex gap-2">
          {(
            [
              ['seguro', '🛡️ Seguro'],
              ['suscripcion', '🔁 Suscripción'],
            ] as const
          ).map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              aria-pressed={tipo === valor}
              onClick={() => cambiarTipoOFrecuencia(valor, meses)}
              className={estiloChip(tipo === valor)}
            >
              {texto}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">Nombre</span>
          <input
            className={campo}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={tipo === 'seguro' ? 'Por ejemplo: Seguro del coche' : 'Por ejemplo: Netflix'}
            maxLength={60}
            required
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">¿Cuándo se renueva?</span>
          <input
            type="date"
            className={campo}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            min="2000-01-02"
            required
          />
          <span className="text-xs text-stone-500">
            {tipo === 'seguro'
              ? 'La fecha de vencimiento que aparece en la póliza.'
              : 'El próximo cobro, o el día en que se acaba la prueba gratis.'}
          </span>
        </label>

        {tipo === 'suscripcion' ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium text-stone-700">¿Cómo se paga?</legend>
            <div className="grid grid-cols-3 gap-1 rounded-full bg-stone-200 p-1">
              {(
                [
                  [1, 'Mensual'],
                  [12, 'Anual'],
                ] as const
              ).map(([valor, texto]) => (
                <button
                  key={valor}
                  type="button"
                  aria-pressed={!verOtras && meses === valor}
                  onClick={() => {
                    setOtrasAbierto(false)
                    cambiarTipoOFrecuencia(tipo, valor)
                  }}
                  className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                    !verOtras && meses === valor ? 'bg-white text-marca shadow-sm' : 'text-stone-600'
                  }`}
                >
                  {texto}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={verOtras}
                onClick={() => {
                  setOtrasAbierto(true)
                  if (meses === 1 || meses === 12) cambiarTipoOFrecuencia(tipo, 3)
                }}
                className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                  verOtras ? 'bg-white text-marca shadow-sm' : 'text-stone-600'
                }`}
              >
                Otra
              </button>
            </div>
            {verOtras && (
              <div className="flex flex-wrap gap-2">
                {OTRAS_FRECUENCIAS.map((opcion) => (
                  <button
                    key={String(opcion)}
                    type="button"
                    aria-pressed={meses === opcion}
                    onClick={() => cambiarTipoOFrecuencia(tipo, opcion)}
                    className={estiloChip(meses === opcion)}
                  >
                    {opcion === null ? 'Una sola vez (prueba gratis…)' : textoFrecuenciaMeses(opcion).replace('cada', 'Cada')}
                  </button>
                ))}
              </div>
            )}
          </fieldset>
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium text-stone-700">¿Cada cuánto se renueva?</legend>
            <div className="flex flex-wrap gap-2">
              {FRECUENCIAS.map((opcion) => (
                <button
                  key={String(opcion)}
                  type="button"
                  aria-pressed={meses === opcion}
                  onClick={() => cambiarTipoOFrecuencia(tipo, opcion)}
                  className={estiloChip(meses === opcion)}
                >
                  {opcion === null ? 'No se repite' : textoFrecuenciaMeses(opcion).replace('cada', 'Cada')}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">
            {tipo === 'suscripcion' ? 'Precio' : 'Importe'}{' '}
            <span className="font-normal text-stone-400">(opcional)</span>
          </span>
          <div className="flex items-center gap-2">
            <input
              className={`${campoBase} w-36`}
              value={importe}
              onChange={(e) => setImporte(e.target.value)}
              inputMode="decimal"
              placeholder="12,99"
              maxLength={12}
            />
            <span className="text-stone-600">€ {textoPeriodo(meses)}</span>
          </div>
          {precioValido && meses !== null && (
            <span className="text-xs text-stone-500">
              {meses === 1
                ? `Al año son ${euros(precio * 12)}.`
                : meses === 12
                  ? `Al mes salen ${euros(precio / 12)}.`
                  : `Al mes salen ${euros(precio / meses)}; al año, ${euros((precio / meses) * 12)}.`}
            </span>
          )}
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-stone-700">¿Cuándo avisar?</legend>
          <div className="flex flex-wrap gap-2">
            {AVISOS.map((opcion) => (
              <button
                key={String(opcion.dias)}
                type="button"
                aria-pressed={aviso === opcion.dias}
                onClick={() => {
                  setAviso(opcion.dias)
                  setAvisoTocado(true)
                }}
                className={estiloChip(aviso === opcion.dias)}
              >
                {opcion.texto}
              </button>
            ))}
          </div>
          {tipo === 'seguro' && (
            <span className="text-xs text-stone-500">
              Si no quieres renovar un seguro, normalmente hay que avisar a la
              aseguradora con al menos un mes de antelación.
            </span>
          )}
        </fieldset>

        {fecha && (
          <p className="rounded-xl bg-marca-suave p-3 text-sm text-marca">
            {fechaAviso ? (
              <>
                Os avisaremos el <strong>{fechaLarga(fechaAviso)}</strong> ({cuandoToca(fechaAviso).toLowerCase()}).
              </>
            ) : (
              'Sin aviso: solo aparecerá en esta pestaña.'
            )}
          </p>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-stone-700">¿Quién se encarga?</legend>
          <div className="flex flex-wrap gap-2">
            {miembros?.map((miembro) => (
              <button
                key={miembro.id}
                type="button"
                aria-pressed={responsableElegido === miembro.id}
                onClick={() => setResponsable(miembro.id)}
                className={estiloChip(responsableElegido === miembro.id)}
              >
                {miembro.nombre_visible}
                {miembro.user_id === miUserId && ' (tú)'}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={responsableElegido === null}
              onClick={() => setResponsable(null)}
              className={estiloChip(responsableElegido === null)}
            >
              Sin asignar
            </button>
          </div>
        </fieldset>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">
            Notas <span className="font-normal text-stone-400">(opcional)</span>
          </span>
          <textarea
            className={`${campo} min-h-20`}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            maxLength={2000}
            placeholder="Compañía, teléfono, qué cubre…"
          />
          <span className="text-xs text-stone-500">
            No guardes aquí contraseñas ni números de tarjeta.
          </span>
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-stone-700">
            📎 Documentos <span className="font-normal text-stone-400">(opcional)</span>
          </legend>
          <p className="-mt-1 text-xs text-stone-500">
            {tipo === 'seguro' ? 'La póliza, el recibo o las condiciones' : 'El contrato o las facturas'}, en fotos o
            PDF. También aparecen en 📂 Documentos.
          </p>
          {documentos.length > 0 && (
            <ul className="flex flex-col gap-2">
              {documentos.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => ir(`/documentos/${d.id}`)}
                    className="flex w-full items-center gap-2 rounded-2xl bg-vencimientos px-3 py-2 text-left text-sm text-vencimientos-tinta"
                  >
                    <span aria-hidden="true">📎</span>
                    <span className="min-w-0 flex-1 font-semibold">{d.titulo}</span>
                    <span className="shrink-0 text-xs">
                      {d.archivos === 0 ? 'Sin archivos' : d.archivos === 1 ? '1 archivo' : `${d.archivos} archivos`} ›
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {nuevos.length > 0 && (
            <div className="flex flex-col gap-3 rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-900/5">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-stone-700">Nombre del documento</span>
                <input
                  className={campo}
                  value={tituloAdjunto}
                  onChange={(e) => setTituloDoc(e.target.value)}
                  maxLength={80}
                  required
                />
              </label>
              <ul className="grid grid-cols-3 gap-2">
                {nuevos.map((n, i) => (
                  <Miniatura
                    key={n.clave}
                    vista={n.vista}
                    nombre={n.archivo.name}
                    detalle="Nuevo"
                    etiqueta={`Quitar el archivo ${i + 1}`}
                    onQuitar={() => archivosNuevos.quitar(n.clave)}
                  />
                ))}
              </ul>
            </div>
          )}
          {nuevos.length < MAX_ARCHIVOS && (
            <BotonElegirArchivos
              texto={
                nuevos.length > 0
                  ? '+ Añadir más'
                  : documentos.length > 0
                    ? '📎 Adjuntar otro documento'
                    : '📎 Adjuntar fotos o PDF'
              }
              onElegir={(lista) => setError(archivosNuevos.anadir(lista, MAX_ARCHIVOS - nuevos.length))}
            />
          )}
          <p className="text-xs text-stone-500">
            Hasta {MAX_ARCHIVOS} archivos por documento. Las fotos se reducen y pierden la ubicación GPS. PDF de hasta
            10 MB.
          </p>
        </fieldset>

        {error && <p role="alert" className={avisoError}>{error}</p>}

        <button type="submit" disabled={guardando} className={botonPrincipal}>
          {progreso ?? (guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Añadir')}
        </button>
      </form>

      {editando && (
        <button
          type="button"
          onClick={borrar}
          disabled={guardando}
          className="self-center px-4 py-2 text-sm font-medium text-red-700"
        >
          Borrar
        </button>
      )}
    </main>
  )
}
