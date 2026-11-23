import { useEffect, useState } from 'react'
import type { Documento } from './documentos'
import { mensajeDeError } from './errores'
import { hoyComoTexto, leerFecha, sumarDias, sumarMeses } from './fechas'
import type { CategoriaPlan, EntradaAgenda, Plan } from './planes'
import { supabase } from './supabase'
import type { Miembro, Tarea, Vencimiento } from './tipos'

// «📆 La semana»: lo que viene de lunes a domingo, día a día.

// El lunes de la semana de ese día.
export function lunesDe(fecha: string): string {
  return sumarDias(fecha, -((leerFecha(fecha).getDay() + 6) % 7))
}

// La semana que se enseña al abrir: esta, o la que viene si hoy es domingo
// (el aviso del domingo por la tarde es de la semana que empieza mañana).
export const semanaInicial = (hoy = hoyComoTexto()) => lunesDe(sumarDias(hoy, 1))

export const diasDeLaSemana = (lunes: string) => Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i))

// «Lunes 30», «Domingo 6».
export function nombreDelDia(fecha: string): string {
  const texto = leerFecha(fecha).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

// «Esta semana», «La semana que viene», «Dentro de 3 semanas».
export function nombreDeLaSemana(lunes: string, hoy = hoyComoTexto()): string {
  const semanas = Math.round((leerFecha(lunes).getTime() - leerFecha(lunesDe(hoy)).getTime()) / (7 * 86_400_000))
  if (semanas === 0) return 'Esta semana'
  if (semanas === 1) return 'La semana que viene'
  if (semanas === -1) return 'La semana pasada'
  return semanas > 0 ? `Dentro de ${semanas} semanas` : `Hace ${-semanas} semanas`
}

// Las veces que un seguro o una suscripción se renueva entre dos fechas
// (aunque la fecha guardada ya haya pasado: se renuevan solas).
export function renovacionesEntre(v: Pick<Vencimiento, 'fecha_renovacion' | 'frecuencia_meses'>, desde: string, hasta: string): string[] {
  if (!v.frecuencia_meses) return v.fecha_renovacion >= desde && v.fecha_renovacion <= hasta ? [v.fecha_renovacion] : []
  const fechas: string[] = []
  for (let vuelta = 0; vuelta < 3000; vuelta++) {
    const fecha = sumarMeses(v.fecha_renovacion, v.frecuencia_meses * vuelta)
    if (fecha > hasta) break
    if (fecha >= desde) fechas.push(fecha)
  }
  return fechas
}

// Una repetición prevista de una tarea automática (la siguiente vez que
// toca, si se hace el día que toca). No es una tarea de verdad todavía.
export type Prevista = {
  clave: string
  tarea: Tarea
  fecha: string
  responsableId: string | null
  // Si es de una rutina con turnos (entonces el responsable es una previsión).
  turno: boolean
}

// Lo que hace falta saber de cada rutina para prever sus turnos.
export type RutinaTurnos = { id: string; frecuencia_dias: number; turnos: boolean; participantes: string[] | null }

// Las próximas veces de una tarea automática dentro de la semana:
// si se hace el día que toca (u hoy, si va atrasada), la siguiente es
// «frecuencia» días después, y así. Si la rutina tiene turnos, cada vez le
// toca a la siguiente persona (por orden de llegada al hogar).
export function repeticiones(
  tarea: Tarea,
  frecuencia: number,
  desde: string,
  hasta: string,
  hoy: string,
  turnoDe?: (vez: number) => string | null,
): Prevista[] {
  if (!tarea.fecha_limite || frecuencia < 1) return []
  const base = tarea.fecha_limite > hoy ? tarea.fecha_limite : hoy
  const previstas: Prevista[] = []
  for (let vez = 1; vez < 400; vez++) {
    const fecha = sumarDias(base, frecuencia * vez)
    if (fecha > hasta) break
    if (fecha < desde) continue
    previstas.push({
      clave: `${tarea.id}-${vez}`,
      tarea,
      fecha,
      responsableId: turnoDe ? turnoDe(vez) : tarea.responsable_id,
      turno: Boolean(turnoDe),
    })
  }
  return previstas
}

// A quién le tocaría la vez número «vez» después de la actual: la gente
// que se turna (o todo el hogar), en orden de llegada, dando la vuelta.
export function siguienteTurno(rutina: RutinaTurnos, actual: string | null, miembros: Miembro[]) {
  const gente = miembros.filter((m) => !rutina.participantes?.length || rutina.participantes.includes(m.id))
  const posicion = gente.findIndex((m) => m.id === actual)
  return (vez: number) => (posicion < 0 ? actual : gente[(posicion + vez) % gente.length].id)
}

// Lo que toca entre dos fechas: las tareas con su fecha y las siguientes
// veces previstas de lo que se repite (rutinas, cuidados y tratamientos).
export type Ocurrencia = {
  clave: string
  tarea: Tarea
  fecha: string
  responsableId: string | null
  // Prevista = la siguiente vez de algo que se repite (aún no es una tarea).
  prevista: boolean
  turno: boolean
}

export function ocurrencias(
  tareas: Tarea[],
  rutinas: RutinaTurnos[],
  frecuencias: Record<string, number>,
  miembros: Miembro[],
  desde: string,
  hasta: string,
  hoy: string,
): Ocurrencia[] {
  const lista: Ocurrencia[] = []
  for (const tarea of tareas) {
    if (tarea.completada || !tarea.fecha_limite || tarea.fecha_limite > hasta) continue
    if (tarea.fecha_limite >= desde) {
      lista.push({ clave: tarea.id, tarea, fecha: tarea.fecha_limite, responsableId: tarea.responsable_id, prevista: false, turno: false })
    }
    const rutina = tarea.rutina_id ? rutinas.find((r) => r.id === tarea.rutina_id) : undefined
    const frecuencia =
      rutina?.frecuencia_dias ??
      (tarea.tratamiento_id ? frecuencias[tarea.tratamiento_id] : undefined) ??
      (tarea.cuidado_id ? frecuencias[tarea.cuidado_id] : undefined)
    if (frecuencia) {
      const turnoDe = rutina?.turnos ? siguienteTurno(rutina, tarea.responsable_id, miembros) : undefined
      for (const p of repeticiones(tarea, frecuencia, desde, hasta, hoy, turnoDe)) {
        lista.push({ ...p, prevista: true })
      }
    }
  }
  return lista.sort((a, b) => a.fecha.localeCompare(b.fecha) || Number(a.prevista) - Number(b.prevista))
}

export type Renovacion = { clave: string; vencimiento: Vencimiento; fecha: string }
export type PlanDelDia = { entrada: EntradaAgenda; plan: Plan }

export type DiaDeLaSemana = {
  fecha: string
  tareas: Tarea[]
  previstas: Prevista[]
  planes: PlanDelDia[]
  renovaciones: Renovacion[]
  documentos: Documento[]
}

export type DatosSemana = {
  tareas: Tarea[]
  rutinas: RutinaTurnos[]
  frecuencias: Record<string, number> // tratamiento_id / cuidado_id → cada cuántos días
  vencimientos: Vencimiento[]
  documentos: Documento[]
  categoriasPlan: CategoriaPlan[]
  planes: Plan[]
  agenda: EntradaAgenda[]
}

export type Semana = {
  dias: DiaDeLaSemana[]
  // Lo pendiente de antes del lunes (solo en la primera semana que se ve).
  antes: Tarea[]
}

// Reparte todo por días.
export function armarSemana(datos: DatosSemana, miembros: Miembro[], lunes: string, hoy = hoyComoTexto()): Semana {
  const domingo = sumarDias(lunes, 6)
  const enLaSemana = (fecha: string | null) => Boolean(fecha && fecha >= lunes && fecha <= domingo)
  const dias: DiaDeLaSemana[] = diasDeLaSemana(lunes).map((fecha) => ({
    fecha,
    tareas: [],
    previstas: [],
    planes: [],
    renovaciones: [],
    documentos: [],
  }))
  const dia = (fecha: string) => dias[Math.round((leerFecha(fecha).getTime() - leerFecha(lunes).getTime()) / 86_400_000)]

  for (const o of ocurrencias(datos.tareas, datos.rutinas, datos.frecuencias, miembros, lunes, domingo, hoy)) {
    if (o.prevista) dia(o.fecha).previstas.push(o)
    else dia(o.fecha).tareas.push(o.tarea)
  }

  for (const entrada of datos.agenda) {
    const plan = datos.planes.find((p) => p.id === entrada.plan_id)
    if (plan && !entrada.hecho && enLaSemana(entrada.fecha)) dia(entrada.fecha).planes.push({ entrada, plan })
  }
  for (const vencimiento of datos.vencimientos) {
    for (const fecha of renovacionesEntre(vencimiento, lunes, domingo)) {
      dia(fecha).renovaciones.push({ clave: `${vencimiento.id}-${fecha}`, vencimiento, fecha })
    }
  }
  for (const documento of datos.documentos) {
    if (documento.caduca_el && enLaSemana(documento.caduca_el)) dia(documento.caduca_el).documentos.push(documento)
  }

  // Lo de antes solo se enseña en la semana en curso (o en la que viene, si
  // hoy es domingo): ahí es donde hay que hacerlo.
  const antes =
    lunes <= semanaInicial(hoy)
      ? datos.tareas.filter((t) => !t.completada && t.fecha_limite && t.fecha_limite < lunes)
      : []
  return { dias, antes }
}

// Todo lo que hace falta para la semana. null = cargando.
export function useDatosSemana() {
  const [datos, setDatos] = useState<DatosSemana | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    // Gracias a RLS, solo llega lo de tu hogar.
    Promise.all([
      supabase
        .from('tareas')
        .select('*')
        .eq('completada', false)
        .not('fecha_limite', 'is', null)
        .order('fecha_limite')
        .order('creado_en'),
      supabase.from('rutinas').select('id, frecuencia_dias, turnos, participantes'),
      supabase.from('tratamientos').select('id, frecuencia_dias'),
      supabase.from('cuidados').select('id, frecuencia_dias'),
      supabase.from('vencimientos').select('*'),
      supabase.from('documentos').select('*'),
      supabase.from('categorias_plan').select('*').order('orden'),
      supabase.from('planes').select('*'),
      supabase.from('agenda_planes').select('*').gte('fecha', sumarDias(hoyComoTexto(), -7)).order('fecha'),
    ]).then(([tareas, rutinas, tratamientos, cuidados, vencimientos, documentos, categorias, planes, agenda]) => {
      if (!vigente) return
      const fallo =
        tareas.error ?? rutinas.error ?? tratamientos.error ?? cuidados.error ?? vencimientos.error ??
        documentos.error ?? categorias.error ?? planes.error ?? agenda.error
      if (fallo) return setError(mensajeDeError(fallo))
      setError(null)
      const frecuencias: Record<string, number> = {}
      for (const fila of [...(tratamientos.data ?? []), ...(cuidados.data ?? [])] as { id: string; frecuencia_dias: number }[]) {
        frecuencias[fila.id] = fila.frecuencia_dias
      }
      setDatos({
        tareas: tareas.data as Tarea[],
        rutinas: rutinas.data as RutinaTurnos[],
        frecuencias,
        vencimientos: vencimientos.data as Vencimiento[],
        documentos: documentos.data as Documento[],
        categoriasPlan: categorias.data as CategoriaPlan[],
        planes: planes.data as Plan[],
        agenda: agenda.data as EntradaAgenda[],
      })
    })
    return () => {
      vigente = false
    }
  }, [recarga])

  return { datos, error, recargar: () => setRecarga((n) => n + 1) }
}
