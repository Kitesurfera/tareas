import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  AVISOS_DOCUMENTO,
  borrarArchivos,
  enlacesTemporales,
  infoTipoDocumento,
  MAX_ARCHIVOS,
  subirVarios,
  tamanoLegible,
  TIPOS_DOCUMENTO,
  type ArchivoDocumento,
  type Documento,
  type TipoDocumento,
  useArchivosNuevos,
} from '../lib/documentos'
import { mensajeDeError } from '../lib/errores'
import { fechaLarga } from '../lib/fechas'
import { reemplazar, volver } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import type { Vencimiento } from '../lib/tipos'
import { useMiembros } from '../lib/useMiembros'
import { avisoError, botonPrincipal, campo, estiloChip } from './estilos'
import { BotonElegirArchivos, Miniatura } from './PiezasDocumentos'

type Props = { hogarId: string; miUserId: string; id?: string }

// #/documentos/nuevo y #/documentos/<id>/editar
export function FormularioDocumento({ hogarId, miUserId, id }: Props) {
  const [cargado, setCargado] = useState<{ documento: Documento | null; archivos: ArchivoDocumento[]; vencimientos: Vencimiento[] } | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    Promise.all([
      id ? supabase.from('documentos').select('*').eq('id', id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      id ? supabase.from('documento_archivos').select('*').eq('documento_id', id).order('orden') : Promise.resolve({ data: [], error: null }),
      supabase.from('vencimientos').select('*').order('nombre'),
    ]).then(([documento, archivos, vencimientos]) => {
      if (!vigente) return
      const fallo = documento.error ?? archivos.error ?? vencimientos.error
      if (fallo) return setErrorCarga(mensajeDeError(fallo))
      setCargado({
        documento: documento.data as Documento | null,
        archivos: (archivos.data ?? []) as ArchivoDocumento[],
        vencimientos: (vencimientos.data ?? []) as Vencimiento[],
      })
    })
    return () => {
      vigente = false
    }
  }, [id])

  if (errorCarga) return <Aviso>{errorCarga}</Aviso>
  if (!cargado) return <Aviso>Cargando…</Aviso>
  if (id && !cargado.documento) return <Aviso>No encontramos este documento en tu hogar.</Aviso>
  return <Formulario hogarId={hogarId} miUserId={miUserId} {...cargado} />
}

function Aviso({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md items-center justify-center px-5 text-center text-stone-500 md:max-w-2xl md:px-6 lg:max-w-xl lg:px-10">
      <p>{children}</p>
    </main>
  )
}

