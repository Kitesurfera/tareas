import { useState } from 'react'
import {
  iconoDeTarea,
  moverVista,
  nombreDelMes,
  primeroDelMes,
  rangoDeLaVista,
  useDatosCalendario,
  type Filtro,
  type Vista,
} from '../lib/calendario'
import { bordeDePersona, colorDePersona } from '../lib/colores'
import { hoyComoTexto, leerFecha } from '../lib/fechas'
import { ir } from '../lib/ruta'
import { ocurrencias, type Ocurrencia } from '../lib/semana'
import type { Tarea } from '../lib/tipos'
import { useAccionesTarea } from '../lib/useAccionesTarea'
import { useMiembros } from '../lib/useMiembros'
import { useNombres } from '../lib/useNombres'
import { diaMes } from '../lib/viajes'
import { avisoError, estiloChip } from './estilos'
import { FilaPrevista } from './FilaPrevista'
import { AvisoRecienHecha, ListaTareas } from './ListaTareas'
import { Etiqueta, TituloSeccion } from './Piezas'

const LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

// La vista y el filtro elegidos se recuerdan en este móvil (si se puede).
function leerPreferencia<T extends string>(clave: string, valores: readonly T[], porDefecto: T): T {
  try {
    const valor = localStorage.getItem(clave)
    return valores.includes(valor as T) ? (valor as T) : porDefecto
  } catch {
    return porDefecto
  }
}
function guardarPreferencia(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor)
  } catch {
    // Sin almacenamiento (modo privado…): no pasa nada, solo no se recuerda.
  }
}

const mayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1)

