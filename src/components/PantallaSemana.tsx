import { useState } from 'react'
import { SUAVE } from '../lib/colores'
import { euros, hoyComoTexto, sumarDias } from '../lib/fechas'
import { infoCategoria as infoCategoriaPlan } from '../lib/planes'
import { ir, volver } from '../lib/ruta'
import {
  armarSemana,
  lunesDe,
  nombreDelDia,
  nombreDeLaSemana,
  semanaInicial,
  useDatosSemana,
  type DiaDeLaSemana,
} from '../lib/semana'
import { infoTipoDocumento } from '../lib/documentos'
import type { Tarea } from '../lib/tipos'
import { useAccionesTarea } from '../lib/useAccionesTarea'
import { useMiembros } from '../lib/useMiembros'
import { useNombres, type Nombres } from '../lib/useNombres'
import { agrupar, diaMes, periodosSinNadie, textoPeriodo, textoPersonas, useViajes } from '../lib/viajes'
import { avisoError } from './estilos'
import { AvisoRecienHecha, ListaTareas } from './ListaTareas'
import { FilaPrevista } from './FilaPrevista'
import { Etiqueta, TituloSeccion } from './Piezas'
import type { AccionesTarea } from '../lib/useAccionesTarea'
import type { CategoriaPlan } from '../lib/planes'

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