function Formulario({
  hogarId,
  miUserId,
  documento,
  archivos,
  vencimientos,
}: {
  hogarId: string
  miUserId: string
  documento: Documento | null
  archivos: ArchivoDocumento[]
  vencimientos: Vencimiento[]
}) {
  const { miembros } = useMiembros()
  const [titulo, setTitulo] = useState(documento?.titulo ?? '')
  const [tipo, setTipo] = useState<TipoDocumento>(documento?.tipo ?? 'identidad')
  const [personaId, setPersonaId] = useState<string | null>(documento?.persona_id ?? null)
  const [vencimientoId, setVencimientoId] = useState<string | null>(documento?.vencimiento_id ?? null)
  const [caducaEl, setCaducaEl] = useState(documento?.caduca_el ?? '')
  const [avisoDias, setAvisoDias] = useState<number | null>(documento?.aviso_dias ?? null)
  // undefined = todavía sin elegir (al guardar: la persona del documento o tú).
  const [responsable, setResponsable] = useState<string | null | undefined>(documento ? documento.responsable_id : undefined)
  const [notas, setNotas] = useState(documento?.notas ?? '')
  const [quitar, setQuitar] = useState<Set<string>>(new Set()) // ids de archivos que ya estaban
  const archivosNuevos = useArchivosNuevos()
  const nuevos = archivosNuevos.nuevos
  const [enlaces, setEnlaces] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState<string | null>(null) // texto de progreso
  const [error, setError] = useState<string | null>(null)
  // Si al crear el documento falla la subida de un archivo, ya existe: los
  // siguientes intentos lo cambian en vez de crear otro.
  const [creadoId, setCreadoId] = useState<string | null>(documento?.id ?? null)

  // Vistas de los archivos que ya estaban.
  useEffect(() => {
    enlacesTemporales(archivos.filter((a) => a.tipo_mime === 'image/jpeg').map((a) => a.ruta)).then(setEnlaces)
  }, [archivos])

  const miMiembroId = miembros?.find((m) => m.user_id === miUserId)?.id ?? null
  const responsableElegido = responsable !== undefined ? responsable : (personaId ?? miMiembroId)
  const quedan = archivos.filter((a) => !quitar.has(a.id))
  const total = quedan.length + nuevos.length

  function anadir(lista: File[]) {
    setError(archivosNuevos.anadir(lista, MAX_ARCHIVOS - total))
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    if (!supabase) return
    if (avisoDias !== null && !caducaEl) return setError('Para avisar, pon antes la fecha de caducidad.')
    setError(null)
    setGuardando('Guardando…')
    const datos = {
      titulo: titulo.trim(),
      tipo,
      persona_id: personaId,
      vencimiento_id: vencimientoId,
      caduca_el: caducaEl || null,
      aviso_dias: caducaEl ? avisoDias : null,
      responsable_id: caducaEl && avisoDias !== null ? responsableElegido : null,
      notas: notas.trim() || null,
    }
    let docId = creadoId
    if (docId) {
      const { error } = await supabase.from('documentos').update(datos).eq('id', docId)
      if (error) {
        setGuardando(null)
        return setError(mensajeDeError(error))
      }
    } else {
      const { data, error } = await supabase.from('documentos').insert({ hogar_id: hogarId, ...datos }).select('id').single()
      if (error || !data) {
        setGuardando(null)
        return setError(mensajeDeError(error))
      }
      docId = (data as { id: string }).id
      setCreadoId(docId)
    }

    // Primero se quitan los archivos que has quitado; luego se suben los nuevos.
    const fallo = await borrarArchivos(archivos.filter((a) => quitar.has(a.id)))
    if (fallo) {
      setGuardando(null)
      return setError(fallo)
    }
    const orden = Math.max(-1, ...quedan.map((a) => a.orden)) + 1
    const subida = await subirVarios(hogarId, docId, nuevos.map((n) => n.archivo), orden, (i) =>
      setGuardando(nuevos.length > 1 ? `Subiendo ${i + 1} de ${nuevos.length}…` : 'Subiendo…'),
    )
    if (subida.error) {
      // Lo ya subido se queda; lo que falta sigue en la lista para reintentar.
      archivosNuevos.olvidarSubidos(subida.subidos)
      setGuardando(null)
      return setError(`El documento se ha guardado, pero ${subida.error.charAt(0).toLowerCase() + subida.error.slice(1)} Prueba otra vez.`)
    }
    setGuardando(null)
    reemplazar(`/documentos/${docId}`)
  }

  const persona = miembros?.find((m) => m.id === personaId)
  const placeholder = tipo === 'identidad' && persona ? `DNI de ${persona.nombre_visible}` : `Por ejemplo: ${infoTipoDocumento(tipo).ejemplo.split(',')[0]}`

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-6 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-xl lg:px-10 lg:py-10">
      <button type="button" onClick={() => volver(documento ? `/documentos/${documento.id}` : '/vencimientos')} className="self-start text-sm font-medium text-marca">
        ← Cancelar
      </button>
      <h1 className="text-2xl font-extrabold text-vencimientos-tinta">{documento ? 'Editar documento' : 'Nuevo documento'}</h1>

      <form onSubmit={guardar} className="tarjeta flex flex-col gap-5">
        <Opciones titulo="¿Qué es?">
          {TIPOS_DOCUMENTO.map((t) => (
            <button key={t.valor} type="button" aria-pressed={tipo === t.valor} onClick={() => setTipo(t.valor)} className={estiloChip(tipo === t.valor)}>
              {t.dibujo} {t.texto}
            </button>
          ))}
        </Opciones>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">Nombre</span>
          <input className={campo} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={placeholder} maxLength={80} required />
        </label>

        <Opciones titulo="¿De quién es?">
          {miembros?.map((m) => (
            <button key={m.id} type="button" aria-pressed={personaId === m.id} onClick={() => setPersonaId(m.id)} className={estiloChip(personaId === m.id)}>
              {m.nombre_visible}
              {m.user_id === miUserId && ' (tú)'}
            </button>
          ))}
          <button type="button" aria-pressed={personaId === null} onClick={() => setPersonaId(null)} className={estiloChip(personaId === null)}>
            De todo el hogar
          </button>
        </Opciones>

        {vencimientos.length > 0 && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-stone-700">
              ¿Va con algún seguro o suscripción? <span className="font-normal text-stone-400">(opcional)</span>
            </span>
            <select className={campo} value={vencimientoId ?? ''} onChange={(e) => setVencimientoId(e.target.value || null)}>
              <option value="">No</option>
              {vencimientos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.tipo === 'seguro' ? '🛡️' : '🔁'} {v.nombre}
                </option>
              ))}
            </select>
          </label>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-stone-700">
            Fotos o PDF <span className="font-normal text-stone-400">(hasta {MAX_ARCHIVOS})</span>
          </legend>
          {total > 0 && (
            <ul className="grid grid-cols-3 gap-2">
              {quedan.map((a, i) => (
                <Miniatura
                  key={a.id}
                  vista={a.tipo_mime === 'image/jpeg' ? enlaces[a.ruta] : null}
                  nombre={a.nombre ?? 'Archivo'}
                  detalle={tamanoLegible(a.tamano)}
                  etiqueta={`Quitar el archivo ${i + 1}`}
                  onQuitar={() => setQuitar(new Set([...quitar, a.id]))}
                />
              ))}
              {nuevos.map((n, i) => (
                <Miniatura
                  key={n.clave}
                  vista={n.vista}
                  nombre={n.archivo.name}
                  detalle="Nuevo"
                  etiqueta={`Quitar el archivo ${quedan.length + i + 1}`}
                  onQuitar={() => archivosNuevos.quitar(n.clave)}
                />
              ))}
            </ul>
          )}
          {total < MAX_ARCHIVOS && (
            <BotonElegirArchivos texto={total === 0 ? '📷 Hacer una foto o elegir archivos' : '+ Añadir más'} onElegir={anadir} />
          )}
          <p className="text-xs text-stone-500">Las fotos se reducen y pierden la ubicación GPS. PDF de hasta 10 MB.</p>
        </fieldset>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">
            ¿Cuándo caduca? <span className="font-normal text-stone-400">(opcional)</span>
          </span>
          <div className="flex gap-2">
            <input type="date" className={campo} value={caducaEl} onChange={(e) => setCaducaEl(e.target.value)} />
            {caducaEl && (
              <button type="button" onClick={() => setCaducaEl('')} className="shrink-0 px-2 text-sm text-stone-500">
                Quitar
              </button>
            )}
          </div>
          {caducaEl && <span className="text-xs text-stone-500">{fechaLarga(caducaEl)}</span>}
        </label>

        {caducaEl && (
          <>
            <Opciones titulo="¿Cuándo os aviso para renovarlo?">
              <button type="button" aria-pressed={avisoDias === null} onClick={() => setAvisoDias(null)} className={estiloChip(avisoDias === null)}>
                Sin aviso
              </button>
              {AVISOS_DOCUMENTO.map((a) => (
                <button key={a.dias} type="button" aria-pressed={avisoDias === a.dias} onClick={() => setAvisoDias(a.dias)} className={estiloChip(avisoDias === a.dias)}>
                  {a.texto}
                </button>
              ))}
            </Opciones>
            {avisoDias !== null && (
              <Opciones titulo="¿Quién se encarga de renovarlo?">
                {miembros?.map((m) => (
                  <button key={m.id} type="button" aria-pressed={responsableElegido === m.id} onClick={() => setResponsable(m.id)} className={estiloChip(responsableElegido === m.id)}>
                    {m.nombre_visible}
                    {m.user_id === miUserId && ' (tú)'}
                  </button>
                ))}
                <button type="button" aria-pressed={responsableElegido === null} onClick={() => setResponsable(null)} className={estiloChip(responsableElegido === null)}>
                  Sin asignar
                </button>
              </Opciones>
            )}
          </>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">
            Notas <span className="font-normal text-stone-400">(opcional)</span>
          </span>
          <textarea className={`${campo} min-h-20`} value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={2000} placeholder="Dónde está el original, número de póliza…" />
        </label>

        {error && <p role="alert" className={avisoError}>{error}</p>}

        <button type="submit" disabled={guardando !== null || !titulo.trim()} className={botonPrincipal}>
          {guardando ?? (documento ? 'Guardar cambios' : 'Guardar documento')}
        </button>
      </form>
    </main>
  )
}

function Opciones({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium text-stone-700">{titulo}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  )
}
