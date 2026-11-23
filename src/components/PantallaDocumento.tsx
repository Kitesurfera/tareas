import { useEffect, useState } from 'react'
import {
  AVISOS_DOCUMENTO,
  borrarDocumento,
  enlacesTemporales,
  estadoCaducidad,
  infoTipoDocumento,
  tamanoLegible,
  useDocumentos,
} from '../lib/documentos'
import { fechaLarga } from '../lib/fechas'
import { ir, reemplazar, volver } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import type { Vencimiento } from '../lib/tipos'
import { useMiembros } from '../lib/useMiembros'
import { avisoError, botonSecundario } from './estilos'
import { Etiqueta } from './Piezas'

// Los enlaces a los archivos caducan en 5 minutos: los renovamos cada 4.
const RENOVAR_ENLACES_MS = 4 * 60 * 1000

// #/documentos/<id>: la ficha de un documento con sus fotos y PDF.
export function PantallaDocumento({ id }: { id: string }) {
  const { datos, error } = useDocumentos()
  const { miembros } = useMiembros()
  const [vencimiento, setVencimiento] = useState<Vencimiento | null>(null)
  const [enlaces, setEnlaces] = useState<Record<string, string>>({})
  const [borrando, setBorrando] = useState(false)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)

  const documento = datos?.documentos.find((d) => d.id === id)
  const archivos = datos?.archivos.filter((a) => a.documento_id === id) ?? []
  const rutas = archivos.map((a) => a.ruta).join('|')

  // Enlaces temporales para ver los archivos (y se renuevan solos).
  useEffect(() => {
    if (!rutas) return
    let vigente = true
    const pedir = () =>
      enlacesTemporales(rutas.split('|')).then((nuevos) => {
        if (vigente) setEnlaces(nuevos)
      })
    pedir()
    const reloj = window.setInterval(pedir, RENOVAR_ENLACES_MS)
    return () => {
      vigente = false
      window.clearInterval(reloj)
    }
  }, [rutas])

  // El seguro o la suscripción con la que va.
  const vencimientoId = documento?.vencimiento_id ?? null
  useEffect(() => {
    if (!supabase || !vencimientoId) return
    let vigente = true
    supabase
      .from('vencimientos')
      .select('*')
      .eq('id', vencimientoId)
      .maybeSingle()
      .then(({ data }) => {
        if (vigente) setVencimiento(data as Vencimiento | null)
      })
    return () => {
      vigente = false
    }
  }, [vencimientoId])

  async function borrar() {
    if (!documento) return
    if (!window.confirm(`¿Borrar «${documento.titulo}» y sus archivos? No se puede deshacer.`)) return
    setBorrando(true)
    setErrorAccion(null)
    const fallo = await borrarDocumento(documento, archivos)
    setBorrando(false)
    if (fallo) return setErrorAccion(fallo)
    reemplazar('/vencimientos')
  }

  const nombreDe = (miembroId: string | null) => miembros?.find((m) => m.id === miembroId)?.nombre_visible

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-3xl lg:px-10 lg:py-10">
      <button type="button" onClick={() => volver('/vencimientos')} className="self-start text-sm font-medium text-marca">
        ← Vencimientos
      </button>

      {error && <p role="alert" className={avisoError}>{error}</p>}
      {datos === null && !error && <p className="text-center text-stone-400">Cargando…</p>}
      {datos && !documento && <p className="text-center text-stone-500">No encontramos este documento en tu hogar.</p>}

      {documento && (
        <>
          <header className="flex items-start gap-4">
            <span aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-vencimientos text-4xl">
              {infoTipoDocumento(documento.tipo).dibujo}
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl leading-tight font-extrabold text-vencimientos-tinta">{documento.titulo}</h1>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Etiqueta className="bg-vencimientos text-vencimientos-tinta">{infoTipoDocumento(documento.tipo).texto}</Etiqueta>
                <Etiqueta className="bg-stone-100 text-stone-600">
                  👤 {nombreDe(documento.persona_id) ?? 'De todo el hogar'}
                </Etiqueta>
                {estadoCaducidad(documento.caduca_el) && (
                  <Etiqueta className={estadoCaducidad(documento.caduca_el)!.clase}>{estadoCaducidad(documento.caduca_el)!.texto}</Etiqueta>
                )}
              </div>
            </div>
          </header>

          <section className="tarjeta flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-stone-500">
              📎 {archivos.length === 0 ? 'Sin archivos' : archivos.length === 1 ? '1 archivo' : `${archivos.length} archivos`}
            </h2>
            {archivos.length === 0 && (
              <p className="text-sm text-stone-500">Añade una foto o el PDF desde «Editar».</p>
            )}
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {archivos.map((a, i) => {
                const enlace = enlaces[a.ruta]
                return (
                  <li key={a.id}>
                    <a
                      href={enlace}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-disabled={!enlace}
                      onClick={(e) => {
                        if (!enlace) e.preventDefault()
                      }}
                      className="flex h-full flex-col overflow-hidden rounded-2xl bg-stone-50 ring-1 ring-stone-900/5 transition hover:ring-marca/40"
                    >
                      {a.tipo_mime === 'application/pdf' ? (
                        <span className="flex aspect-[3/4] flex-col items-center justify-center gap-2 p-3 text-center">
                          <span aria-hidden="true" className="text-4xl">📄</span>
                          <span className="line-clamp-2 text-xs font-medium break-all text-stone-700">{a.nombre ?? 'Documento.pdf'}</span>
                        </span>
                      ) : enlace ? (
                        <img src={enlace} alt={`${documento.titulo}, foto ${i + 1}`} className="aspect-[3/4] w-full object-cover" />
                      ) : (
                        <span className="flex aspect-[3/4] items-center justify-center text-sm text-stone-400">Cargando…</span>
                      )}
                      <span className="px-3 py-2 text-xs text-stone-500">
                        {a.tipo_mime === 'application/pdf' ? 'Abrir PDF' : 'Ver en grande'} · {tamanoLegible(a.tamano)}
                      </span>
                    </a>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="tarjeta">
            <dl className="flex flex-col gap-3">
              <div>
                <dt className="text-sm text-stone-500">Caduca</dt>
                <dd className="font-medium">{documento.caduca_el ? fechaLarga(documento.caduca_el) : 'No caduca (o no lo has apuntado)'}</dd>
              </div>
              {documento.caduca_el && (
                <div>
                  <dt className="text-sm text-stone-500">Aviso</dt>
                  <dd className="font-medium">
                    {documento.aviso_dias === null
                      ? 'Sin aviso'
                      : `${AVISOS_DOCUMENTO.find((a) => a.dias === documento.aviso_dias)?.texto ?? `${documento.aviso_dias} días antes`}: tarea «Renovar: ${documento.titulo}»`}
                    {documento.aviso_dias !== null && ` · ${nombreDe(documento.responsable_id) ?? 'sin responsable'}`}
                  </dd>
                </div>
              )}
              {documento.vencimiento_id && (
                <div>
                  <dt className="text-sm text-stone-500">Va con</dt>
                  <dd>
                    <button type="button" onClick={() => ir(`/vencimientos/${documento.vencimiento_id}/editar`)} className="font-medium text-marca underline">
                      🛡️ {vencimiento?.nombre ?? 'Su seguro o suscripción'}
                    </button>
                  </dd>
                </div>
              )}
              {documento.notas && (
                <div>
                  <dt className="text-sm text-stone-500">Notas</dt>
                  <dd className="whitespace-pre-line">{documento.notas}</dd>
                </div>
              )}
            </dl>
          </section>

          {errorAccion && <p role="alert" className={avisoError}>{errorAccion}</p>}

          <button type="button" onClick={() => ir(`/documentos/${documento.id}/editar`)} className={botonSecundario}>
            Editar documento
          </button>
          <button type="button" onClick={borrar} disabled={borrando} className="self-center px-4 py-2 text-sm font-medium text-red-700">
            {borrando ? 'Borrando…' : 'Borrar documento'}
          </button>
        </>
      )}
    </main>
  )
}