// «Martes 24 de noviembre»
const diaLargo = (fecha: string) =>
  mayuscula(leerFecha(fecha).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', ''))

// El icono del tipo de tarea en un círculo del color de quien se encarga.
// Lo previsto (lo que se repite) va con borde de puntos.
// En el mes van más pequeños, para que quepan dos por fila en el móvil.
function Ficha({ o, icono, conTitulo }: { o: Ocurrencia; icono: string; conTitulo?: boolean }) {
  const circulo = (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full leading-none ${
        conTitulo ? 'h-[1.2rem] w-[1.2rem] text-[10px]' : 'h-4 w-4 text-[9px]'
      } ${
        o.prevista ? `border-[1.5px] border-dashed bg-white ${bordeDePersona(o.responsableId)}` : colorDePersona(o.responsableId)
      }`}
    >
      {icono}
    </span>
  )
  if (!conTitulo) return circulo
  return (
    <span className="flex min-w-0 items-center gap-1">
      {circulo}
      <span className={`hidden min-w-0 truncate text-[11px] md:inline ${o.prevista ? 'text-stone-500' : 'text-stone-700'}`}>
        {o.tarea.titulo}
      </span>
    </span>
  )
}

// En el inicio: el calendario de tareas, por mes o por semana.
export function TarjetaCalendario({ miUserId }: { miUserId: string }) {
  const hoy = hoyComoTexto()
  const [vista, setVista] = useState<Vista>(() => leerPreferencia('tareas.calendario.vista', ['mes', 'semana'], 'mes'))
  const [filtro, setFiltro] = useState<Filtro>(() =>
    leerPreferencia('tareas.calendario.filtro', ['todas', 'rutinas'], 'todas'),
  )
  const [fecha, setFecha] = useState(hoy) // un día de lo que se ve
  const [elegido, setElegido] = useState(hoy)
  const { datos, error: errorCarga, recargar } = useDatosCalendario()
  const { miembros } = useMiembros()
  const nombres = useNombres(miUserId)
  const acciones = useAccionesTarea(recargar)

  const { desde, hasta, dias } = rangoDeLaVista(vista, fecha)
  const primero = rangoDeLaVista(vista, hoy).desde
  const vale = (t: Tarea) => filtro === 'todas' || Boolean(t.rutina_id)
  const lista =
    datos && miembros
      ? ocurrencias(datos.tareas, datos.rutinas, datos.frecuencias, miembros, desde, hasta, hoy).filter((o) => vale(o.tarea))
      : []
  const delDia = (dia: string) => lista.filter((o) => o.fecha === dia)
  const icono = (t: Tarea) => (datos ? iconoDeTarea(t, datos.info) : { icono: '📌', tipo: '' })
  // Lo atrasado de antes de lo que se ve (solo si se ve hoy).
  const atrasadas =
    datos && desde <= hoy && hoy <= hasta ? datos.tareas.filter((t) => t.fecha_limite && t.fecha_limite < desde && vale(t)).length : 0

  function cambiarVista(nueva: Vista) {
    setVista(nueva)
    guardarPreferencia('tareas.calendario.vista', nueva)
    setFecha(elegido)
  }
  function cambiarFiltro(nuevo: Filtro) {
    setFiltro(nuevo)
    guardarPreferencia('tareas.calendario.filtro', nuevo)
  }
  function mover(paso: number) {
    const nueva = moverVista(vista, fecha, paso)
    const rango = rangoDeLaVista(vista, nueva)
    setFecha(nueva)
    setElegido(rango.desde <= hoy && hoy <= rango.hasta ? hoy : vista === 'mes' ? primeroDelMes(nueva) : rango.desde)
  }
  function irAHoy() {
    setFecha(hoy)
    setElegido(hoy)
  }

  const elegidas = delDia(elegido)
  const reales = elegidas.filter((o) => !o.prevista).map((o) => o.tarea)
  const previstas = elegidas.filter((o) => o.prevista)
  const enLaVista = desde <= hoy && hoy <= hasta
  // La leyenda: los colores de la gente y los iconos que salen.
  const tipos = [...new Map(lista.map((o) => [icono(o.tarea).icono, icono(o.tarea).tipo])).entries()]
  const haySinAsignar = lista.some((o) => !o.responsableId)
  const hayPrevistas = lista.some((o) => o.prevista)
  const error = errorCarga ?? acciones.error

  return (
    <section className="tarjeta flex flex-col gap-3" aria-label="Calendario">
      <TituloSeccion dibujo="🗓️" titulo="Calendario" subtitulo="Quién hace qué, cada día" color="inicio" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid grid-cols-2 gap-1 rounded-full bg-stone-200 p-1" role="group" aria-label="Vista">
          {(
            [
              ['mes', 'Mes'],
              ['semana', 'Semana'],
            ] as const
          ).map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              aria-pressed={vista === valor}
              onClick={() => cambiarVista(valor)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                vista === valor ? 'bg-white text-marca shadow-sm' : 'text-stone-600'
              }`}
            >
              {texto}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Qué tareas">
          <button type="button" aria-pressed={filtro === 'todas'} onClick={() => cambiarFiltro('todas')} className={estiloChip(filtro === 'todas')}>
            Todas
          </button>
          <button type="button" aria-pressed={filtro === 'rutinas'} onClick={() => cambiarFiltro('rutinas')} className={estiloChip(filtro === 'rutinas')}>
            🧹 Rutinas de casa
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => mover(-1)}
          disabled={desde <= primero}
          aria-label={vista === 'mes' ? 'Mes anterior' : 'Semana anterior'}
          className="rounded-full px-3 py-1 text-xl text-marca disabled:text-stone-300"
        >
          ‹
        </button>
        <span className="text-center font-semibold">
          {vista === 'mes' ? mayuscula(nombreDelMes(fecha)) : `Del ${diaMes(desde)} al ${diaMes(hasta)}`}
          {!enLaVista && (
            <button type="button" onClick={irAHoy} className="ml-2 rounded-full bg-marca-suave px-2 py-0.5 text-xs font-semibold text-marca">
              Hoy
            </button>
          )}
        </span>
        <button
          type="button"
          onClick={() => mover(1)}
          aria-label={vista === 'mes' ? 'Mes siguiente' : 'Semana siguiente'}
          className="rounded-full px-3 py-1 text-xl text-marca"
        >
          ›
        </button>
      </div>

      {error && <p role="alert" className={avisoError}>{error}</p>}
      {!datos && !errorCarga && <p className="text-sm text-stone-400">Cargando…</p>}

      {datos && (
        <>
          <div className={`grid grid-cols-7 ${vista === 'mes' ? 'gap-0.5' : 'gap-1'}`}>
            {LETRAS.map((letra) => (
              <span key={letra} aria-hidden="true" className="text-center text-xs font-semibold text-stone-400">
                {letra}
              </span>
            ))}
            {dias.map((dia) => {
              const cosas = delDia(dia)
              const otroMes = vista === 'mes' && dia.slice(0, 7) !== fecha.slice(0, 7)
              const maximo = vista === 'mes' ? 4 : 12
              const visibles = cosas.length > maximo ? cosas.slice(0, maximo - 1) : cosas
              return (
                <button
                  key={dia}
                  type="button"
                  onClick={() => setElegido(dia)}
                  aria-pressed={dia === elegido}
                  aria-label={`${diaLargo(dia)}: ${cosas.length === 0 ? 'nada' : cosas.length === 1 ? '1 cosa' : `${cosas.length} cosas`}`}
                  className={`flex min-w-0 flex-col items-center gap-1 rounded-xl transition ${
                    vista === 'mes' ? 'min-h-14 p-0.5' : 'min-h-28 p-1 md:items-stretch'
                  } ${dia === elegido ? 'bg-inicio ring-2 ring-inicio-tinta/30' : 'hover:bg-stone-50'} ${otroMes ? 'opacity-40' : ''}`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center self-center rounded-full text-xs font-semibold ${
                      dia === hoy ? 'bg-marca text-white' : dia < hoy ? 'text-stone-400' : 'text-stone-700'
                    }`}
                  >
                    {Number(dia.slice(8))}
                  </span>
                  <span className={`flex ${vista === 'mes' ? 'w-full flex-wrap justify-center gap-px' : 'flex-col items-center gap-0.5 md:items-stretch'}`}>
                    {visibles.map((o) => (
                      <Ficha key={o.clave} o={o} icono={icono(o.tarea).icono} conTitulo={vista === 'semana'} />
                    ))}
                    {cosas.length > visibles.length && (
                      <span className="text-[10px] leading-4 font-semibold text-stone-500">+{cosas.length - visibles.length}</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>

          {atrasadas > 0 && (
            <button type="button" onClick={() => ir('/tareas')} className="self-start text-sm font-semibold text-red-700">
              ⏰ {atrasadas === 1 ? '1 atrasada' : `${atrasadas} atrasadas`} de antes ›
            </button>
          )}

          {/* Leyenda: el color de cada persona y el icono de cada tipo. */}
          <div className="flex flex-col gap-2 rounded-2xl bg-stone-50 p-3">
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-stone-600">
              {miembros?.map((m) => (
                <span key={m.id} className="inline-flex items-center gap-1">
                  <span aria-hidden="true" className={`h-3 w-3 rounded-full ${colorDePersona(m.id)}`} />
                  {m.nombre_visible}
                  {m.id === nombres.miMiembroId && ' (tú)'}
                </span>
              ))}
              {haySinAsignar && (
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden="true" className="h-3 w-3 rounded-full bg-stone-400" />
                  Sin asignar
                </span>
              )}
              {hayPrevistas && (
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden="true" className="h-3 w-3 rounded-full border-[1.5px] border-dashed border-stone-500 bg-white" />
                  Se repite (previsto)
                </span>
              )}
            </p>
            {tipos.length > 0 && (
              <p className="flex flex-wrap gap-1.5">
                {tipos.map(([dibujo, tipo]) => (
                  <Etiqueta key={dibujo} className="bg-white text-stone-600 ring-1 ring-stone-900/5">
                    <span aria-hidden="true">{dibujo}</span> {tipo}
                  </Etiqueta>
                ))}
              </p>
            )}
          </div>

          <AvisoRecienHecha acciones={acciones} />

          {/* El día elegido, con sus tareas (se pueden marcar). */}
          <div className="border-t border-stone-100 pt-3" aria-label={`Día elegido: ${diaLargo(elegido)}`} role="region">
            <h3 className="flex items-center gap-2 font-bold">
              {diaLargo(elegido)}
              {elegido === hoy && <Etiqueta className="bg-marca-suave text-marca">Hoy</Etiqueta>}
            </h3>
            {reales.length > 0 && (
              <ListaTareas tareas={reales} acciones={acciones} nombres={nombres} dibujoDe={(t) => icono(t).icono} />
            )}
            {previstas.length > 0 && (
              <ul className={`divide-y divide-stone-100 ${reales.length > 0 ? 'border-t border-stone-100' : ''}`}>
                {previstas.map((p) => (
                  <FilaPrevista key={p.clave} prevista={p} nombres={nombres} dibujo={icono(p.tarea).icono} />
                ))}
              </ul>
            )}
            {elegidas.length === 0 && (
              <p className="mt-1 text-sm text-stone-500">
                {filtro === 'rutinas' && datos.rutinas.length === 0 ? (
                  <>
                    Aún no tenéis rutinas de casa.{' '}
                    <button type="button" onClick={() => ir('/casa')} className="font-semibold text-marca">
                      Crearlas en Casa ›
                    </button>
                  </>
                ) : filtro === 'rutinas' ? (
                  'Ninguna rutina este día 🌿'
                ) : (
                  'Nada este día 🌿'
                )}
              </p>
            )}
          </div>
        </>
      )}

      <button type="button" onClick={() => ir('/semana')} className="self-start text-sm font-semibold text-marca">
        📆 La semana con todo el detalle (planes, cobros y viajes) ›
      </button>
    </section>
  )
}
