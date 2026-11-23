import { useState } from 'react'
import { diasHasta } from '../lib/fechas'
import { estadoCaducidad, infoTipoDocumento, TIPOS_DOCUMENTO, type DatosDocumentos, type TipoDocumento } from '../lib/documentos'
import { ir } from '../lib/ruta'
import type { Miembro, Vencimiento } from '../lib/tipos'
import { avisoError, botonSecundario, estiloChip } from './estilos'
import { Etiqueta, TituloSeccion, Vacio } from './Piezas'

type Props = {
  datos: DatosDocumentos | null
  error: string | null
  miembros: Miembro[] | null
  vencimientos: Vencimiento[] | null
}

// En la pestaña Vencimientos: «📂 Documentos» (pólizas, ITV, DNI…).
// Primero los que caducan pronto o ya caducaron; luego, por orden alfabético.
export function SeccionDocumentos({ datos, error, miembros, vencimientos }: Props) {
  const [filtro, setFiltro] = useState<TipoDocumento | null>(null)
  const tiposConDocumentos = TIPOS_DOCUMENTO.filter((t) => datos?.documentos.some((d) => d.tipo === t.valor))
  const urgente = (caduca: string | null) => caduca !== null && diasHasta(caduca) <= 60
  const lista = (datos?.documentos ?? [])
    .filter((d) => !filtro || d.tipo === filtro)
    .sort((a, b) => {
      const ua = urgente(a.caduca_el)
      const ub = urgente(b.caduca_el)
      if (ua !== ub) return ua ? -1 : 1
      if (ua && ub) return (a.caduca_el ?? '').localeCompare(b.caduca_el ?? '')
      return a.titulo.localeCompare(b.titulo, 'es')
    })

  return (
    <section className="tarjeta flex flex-col gap-3">
      <TituloSeccion dibujo="📂" titulo="Documentos" subtitulo="Pólizas, ITV, DNI, garantías… siempre a mano" color="vencimientos" />

      {error && <p role="alert" className={avisoError}>{error}</p>}
      {datos === null && !error && <p className="text-sm text-stone-400">Cargando…</p>}

      {datos?.documentos.length === 0 && (
        <Vacio dibujo="🗂️" color="vencimientos">
          Guardad aquí la foto o el PDF de vuestros papeles. Si caducan, la app os avisa antes de que haya que
          renovarlos.
        </Vacio>
      )}

      {tiposConDocumentos.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={!filtro} onClick={() => setFiltro(null)} className={estiloChip(!filtro)}>
            Todos
          </button>
          {tiposConDocumentos.map((t) => (
            <button key={t.valor} type="button" aria-pressed={filtro === t.valor} onClick={() => setFiltro(t.valor)} className={estiloChip(filtro === t.valor)}>
              {t.dibujo} {t.texto}
            </button>
          ))}
        </div>
      )}

      {lista.length > 0 && datos && (
        <ul className="divide-y divide-stone-100">
          {lista.map((d) => {
            const tipo = infoTipoDocumento(d.tipo)
            const estado = estadoCaducidad(d.caduca_el)
            const persona = miembros?.find((m) => m.id === d.persona_id)?.nombre_visible
            const seguro = vencimientos?.find((v) => v.id === d.vencimiento_id)?.nombre
            const archivos = datos.archivos.filter((a) => a.documento_id === d.id).length
            return (
              <li key={d.id}>
                <button type="button" onClick={() => ir(`/documentos/${d.id}`)} className="flex w-full items-start gap-3 py-3 text-left">
                  <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-vencimientos text-xl">
                    {tipo.dibujo}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{d.titulo}</span>
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      {estado && <Etiqueta className={estado.clase}>{estado.texto}</Etiqueta>}
                      {persona && <Etiqueta className="bg-stone-100 text-stone-600">👤 {persona}</Etiqueta>}
                      {seguro && <Etiqueta className="bg-vencimientos text-vencimientos-tinta">🛡️ {seguro}</Etiqueta>}
                      <Etiqueta className="bg-stone-100 text-stone-600">
                        📎 {archivos === 0 ? 'Sin archivos' : archivos === 1 ? '1 archivo' : `${archivos} archivos`}
                      </Etiqueta>
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <button type="button" onClick={() => ir('/documentos/nuevo')} className={botonSecundario}>
        + Añadir documento
      </button>
      <p className="text-center text-xs text-stone-500">🔒 Privados: solo los ve vuestro hogar, con enlaces que caducan en minutos.</p>
    </section>
  )
}