function TarjetaDia({
  dia,
  hoy,
  nombres,
  acciones,
  categoriasPlan,
}: {
  dia: DiaDeLaSemana
  hoy: string
  nombres: Nombres
  acciones: AccionesTarea
  categoriasPlan: CategoriaPlan[]
}) {
  const vacio =
    dia.tareas.length + dia.previstas.length + dia.planes.length + dia.renovaciones.length + dia.documentos.length === 0
  const esHoy = dia.fecha === hoy
  const pasado = dia.fecha < hoy

  return (
    <section
      aria-label={nombreDelDia(dia.fecha)}
      className={`tarjeta ${vacio ? 'py-3' : ''} ${esHoy ? 'ring-2 ring-marca/30' : ''} ${pasado && vacio ? 'opacity-60' : ''}`}
    >
      <h2 className="flex flex-wrap items-center gap-2 font-bold">
        <span className="font-redonda text-lg">{nombreDelDia(dia.fecha)}</span>
        {esHoy && <Etiqueta className="bg-marca-suave text-marca">Hoy</Etiqueta>}
        {dia.fecha === sumarDias(hoy, 1) && <Etiqueta className="bg-inicio text-inicio-tinta">Mañana</Etiqueta>}
        {vacio && <span className="text-sm font-normal text-stone-400">· nada apuntado</span>}
      </h2>

      {(dia.planes.length > 0 || dia.renovaciones.length > 0 || dia.documentos.length > 0) && (
        <div className="mt-3 flex flex-col gap-2">
          {dia.planes.map(({ entrada, plan }) => {
            const categoria = infoCategoriaPlan(categoriasPlan, plan.categoria_id)
            return (
              <button
                key={entrada.id}
                type="button"
                onClick={() => ir('/planes')}
                className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm font-semibold ${categoria.suave}`}
              >
                <span aria-hidden="true">{categoria.dibujo}</span>
                <span className="min-w-0 flex-1">🎉 {plan.nombre}</span>
              </button>
            )
          })}
          {dia.renovaciones.map(({ clave, vencimiento }) => (
            <button
              key={clave}
              type="button"
              onClick={() => ir(`/vencimientos/${vencimiento.id}/editar`)}
              className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm ${SUAVE.vencimientos}`}
            >
              <span aria-hidden="true">{vencimiento.tipo === 'seguro' ? '🛡️' : '💳'}</span>
              <span className="min-w-0 flex-1">
                Se renueva <strong>{vencimiento.nombre}</strong>
              </span>
              {vencimiento.importe !== null && vencimiento.importe > 0 && (
                <span className="shrink-0 font-semibold">{euros(vencimiento.importe)}</span>
              )}
            </button>
          ))}
          {dia.documentos.map((documento) => (
            <button
              key={documento.id}
              type="button"
              onClick={() => ir(`/documentos/${documento.id}`)}
              className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm ${SUAVE.tareas}`}
            >
              <span aria-hidden="true">{infoTipoDocumento(documento.tipo).dibujo}</span>
              <span className="min-w-0 flex-1">
                Caduca <strong>{documento.titulo}</strong>
              </span>
            </button>
          ))}
        </div>
      )}

      {dia.tareas.length > 0 && (
        <div className="mt-1">
          <ListaTareas tareas={dia.tareas} acciones={acciones} nombres={nombres} />
        </div>
      )}

      {dia.previstas.length > 0 && (
        <ul className={`divide-y divide-stone-100 ${dia.tareas.length > 0 ? 'border-t border-stone-100' : 'mt-1'}`}>
          {dia.previstas.map((prevista) => (
            <FilaPrevista key={prevista.clave} prevista={prevista} nombres={nombres} />
          ))}
        </ul>
      )}
    </section>
  )
}

// «📆 La semana»: lo que viene de lunes a domingo, con las tareas de todo
// el hogar, los turnos, los planes, las renovaciones y quién está de viaje.
export function PantallaSemana({ miUserId }: { miUserId: string }) {
  const hoy = hoyComoTexto()
  const [lunes, setLunes] = useState(() => semanaInicial(hoy))
  const { datos, error: errorCarga, recargar } = useDatosSemana()
  const { miembros } = useMiembros()
  const { viajes } = useViajes()
  const nombres = useNombres(miUserId)
  const acciones = useAccionesTarea(recargar)
  const domingo = sumarDias(lunes, 6)
  const primera = lunesDe(hoy)

  const semana = datos && miembros ? armarSemana(datos, miembros, lunes, hoy) : null
  const todas: Tarea[] = semana ? [...semana.antes, ...semana.dias.flatMap((d) => d.tareas)] : []
  const tuyas = todas.filter((t) => nombres.esMia(t.responsable_id, t.fecha_limite)).length
  const atrasadas = todas.filter((t) => t.fecha_limite && t.fecha_limite < hoy).length
  const planes = semana?.dias.reduce((n, d) => n + d.planes.length, 0) ?? 0
  const renovaciones = semana?.dias.flatMap((d) => d.renovaciones) ?? []
  const importe = renovaciones.reduce((total, r) => total + (r.vencimiento.importe ?? 0), 0)
  const documentos = semana?.dias.reduce((n, d) => n + d.documentos.length, 0) ?? 0

  // Viajes que tocan algún día de esta semana, y días sin nadie en casa.
  const viajesDeLaSemana = viajes ? agrupar(viajes.filter((v) => v.desde <= domingo && v.hasta >= lunes)) : []
  const sinNadie =
    miembros && viajes
      ? periodosSinNadie(miembros, viajes, lunes > hoy ? lunes : hoy)
          .filter((p) => p.desde <= domingo)
          .map((p) => ({ desde: p.desde, hasta: p.hasta > domingo ? domingo : p.hasta }))
      : []

  const error = errorCarga ?? acciones.error

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-5xl lg:px-10 lg:py-10">
      <button type="button" onClick={() => volver('/')} className="self-start text-sm font-medium text-marca">
        ← Inicio
      </button>

      <header>
        <h1 className="text-2xl font-extrabold text-marca lg:text-3xl">📆 La semana</h1>
        <p className="text-stone-600">Lo que viene, día a día y entre todas.</p>
      </header>

      <div className="flex items-center justify-between rounded-full bg-white px-2 py-1 shadow-sm">
        <button
          type="button"
          onClick={() => setLunes((l) => sumarDias(l, -7))}
          disabled={lunes <= primera}
          aria-label="Semana anterior"
          className="rounded-full px-4 py-2 text-xl text-marca disabled:text-stone-300"
        >
          ‹
        </button>
        <span className="text-center leading-tight">
          <span className="block font-semibold">{nombreDeLaSemana(lunes, hoy)}</span>
          <span className="block text-xs text-stone-500">
            Del {diaMes(lunes)} al {diaMes(domingo)}
          </span>
        </span>
        <button
          type="button"
          onClick={() => setLunes((l) => sumarDias(l, 7))}
          aria-label="Semana siguiente"
          className="rounded-full px-4 py-2 text-xl text-marca"
        >
          ›
        </button>
      </div>

      {error && <p role="alert" className={avisoError}>{error}</p>}
      <AvisoRecienHecha acciones={acciones} />
      {!semana && !errorCarga && <p className="text-center text-sm text-stone-400">Cargando…</p>}

      {semana && (
        <>
          <section className="tarjeta" aria-label="Resumen">
            <TituloSeccion dibujo="🗒️" titulo="En resumen" color="inicio" />
            <p className="mt-3 flex flex-wrap gap-1.5">
              <Etiqueta className="bg-inicio text-inicio-tinta">{plural(todas.length, 'tarea', 'tareas')}</Etiqueta>
              {todas.length > 0 && (
                <Etiqueta className="bg-tareas text-tareas-tinta">
                  {tuyas === 1 ? '1 es tuya' : `${tuyas} son tuyas`}
                </Etiqueta>
              )}
              {atrasadas > 0 && (
                <Etiqueta className="bg-red-50 text-red-700">{plural(atrasadas, 'atrasada', 'atrasadas')}</Etiqueta>
              )}
              {planes > 0 && <Etiqueta className={SUAVE.planes}>🎉 {plural(planes, 'plan', 'planes')}</Etiqueta>}
              {renovaciones.length > 0 && (
                <Etiqueta className={SUAVE.vencimientos}>
                  💳 {plural(renovaciones.length, 'renovación', 'renovaciones')}
                  {importe > 0 && ` · ${euros(importe)}`}
                </Etiqueta>
              )}
              {documentos > 0 && (
                <Etiqueta className={SUAVE.tareas}>
                  📄 {documentos === 1 ? '1 documento caduca' : `${documentos} documentos caducan`}
                </Etiqueta>
              )}
            </p>

            {(viajesDeLaSemana.length > 0 || sinNadie.length > 0) && miembros && (
              <ul className="mt-3 flex flex-col gap-1.5 text-sm text-vencimientos-tinta">
                {viajesDeLaSemana.map((grupo) => (
                  <li key={grupo.grupo}>
                    ✈️ <strong>{textoPersonas(grupo.personas, miembros, nombres.miMiembroId)}</strong>{' '}
                    {textoPeriodo({ desde: grupo.desde, hasta: grupo.hasta })}
                    {grupo.destino && ` · ${grupo.destino}`}
                  </li>
                ))}
                {sinNadie.map((p) => (
                  <li key={p.desde} className="font-semibold">
                    🏠 Nadie en casa {textoPeriodo(p)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {semana.antes.length > 0 && (
            <section className="tarjeta ring-2 ring-red-100" aria-label="Pendiente de antes">
              <TituloSeccion
                dibujo="⏰"
                titulo="Pendiente de antes"
                subtitulo={lunes > primera ? 'De antes del lunes y sin hacer' : 'De semanas anteriores y sin hacer'}
                color="coral"
              />
              <div className="mt-1">
                <ListaTareas tareas={semana.antes} acciones={acciones} nombres={nombres} />
              </div>
            </section>
          )}

          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
            {semana.dias.map((dia) => (
              <TarjetaDia
                key={dia.fecha}
                dia={dia}
                hoy={hoy}
                nombres={nombres}
                acciones={acciones}
                categoriasPlan={datos?.categoriasPlan ?? []}
              />
            ))}
          </div>

          <p className="text-center text-xs text-stone-500">
            🔁 = la siguiente vez de algo que se repite, si se hace el día que toca.
            <br />
            🔔 Cada domingo a las 20:00 te llega este resumen al móvil (con los avisos activados).
          </p>
        </>
      )}
    </main>
  )
}
