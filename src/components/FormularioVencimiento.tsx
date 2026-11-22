import { useEffect, useState, type FormEvent } from 'react'
import { mensajeDeError } from '../lib/errores'
import { cuandoToca, euros, fechaLarga, sumarDias, textoFrecuenciaMeses, textoPeriodo } from '../lib/fechas'
import { volver } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import type { TipoVencimiento, Vencimiento } from '../lib/tipos'
import { useMiembros } from '../lib/useMiembros'
import { avisoError, botonPrincipal, campo, campoBase, estiloChip } from './estilos'

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

// Pantalla para editar uno que ya existe.
export function PantallaEditarVencimiento({ id, ...comun }: Comun & { id: string }) {
  const [estado, setEstado] = useState<{ vencimiento: Vencimiento | null; error?: string } | null>(null)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    supabase
      .from('vencimientos')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vigente) return
        setEstado(
          error ? { vencimiento: null, error: mensajeDeError(error) } : { vencimiento: data as Vencimiento | null },
        )
      })
    return () => {
      vigente = false
    }
  }, [id])

  if (!estado) return <Aviso texto="Cargando…" />
  if (estado.error) return <Aviso texto={estado.error} />
  if (!estado.vencimiento) return <Aviso texto="No encontramos este vencimiento en tu hogar." />
  return <Formulario tipoInicial={estado.vencimiento.tipo} vencimiento={estado.vencimiento} {...comun} />
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
}

function Formulario({ hogarId, miUserId, tipoInicial, vencimiento }: Props) {
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
  const [error, setError] = useState<string | null>(null)

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
    const { error } = vencimiento
      ? await supabase.from('vencimientos').update(datos).eq('id', vencimiento.id)
      : await supabase.from('vencimientos').insert({ hogar_id: hogarId, ...datos })
    if (error) {
      setError(mensajeDeError(error))
      setGuardando(false)
      return
    }
    volver('/vencimientos')
  }

  async function borrar() {
    if (!supabase || !vencimiento) return
    if (!window.confirm(`¿Borrar «${vencimiento.nombre}»? También se borrarán sus avisos.`)) return
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

        {error && <p role="alert" className={avisoError}>{error}</p>}

        <button type="submit" disabled={guardando} className={botonPrincipal}>
          {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Añadir'}
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
