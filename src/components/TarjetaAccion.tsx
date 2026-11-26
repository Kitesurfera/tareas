import type { ReactNode } from 'react'
import { candidatosDe, objetivoInicial, SIN_GUARDAR, type Borrador, type DatosAcciones } from '../lib/acciones'
import { DESTINOS, TIPOS_CUIDADO, infoDestino, type ContextoHogar, type Destino, type TipoCuidadoHecho, type TipoFechaBandeja, type TipoVencimientoBandeja } from '../lib/bandeja'
import { TIPOS_DOCUMENTO, type TipoDocumento } from '../lib/documentos'
import { fechaCorta } from '../lib/fechas'
import { MESES, TIPOS_FECHA } from '../lib/regalos'
import { ir } from '../lib/ruta'
import { CATEGORIAS, TIPOS_TRATAMIENTO, type Categoria, type TipoTratamiento } from '../lib/tipos'
import { campoBase } from './estilos'

type Props = {
  b: Borrador
  contexto: ContextoHogar
  datos: DatosAcciones | null
  onCambiar: (c: Partial<Borrador>) => void
  // Al abrir una pantalla desde la tarjeta (una plantilla): por ejemplo, cerrar el asistente.
  onSalir?: () => void
}

// Una acción propuesta por la IA (en la bandeja o en el asistente 🧠): se
// puede cambiar de sitio, corregir o no guardar.
export function TarjetaAccion({ b, contexto, datos, onCambiar, onSalir }: Props) {
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
    rutina: 'Rutina',
    tratamiento: 'Nombre del tratamiento',
    planta: 'Nombre de la planta',
    vencimiento: 'Nombre',
    documento: 'Documento',
    viaje: 'Destino (opcional)',
    sin_clasificar: 'Nota',
  }
  const personas = (vacio: string, valor: string, cambiar: (v: string) => void) => (
    <select className={pequeno} value={valor} onChange={(e) => cambiar(e.target.value)}>
      <option value="">{vacio}</option>
      {contexto.personas.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nombre}
          {p.yo ? ' (tú)' : ''}
        </option>
      ))}
    </select>
  )
  const lista = (vacio: string, cosas: { id: string; nombre: string }[], valor: string, cambiar: (v: string) => void) => (
    <select className={pequeno} value={valor} onChange={(e) => cambiar(e.target.value)}>
      <option value="">{vacio}</option>
      {cosas.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nombre}
        </option>
      ))}
    </select>
  )
  const cada = (texto = 'Cada cuántos días') =>
    etiqueta(texto, <input className={pequeno} value={b.frecuencia} onChange={(e) => onCambiar({ frecuencia: e.target.value.replace(/\D/g, '').slice(0, 4) })} inputMode="numeric" />, 'w-36')
  const dia = (texto: string, valor: string, campo: 'fecha' | 'fecha2', ancho = 'flex-1 basis-40') =>
    etiqueta(texto, <input type="date" className={pequeno} value={valor} onChange={(e) => onCambiar({ [campo]: e.target.value })} />, ancho)

  // ¿A qué se refiere? (tareas, artículos, planes o plantillas): los más parecidos primero.
  const elegir = (texto: string, vacio: string) => {
    const { parecidos, resto } = datos ? candidatosDe(b, datos) : { parecidos: [], resto: [] }
    return etiqueta(
      texto,
      <select className={pequeno} value={b.objetivo} onChange={(e) => onCambiar({ objetivo: e.target.value })} aria-label={texto}>
        <option value="">{vacio}</option>
        {parecidos.length > 0 && (
          <optgroup label="Lo más parecido">
            {parecidos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.texto}
                {c.detalle ?? ''}
              </option>
            ))}
          </optgroup>
        )}
        {resto.length > 0 && (
          <optgroup label="Todo lo demás">
            {resto.map((c) => (
              <option key={c.id} value={c.id}>
                {c.texto}
                {c.detalle ?? ''}
              </option>
            ))}
          </optgroup>
        )}
      </select>,
    )
  }

  if (guardado) {
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-marca-suave/50 px-3 py-2 text-sm font-semibold text-marca">
        <span aria-hidden="true">✓</span> {info.dibujo} {info.texto}: {b.texto || (b.destino === 'peso' ? `${b.kg} kg` : 'hecho')}
      </div>
    )
  }

  const guardable = !SIN_GUARDAR.includes(b.destino)
  return (
    <div className={`flex flex-col gap-3 rounded-2xl p-3 ring-1 ${b.error ? 'bg-red-50/60 ring-red-200' : b.guardar || !guardable ? 'bg-white ring-stone-200' : 'bg-stone-50 ring-stone-200 opacity-70'}`}>
      <div className="flex items-center gap-2">
        {guardable && (
          <input type="checkbox" className="h-5 w-5 shrink-0 accent-marca" checked={b.guardar} onChange={(e) => onCambiar({ guardar: e.target.checked })} aria-label={`Guardar «${b.texto || info.texto}»`} />
        )}
        <select
          className={`${campoBase} min-w-0 flex-1 py-2 text-sm font-semibold`}
          value={b.destino}
          onChange={(e) => {
            const destino = e.target.value as Destino
            onCambiar({ destino, guardar: !SIN_GUARDAR.includes(destino), que: b.que || b.texto, ...objetivoInicial({ destino, que: b.que, texto: b.texto }, datos) })
          }}
          aria-label="Dónde va"
        >
          <optgroup label="Crear">
            {DESTINOS.filter((d) => d.grupo === 'crear').map((d) => (
              <option key={d.valor} value={d.valor}>
                {d.dibujo} {d.texto}
              </option>
            ))}
          </optgroup>
          <optgroup label="Cambiar lo que ya hay">
            {DESTINOS.filter((d) => d.grupo === 'cambiar').map((d) => (
              <option key={d.valor} value={d.valor}>
                {d.dibujo} {d.texto}
              </option>
            ))}
          </optgroup>
          {DESTINOS.filter((d) => d.grupo === 'bandeja').map((d) => (
            <option key={d.valor} value={d.valor}>
              {d.dibujo} {d.texto}
            </option>
          ))}
        </select>
      </div>

      {textoPrincipal[b.destino] && etiqueta(textoPrincipal[b.destino]!, <input className={pequeno} value={b.texto} onChange={(e) => onCambiar({ texto: e.target.value })} maxLength={120} />, 'w-full')}

      {b.destino === 'tarea' && (
        <div className="flex flex-wrap gap-2">
          {dia('Fecha', b.fecha, 'fecha')}
          {etiqueta('Quién', personas('Nadie en concreto', b.responsable, (v) => onCambiar({ responsable: v })), 'flex-1 basis-40')}
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
      {b.destino === 'plan' && etiqueta('Categoría', lista('Sin categoría', contexto.categoriasPlan, b.categoriaPlan, (v) => onCambiar({ categoriaPlan: v })))}
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
          {etiqueta('Mascota', lista('Elige…', contexto.mascotas, b.mascota, (v) => onCambiar({ mascota: v })), 'flex-1 basis-40')}
          {etiqueta('Kilos (hoy)', <input className={pequeno} value={b.kg} onChange={(e) => onCambiar({ kg: e.target.value.replace(/[^\d,.]/g, '') })} inputMode="decimal" />, 'w-28')}
        </div>
      )}
      {(b.destino === 'cuidado_hecho' || b.destino === 'cuidado') && (
        <div className="flex flex-wrap gap-2">
          {etiqueta('Planta', lista('Elige…', contexto.plantas, b.planta, (v) => onCambiar({ planta: v })), 'flex-1 basis-40')}
          {etiqueta(
            b.destino === 'cuidado' ? 'Qué cuidado' : 'Qué se ha hecho',
            <select className={pequeno} value={b.tipoCuidado} onChange={(e) => onCambiar({ tipoCuidado: e.target.value as TipoCuidadoHecho })}>
              {TIPOS_CUIDADO.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>,
            'flex-1 basis-40',
          )}
          {b.destino === 'cuidado_hecho' && <p className="w-full text-xs text-stone-500">Se marcará como hecha la tarea pendiente de ese cuidado (hoy).</p>}
        </div>
      )}

      {/* --- Lo que se repite: cada cuántos días y la próxima vez */}
      {(b.destino === 'rutina' || b.destino === 'tratamiento' || b.destino === 'cuidado') && (
        <div className="flex flex-wrap gap-2">
          {b.destino === 'tratamiento' && etiqueta('Mascota', lista('Elige…', contexto.mascotas, b.mascota, (v) => onCambiar({ mascota: v })), 'flex-1 basis-40')}
          {b.destino === 'tratamiento' &&
            etiqueta(
              'Tipo de tratamiento',
              <select className={pequeno} value={b.tipoTratamiento} onChange={(e) => onCambiar({ tipoTratamiento: e.target.value as TipoTratamiento })}>
                {TIPOS_TRATAMIENTO.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.dibujo} {t.texto}
                  </option>
                ))}
              </select>,
              'flex-1 basis-40',
            )}
          {cada()}
          {dia(b.destino === 'rutina' ? 'Primera vez' : 'Próxima vez', b.fecha, 'fecha')}
          {b.destino !== 'tratamiento' && etiqueta('Quién', personas('Nadie en concreto', b.responsable, (v) => onCambiar({ responsable: v })), 'flex-1 basis-40')}
          {b.destino === 'rutina' && (
            <label className="flex w-full items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" className="h-5 w-5 accent-marca" checked={b.turnos} onChange={(e) => onCambiar({ turnos: e.target.checked })} />
              🔄 Por turnos (rota entre la gente de casa)
            </label>
          )}
        </div>
      )}
      {b.destino === 'planta' && (
        <div className="flex flex-wrap gap-2">
          {etiqueta('Dónde (opcional)', <input className={pequeno} value={b.ubicacion} onChange={(e) => onCambiar({ ubicacion: e.target.value })} maxLength={40} />, 'flex-1 basis-40')}
          {cada('Regar cada (días, opcional)')}
        </div>
      )}
      {b.destino === 'vencimiento' && (
        <div className="flex flex-wrap gap-2">
          {etiqueta(
            'Es un…',
            <select className={pequeno} value={b.tipoVencimiento} onChange={(e) => onCambiar({ tipoVencimiento: e.target.value as TipoVencimientoBandeja })}>
              <option value="seguro">📑 Seguro</option>
              <option value="suscripcion">💳 Suscripción</option>
            </select>,
            'flex-1 basis-40',
          )}
          {dia('Se renueva', b.fecha, 'fecha')}
          {etiqueta(
            'Cada',
            <select className={pequeno} value={b.meses} onChange={(e) => onCambiar({ meses: e.target.value })}>
              <option value="">No se repite</option>
              <option value="1">Cada mes</option>
              <option value="3">Cada 3 meses</option>
              <option value="6">Cada 6 meses</option>
              <option value="12">Cada año</option>
              {b.meses && !['1', '3', '6', '12'].includes(b.meses) && <option value={b.meses}>Cada {b.meses} meses</option>}
            </select>,
            'flex-1 basis-40',
          )}
          {etiqueta('Importe (€)', <input className={pequeno} value={b.importe} onChange={(e) => onCambiar({ importe: e.target.value.replace(/[^\d,.]/g, '') })} inputMode="decimal" />, 'w-28')}
          {etiqueta('Avisar (días antes)', <input className={pequeno} value={b.aviso} onChange={(e) => onCambiar({ aviso: e.target.value.replace(/\D/g, '').slice(0, 3) })} inputMode="numeric" placeholder="Sin aviso" />, 'w-36')}
        </div>
      )}
      {b.destino === 'documento' && (
        <div className="flex flex-wrap gap-2">
          {etiqueta(
            'Tipo de documento',
            <select className={pequeno} value={b.tipoDocumento} onChange={(e) => onCambiar({ tipoDocumento: e.target.value as TipoDocumento })}>
              {TIPOS_DOCUMENTO.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.dibujo} {t.texto}
                </option>
              ))}
            </select>,
            'flex-1 basis-40',
          )}
          {dia('Caduca (opcional)', b.fecha, 'fecha')}
          {etiqueta('De quién', personas('De todo el hogar', b.responsable, (v) => onCambiar({ responsable: v })), 'flex-1 basis-40')}
          <p className="w-full text-xs text-stone-500">Con fecha, os avisará un mes antes. Las fotos o el PDF se añaden luego en Vencimientos → Documentos.</p>
        </div>
      )}
      {b.destino === 'viaje' && (
        <div className="flex flex-wrap gap-2">
          <fieldset className="flex w-full flex-wrap gap-2">
            <legend className="mb-1 text-xs font-medium text-stone-600">Quién se va</legend>
            {contexto.personas.map((p) => (
              <label key={p.id} className="flex items-center gap-1.5 rounded-full bg-stone-50 px-3 py-1.5 text-sm ring-1 ring-stone-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-marca"
                  checked={b.personas.includes(p.id)}
                  onChange={(e) => onCambiar({ personas: e.target.checked ? [...b.personas, p.id] : b.personas.filter((x) => x !== p.id) })}
                />
                {p.nombre}
                {p.yo ? ' (tú)' : ''}
              </label>
            ))}
          </fieldset>
          {dia('Ida', b.fecha, 'fecha')}
          {dia('Vuelta', b.fecha2, 'fecha2')}
          <p className="w-full text-xs text-stone-500">Mientras esté fuera, sus tareas y avisos pasan a quien se queda en casa.</p>
        </div>
      )}

      {/* --- Lo que busca la app («¿a cuál te refieres?») */}
      {b.destino === 'programar' && (
        <div className="flex flex-wrap gap-2">
          {etiqueta(
            'Plan',
            <select className={pequeno} value={b.objetivo} onChange={(e) => onCambiar({ objetivo: e.target.value })} aria-label="Plan">
              <option value="">➕ Plan nuevo: «{b.texto.trim() || 'sin nombre'}»</option>
              {datos &&
                (() => {
                  const { parecidos, resto } = candidatosDe(b, datos)
                  return [...parecidos, ...resto].map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.texto}
                    </option>
                  ))
                })()}
            </select>,
            'flex-1 basis-40',
          )}
          {dia('Día', b.fecha, 'fecha')}
          {!b.objetivo && etiqueta('Nombre del plan nuevo', <input className={pequeno} value={b.texto} onChange={(e) => onCambiar({ texto: e.target.value })} maxLength={80} />)}
        </div>
      )}
      {b.destino === 'plantilla' && (
        <div className="flex flex-wrap items-end gap-2">
          {elegir('Plantilla', 'Elige una plantilla…')}
          {dia('Fecha', b.fecha, 'fecha')}
          {b.objetivo ? (
            <button
              type="button"
              onClick={() => {
                onSalir?.()
                ir(`/plantillas/usar/${b.objetivo}${b.fecha ? `/fecha/${b.fecha}` : ''}`)
              }}
              className="w-full rounded-full bg-tareas px-4 py-2.5 text-sm font-semibold text-tareas-tinta"
            >
              📋 Abrir y revisar la plantilla ›
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                onSalir?.()
                ir('/plantillas/ia')
              }}
              className="w-full rounded-full bg-tareas px-4 py-2.5 text-sm font-semibold text-tareas-tinta"
            >
              ✨ Hacer una plantilla con la IA ›
            </button>
          )}
        </div>
      )}
      {b.destino === 'hecho' && elegir('¿Cuál has hecho?', 'Ninguna de estas')}
      {b.destino === 'mover' && (
        <div className="flex flex-wrap gap-2">
          {elegir('¿Cuál cambias de día?', 'Ninguna de estas')}
          {dia('Día nuevo', b.fecha, 'fecha')}
          <p className="w-full text-xs text-stone-500">Las automáticas (de un tratamiento, una rutina…) se cambian desde su ficha.</p>
        </div>
      )}
      {b.destino === 'comprado' && elegir('¿Qué has comprado?', 'Nada de la lista')}
      {b.destino === 'ayuda' && (
        <div className="flex flex-col gap-2">
          {etiqueta(
            'A quién se lo pides',
            <select className={pequeno} value={b.responsable} onChange={(e) => onCambiar({ responsable: e.target.value })}>
              <option value="">Elige…</option>
              {otras.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>,
          )}
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-xs font-medium text-stone-600">Qué tareas</legend>
            {datos &&
              (() => {
                const { parecidos, resto } = candidatosDe(b, datos)
                return [...parecidos, ...resto].slice(0, 20).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-marca"
                      checked={b.objetivos.includes(c.id)}
                      onChange={(e) => onCambiar({ objetivos: e.target.checked ? [...b.objetivos, c.id] : b.objetivos.filter((x) => x !== c.id) })}
                    />
                    {c.texto}
                    <span className="text-xs text-stone-500">{c.detalle}</span>
                  </label>
                ))
              })()}
          </fieldset>
          <p className="text-xs text-stone-500">Le llegará un aviso para que acepte (como «🙋 Hoy no puedo»).</p>
        </div>
      )}
      {b.destino === 'pausa' && (
        <div className="flex flex-col gap-1">
          {dia('Sin avisos hasta (incluido)', b.fecha, 'fecha', 'w-full')}
          <p className="text-xs text-stone-500">{b.fecha ? `Volverán el día siguiente.` : 'Vacío = quitar la pausa y volver a tener avisos.'}</p>
        </div>
      )}
      {b.destino === 'sin_clasificar' && <p className="text-xs text-stone-500">Se queda en tu bandeja. Elige otro sitio si sabes dónde va.</p>}
      {b.error && <p role="alert" className="text-sm font-semibold text-red-700">✕ {b.error}</p>}
    </div>
  )
}
