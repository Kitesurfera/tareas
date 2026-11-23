import { useState } from 'react'
import {
  FILTROS,
  iconoDePlan,
  iconoDeTarea,
  moverVista,
  nombreDelMes,
  planesPasanFiltro,
  primeroDelMes,
  rangoDeLaVista,
  tareaPasaFiltro,
  useDatosCalendario,
  type Filtro,
  type Vista,
} from '../lib/calendario'
import { bordeDePersona, colorDePersona } from '../lib/colores'
import { hoyComoTexto, leerFecha } from '../lib/fechas'
import { infoCategoria as infoCategoriaPlan, type EntradaAgenda, type Plan } from '../lib/planes'
import { ir } from '../lib/ruta'
import { ocurrencias, type Ocurrencia } from '../lib/semana'
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

// Lo que sale en el calendario: una tarea (o la siguiente vez de algo que se
// repite) o un plan del calendario de planes.
type Cosa = { clave: string; fecha: string; icono: string; tipo: string; titulo: string } & (
  | { es: 'tarea'; o: Ocurrencia }
  | { es: 'plan'; entrada: EntradaAgenda; plan: Plan }
)

// El icono del tipo en un círculo: del color de quien se encarga (con borde
// de puntos si es una repetición prevista) o rosa si es un plan del hogar.
// Con «titulo», también el nombre a partir de ese ancho de pantalla.
function Ficha({ cosa, titulo }: { cosa: Cosa; titulo?: 'md' | 'lg' }) {
  const prevista = cosa.es === 'tarea' && cosa.o.prevista
  const hecho = cosa.es === 'plan' && cosa.entrada.hecho
  const color =
    cosa.es === 'plan'
      ? 'bg-planes ring-1 ring-planes-tinta/30'
      : prevista
        ? `border-[1.5px] border-dashed bg-white ${bordeDePersona(cosa.o.responsableId)}`
        : colorDePersona(cosa.o.responsableId)
  const tamano = titulo === 'md' ? 'h-[1.2rem] w-[1.2rem] text-[10px]' : 'h-4 w-4 text-[9px] lg:h-[1.2rem] lg:w-[1.2rem] lg:text-[10px]'
  const circulo = (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full leading-none ${tamano} ${color} ${hecho ? 'opacity-50' : ''}`}
    >
      {cosa.icono}
    </span>
  )
  if (!titulo) return circulo
  return (
    <span className="flex min-w-0 items-center gap-1">
      {circulo}
      <span
        className={`hidden min-w-0 truncate text-[11px] ${titulo === 'md' ? 'md:inline' : 'lg:inline'} ${
          prevista || hecho ? 'text-stone-500' : 'text-stone-700'
        } ${hecho ? 'line-through' : ''}`}
      >
        {cosa.titulo}
      </span>
    </span>
  )
}

// Arriba del inicio: el calendario de tareas y planes, por mes o por semana.
export function TarjetaCalendario({ miUserId }: { miUserId: string }) {
  const hoy = hoyComoTexto()
  const [vista, setVista] = useState<Vista>(() => leerPreferencia('tareas.calendario.vista', ['mes', 'semana'], 'mes'))
  const [filtro, setFiltro] = useState<Filtro>(() =>
    leerPreferencia('tareas.calendario.filtro', FILTROS.map((f) => f.valor), 'todas'),
  )
  const [fecha, setFecha] = useState(hoy) // un día de lo que se ve
  const [elegido, setElegido] = useState(hoy)
  const { datos, error: errorCarga, recargar } = useDatosCalendario()
  const { miembros } = useMiembros()
  const nombres = useNombres(miUserId)
  const acciones = useAccionesTarea(recargar)

  const { desde, hasta, dias } = rangoDeLaVista(vista, fecha)
  const primero = rangoDeLaVista(vista, hoy).desde
  const cosas: Cosa[] = []
  if (datos && miembros) {
    for (const o of ocurrencias(datos.tareas, datos.rutinas, datos.frecuencias, miembros, desde, hasta, hoy)) {
      if (!tareaPasaFiltro(o.tarea, filtro)) continue
      cosas.push({ es: 'tarea', o, clave: o.clave, fecha: o.fecha, titulo: o.tarea.titulo, ...iconoDeTarea(o.tarea, datos.info) })
    }
    if (planesPasanFiltro(filtro)) {
      for (const entrada of datos.agenda) {
        const plan = datos.planes.find((p) => p.id === entrada.plan_id)
        if (!plan || entrada.fecha < desde || entrada.fecha > hasta) continue
        cosas.push({ es: 'plan', entrada, plan, clave: entrada.id, fecha: entrada.fecha, titulo: plan.nombre, ...iconoDePlan(plan, datos.categoriasPlan) })
      }
    }
  }
  const delDia = (dia: string) => cosas.filter((c) => c.fecha === dia)
  // Lo atrasado de antes de lo que se ve (solo si se ve hoy).
  const atrasadas =
    datos && desde <= hoy && hoy <= hasta
      ? datos.tareas.filter((t) => t.fecha_limite && t.fecha_limite < desde && tareaPasaFiltro(t, filtro)).length
      : 0

  function cambiarVista(nueva: Vista) {
    setVista(nueva)
    guardarPreferencia('tareas.calendario.vista', nueva)
    // Se queda en el día elegido, salvo que sea de antes de lo que se puede ver.
    const dia = elegido >= rangoDeLaVista(nueva, hoy).desde ? elegido : hoy
    setFecha(dia)
    setElegido(dia)
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
  const reales = elegidas.flatMap((c) => (c.es === 'tarea' && !c.o.prevista ? [c] : []))
  const previstas = elegidas.flatMap((c) => (c.es === 'tarea' && c.o.prevista ? [c.o] : []))
  const planes = elegidas.flatMap((c) => (c.es === 'plan' ? [c] : []))
  const enLaVista = desde <= hoy && hoy <= hasta
  const iconoDe = new Map(reales.map((c) => [c.o.tarea.id, c.icono]))
  // La leyenda: los colores de la gente y los iconos que salen.
  const tipos = [...new Map(cosas.map((c) => [`${c.icono}|${c.tipo}`, c])).values()]
  const haySinAsignar = cosas.some((c) => c.es === 'tarea' && !c.o.responsableId)
  const hayPrevistas = cosas.some((c) => c.es === 'tarea' && c.o.prevista)
  const hayPlanes = cosas.some((c) => c.es === 'plan')
  const error = errorCarga ?? acciones.error

  return (
    <section className="tarjeta flex flex-col gap-3" aria-label="Calendario">
      <TituloSeccion
        dibujo="🗓️"
        titulo="Calendario"
        subtitulo={<span className="hidden md:inline">Quién hace qué, cada día</span>}
        color="inicio"
        derecha={
          <div className="grid shrink-0 grid-cols-2 gap-0.5 rounded-full bg-stone-200 p-1 md:gap-1" role="group" aria-label="Vista">
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
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition md:px-3 md:py-1.5 md:text-sm ${
                  vista === valor ? 'bg-white text-marca shadow-sm' : 'text-stone-600'
                }`}
              >
                {texto}
              </button>
            ))}
          </div>
        }
      />

      {/* Filtros: en el móvil, una fila que se desliza de lado. */}
      <div
        className="-mx-1 flex gap-2 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] md:flex-wrap md:overflow-visible"
        role="group"
        aria-label="Qué se ve"
      >
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            type="button"
            aria-pressed={filtro === f.valor}
            onClick={() => cambiarFiltro(f.valor)}
            className={`shrink-0 ${estiloChip(filtro === f.valor)}`}
          >
            {f.texto}
          </button>
        ))}
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
          <div className={`grid grid-cols-7 ${vista === 'mes' ? 'gap-0.5 lg:gap-1' : 'gap-1'}`}>
            {LETRAS.map((letra) => (
              <span key={letra} aria-hidden="true" className="text-center text-xs font-semibold text-stone-400">
                {letra}
              </span>
            ))}
            {dias.map((dia) => {
              const delDiaVisto = delDia(dia)
              const otroMes = vista === 'mes' && dia.slice(0, 7) !== fecha.slice(0, 7)
              const maximo = vista === 'mes' ? 4 : 12
              const visibles = delDiaVisto.length > maximo ? delDiaVisto.slice(0, maximo - 1) : delDiaVisto
              return (
                <button
                  key={dia}
                  type="button"
                  onClick={() => setElegido(dia)}
                  aria-pressed={dia === elegido}
                  aria-label={`${diaLargo(dia)}: ${delDiaVisto.length === 0 ? 'nada' : delDiaVisto.length === 1 ? '1 cosa' : `${delDiaVisto.length} cosas`}`}
                  className={`flex min-w-0 flex-col items-center gap-1 rounded-xl transition ${
                    vista === 'mes' ? 'min-h-14 p-0.5 lg:min-h-16 lg:items-stretch lg:p-1' : 'min-h-28 p-1 md:items-stretch'
                  } ${dia === elegido ? 'bg-inicio ring-2 ring-inicio-tinta/30' : 'hover:bg-stone-50'} ${otroMes ? 'opacity-40' : ''}`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center self-center rounded-full text-xs font-semibold ${
                      dia === hoy ? 'bg-marca text-white' : dia < hoy ? 'text-stone-400' : 'text-stone-700'
                    }`}
                  >
                    {Number(dia.slice(8))}
                  </span>
                  <span
                    className={`flex ${
                      vista === 'mes'
                        ? 'w-full flex-wrap justify-center gap-px lg:flex-col lg:flex-nowrap lg:items-stretch lg:gap-0.5'
                        : 'flex-col items-center gap-0.5 md:items-stretch'
                    }`}
                  >
                    {visibles.map((c) => (
                      <Ficha key={c.clave} cosa={c} titulo={vista === 'semana' ? 'md' : 'lg'} />
                    ))}
                    {delDiaVisto.length > visibles.length && (
                      <span className="text-center text-[10px] leading-4 font-semibold text-stone-500">
                        +{delDiaVisto.length - visibles.length}
                      </span>
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
              {hayPlanes && (
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden="true" className="h-3 w-3 rounded-full bg-planes ring-1 ring-planes-tinta/30" />
                  Planes (de todo el hogar)
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
                {tipos.map((c) => (
                  <Etiqueta key={`${c.icono}|${c.tipo}`} className="bg-white text-stone-600 ring-1 ring-stone-900/5">
                    <span aria-hidden="true">{c.icono}</span> {c.tipo}
                  </Etiqueta>
                ))}
              </p>
            )}
          </div>

          <AvisoRecienHecha acciones={acciones} />

          {/* El día elegido: sus tareas (se pueden marcar) y sus planes. */}
          <div className="border-t border-stone-100 pt-3" aria-label={`Día elegido: ${diaLargo(elegido)}`} role="region">
            <h3 className="flex items-center gap-2 font-bold">
              {diaLargo(elegido)}
              {elegido === hoy && <Etiqueta className="bg-marca-suave text-marca">Hoy</Etiqueta>}
            </h3>
            {reales.length > 0 && (
              <ListaTareas
                tareas={reales.map((c) => c.o.tarea)}
                acciones={acciones}
                nombres={nombres}
                dibujoDe={(t) => iconoDe.get(t.id) ?? '📌'}
              />
            )}
            {previstas.length > 0 && (
              <ul className={`divide-y divide-stone-100 ${reales.length > 0 ? 'border-t border-stone-100' : ''}`}>
                {previstas.map((p) => (
                  <FilaPrevista key={p.clave} prevista={p} nombres={nombres} dibujo={iconoDeTarea(p.tarea, datos.info).icono} />
                ))}
              </ul>
            )}
            {planes.length > 0 && (
              <ul className="mt-2 flex flex-col gap-2">
                {planes.map((c) => (
                  <li key={c.clave}>
                    <button
                      type="button"
                      onClick={() => ir('/planes')}
                      className={`flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm font-semibold ${
                        infoCategoriaPlan(datos.categoriasPlan, c.plan.categoria_id).suave
                      }`}
                    >
                      <span aria-hidden="true">{c.icono}</span>
                      <span className={`min-w-0 flex-1 ${c.entrada.hecho ? 'line-through opacity-70' : ''}`}>{c.plan.nombre}</span>
                      <span className="shrink-0 text-xs font-medium">{c.entrada.hecho ? '✅ Lo hicisteis' : 'Plan ›'}</span>
                    </button>
                  </li>
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
                ) : filtro === 'planes' && datos.agenda.length === 0 ? (
                  <>
                    Aún no tenéis planes en el calendario.{' '}
                    <button type="button" onClick={() => ir('/planes')} className="font-semibold text-marca">
                      Ir a Planes ›
                    </button>
                  </>
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
