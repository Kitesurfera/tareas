import { useEffect, useState } from 'react'
import { mensajeDeError } from './errores'
import { hoyComoTexto, sumarDias } from './fechas'
import type { Plan } from './planes'
import { supabase } from './supabase'
import type { Categoria, Miembro } from './tipos'

// 📋 Plantillas de tareas (tablas plantillas y preparativos). Una plantilla
// es una lista de tareas con «cuántos días antes o después» del día clave;
// al usarla se crean unos preparativos («Mudanza, 15 de marzo») con sus
// tareas normales. Las sugeridas viven aquí (no en la base de datos); las
// vuestras, en la tabla plantillas.

export type TareaPlantilla = { titulo: string; categoria: Categoria; dias: number }

export type GrupoPlantilla = 'vuestras' | 'casa' | 'viajes' | 'celebraciones' | 'fiestas' | 'aire_libre'

export type Plantilla = {
  // «s-mudanza» (sugerida) o el id (vuestra).
  clave: string
  id: string | null
  nombre: string
  dibujo: string
  // «¿Cuándo es la mudanza?»
  pregunta: string
  tareas: TareaPlantilla[]
  grupo: GrupoPlantilla
  // Las fiestas con fecha fija (Navidad: 24 de diciembre).
  fija?: { mes: number; dia: number }
}

export type Preparativo = {
  id: string
  hogar_id: string
  nombre: string
  dibujo: string
  fecha: string
  plantilla_id: string | null
  agenda_plan_id: string | null
  creado_en: string
  total: number
  hechas: number
}

export const GRUPOS: { id: GrupoPlantilla; titulo: string }[] = [
  { id: 'vuestras', titulo: '⭐ Vuestras plantillas' },
  { id: 'casa', titulo: '🏠 Casa y familia' },
  { id: 'viajes', titulo: '✈️ Viajes' },
  { id: 'celebraciones', titulo: '🎉 Celebraciones y fiestas' },
  { id: 'fiestas', titulo: '🎄 Fiestas del año' },
  { id: 'aire_libre', titulo: '🍖 Barbacoas y comidas al aire libre' },
]

type Sugerida = { slug: string; grupo: Exclude<GrupoPlantilla, 'vuestras'>; nombre: string; dibujo: string; pregunta: string; fija?: { mes: number; dia: number }; tareas: [string, Categoria, number][] }

// Las sugeridas: [título, categoría, días] (negativo = antes del día clave).
const SUGERIDAS_BASE: Sugerida[] = [
  // --- Casa y familia
  {
    slug: 'mudanza', grupo: 'casa', nombre: 'Mudanza', dibujo: '📦', pregunta: '¿Cuándo es la mudanza?',
    tareas: [
      ['Pedir presupuestos de mudanza', 'otros', -42],
      ['Avisar al casero o dar el preaviso', 'papeleo', -35],
      ['Comprar cajas, cinta y rotuladores', 'casa', -21],
      ['Empezar a empaquetar lo que no se usa', 'casa', -14],
      ['Dar de alta luz, agua, gas e internet en la casa nueva', 'papeleo', -14],
      ['Reservar el ascensor o el permiso para aparcar el camión', 'papeleo', -7],
      ['Dar de baja los suministros de la casa vieja', 'papeleo', -3],
      ['Preparar una caja con lo imprescindible del primer día', 'casa', -1],
      ['Hacer fotos de los contadores', 'papeleo', 0],
      ['Cambiar la dirección en el banco, el seguro y el trabajo', 'papeleo', 7],
      ['Empadronarse en la nueva dirección', 'papeleo', 14],
      ['Cambiar la dirección del DNI y del coche', 'papeleo', 30],
    ],
  },
  {
    slug: 'vuelta-al-cole', grupo: 'casa', nombre: 'Vuelta al cole', dibujo: '🎒', pregunta: '¿Cuándo empieza el cole?',
    tareas: [
      ['Revisar qué ropa y calzado se ha quedado pequeño', 'casa', -30],
      ['Comprar o reservar los libros', 'otros', -21],
      ['Comprar el material escolar', 'otros', -14],
      ['Apuntarse a las extraescolares', 'papeleo', -10],
      ['Marcar la ropa y el material con el nombre', 'casa', -7],
      ['Preparar la mochila y el uniforme', 'casa', -1],
      ['Apuntar los festivos y las reuniones del curso', 'papeleo', 7],
    ],
  },
  {
    slug: 'bebe', grupo: 'casa', nombre: 'Llega un bebé', dibujo: '👶', pregunta: '¿Cuándo sale de cuentas?',
    tareas: [
      ['Preparar la habitación y la cuna', 'casa', -60],
      ['Comprar la silla del coche', 'coche', -45],
      ['Mirar los permisos de nacimiento en el trabajo', 'papeleo', -45],
      ['Lavar la ropita y las sábanas', 'casa', -30],
      ['Preparar la bolsa del hospital', 'otros', -30],
      ['Inscribirlo en el Registro Civil (si no lo hace el hospital)', 'papeleo', 3],
      ['Pedir cita con el pediatra', 'otros', 5],
      ['Pedir la prestación por nacimiento en la Seguridad Social', 'papeleo', 7],
      ['Pedir su tarjeta sanitaria', 'papeleo', 14],
    ],
  },
  {
    slug: 'mascota', grupo: 'casa', nombre: 'Llega una mascota', dibujo: '🐶', pregunta: '¿Cuándo llega?',
    tareas: [
      ['Comprar cama, comederos y juguetes', 'mascota', -7],
      ['Comprar su comida', 'mascota', -3],
      ['Preparar un rincón tranquilo en casa', 'casa', -1],
      ['Pedir cita con el veterinario', 'mascota', 3],
      ['Comprobar el microchip y ponerlo a vuestro nombre', 'mascota', 7],
      ['Apuntar sus vacunas y desparasitaciones en la app', 'mascota', 7],
      ['Mirar el seguro de responsabilidad civil', 'papeleo', 14],
    ],
  },
  // --- Viajes
  {
    slug: 'viaje', grupo: 'viajes', nombre: 'Viaje', dibujo: '✈️', pregunta: '¿Cuándo os vais?',
    tareas: [
      ['Comprar los billetes', 'otros', -60],
      ['Reservar el alojamiento', 'otros', -60],
      ['Revisar que el DNI o el pasaporte no caduquen', 'papeleo', -45],
      ['Contratar un seguro de viaje', 'papeleo', -21],
      ['Pedir la tarjeta sanitaria europea (si salís de España)', 'papeleo', -21],
      ['Organizar quién cuida de la mascota', 'mascota', -14],
      ['Organizar quién riega las plantas', 'plantas', -7],
      ['Hacer el check-in', 'otros', -1],
      ['Hacer la maleta', 'casa', -1],
      ['Cerrar el agua y el gas y bajar las persianas', 'casa', 0],
      ['Deshacer la maleta y poner lavadoras', 'casa', 1],
    ],
  },
  {
    slug: 'viaje-en-coche', grupo: 'viajes', nombre: 'Viaje en coche', dibujo: '🚗', pregunta: '¿Cuándo salís?',
    tareas: [
      ['Revisar la ITV y el seguro del coche', 'coche', -21],
      ['Revisar el aceite, el agua y la presión de las ruedas', 'coche', -3],
      ['Comprobar que lleváis la baliza V16 y el chaleco', 'coche', -3],
      ['Descargar mapas y música sin conexión', 'otros', -1],
      ['Preparar agua y algo de picar para el camino', 'casa', -1],
      ['Echar gasolina', 'coche', -1],
    ],
  },
  {
    slug: 'escapada', grupo: 'viajes', nombre: 'Escapada de fin de semana', dibujo: '🏕️', pregunta: '¿Cuándo es la escapada?',
    tareas: [
      ['Reservar el alojamiento', 'otros', -21],
      ['Organizar quién cuida de la mascota y las plantas', 'mascota', -5],
      ['Mirar el tiempo y qué hacer cada día', 'otros', -3],
      ['Comprar algo para el camino', 'casa', -1],
      ['Hacer la maleta', 'casa', -1],
    ],
  },
  {
    slug: 'cerrar-la-casa', grupo: 'viajes', nombre: 'Cerrar la casa por vacaciones', dibujo: '🔒', pregunta: '¿Cuándo os vais?',
    tareas: [
      ['Organizar quién riega las plantas', 'plantas', -7],
      ['Organizar quién cuida de la mascota', 'mascota', -7],
      ['Gastar o tirar lo que caduca de la nevera', 'casa', -2],
      ['Sacar la basura', 'casa', 0],
      ['Desenchufar aparatos y cerrar el agua y el gas', 'casa', 0],
      ['Bajar las persianas y cerrar las ventanas', 'casa', 0],
    ],
  },
  // --- Celebraciones y fiestas
  {
    slug: 'cumple', grupo: 'celebraciones', nombre: 'Cumpleaños', dibujo: '🎂', pregunta: '¿Cuándo es el cumple?',
    tareas: [
      ['Pensar el regalo', 'otros', -21],
      ['Invitar a la gente', 'otros', -14],
      ['Comprar el regalo', 'otros', -10],
      ['Encargar la tarta', 'otros', -5],
      ['Comprar velas y decoración', 'casa', -3],
      ['Envolver el regalo', 'casa', -1],
    ],
  },
  {
    slug: 'fiesta', grupo: 'celebraciones', nombre: 'Fiesta en casa', dibujo: '🎉', pregunta: '¿Cuándo es la fiesta?',
    tareas: [
      ['Hacer la lista de invitados y avisar', 'otros', -21],
      ['Decidir el menú', 'casa', -10],
      ['Comprar platos, vasos y servilletas', 'casa', -5],
      ['Preparar la música', 'otros', -2],
      ['Comprar la comida', 'casa', -2],
      ['Comprar la bebida y el hielo', 'casa', -1],
      ['Limpiar y ordenar la casa', 'casa', -1],
      ['Recoger y sacar el vidrio', 'casa', 1],
    ],
  },
  {
    slug: 'boda', grupo: 'celebraciones', nombre: 'Boda (de invitadas)', dibujo: '💍', pregunta: '¿Cuándo es la boda?',
    tareas: [
      ['Confirmar la asistencia', 'otros', -60],
      ['Reservar el alojamiento', 'otros', -45],
      ['Elegir el regalo o preparar la transferencia', 'otros', -30],
      ['Comprar o alquilar la ropa', 'otros', -30],
      ['Pedir cita en la peluquería', 'otros', -14],
      ['Preparar una tarjeta con unas palabras', 'otros', -2],
    ],
  },
  {
    slug: 'aniversario', grupo: 'celebraciones', nombre: 'Aniversario', dibujo: '🥂', pregunta: '¿Cuándo es el aniversario?',
    tareas: [
      ['Pensar un plan especial', 'otros', -21],
      ['Reservar el restaurante', 'otros', -14],
      ['Comprar el regalo', 'otros', -7],
      ['Escribir una tarjeta', 'otros', -1],
    ],
  },
  // --- Fiestas del año
  {
    slug: 'navidad', grupo: 'fiestas', nombre: 'Navidad', dibujo: '🎄', pregunta: '¿Qué día es la cena de Nochebuena?', fija: { mes: 12, dia: 24 },
    tareas: [
      ['Decidir dónde se cena cada día', 'otros', -30],
      ['Hacer la lista de regalos', 'otros', -30],
      ['Poner el árbol y los adornos', 'casa', -21],
      ['Comprar los regalos', 'otros', -14],
      ['Encargar el marisco, la carne o el cordero', 'casa', -10],
      ['Enviar felicitaciones', 'otros', -7],
      ['Comprar lo de la cena', 'casa', -2],
      ['Envolver los regalos', 'casa', -1],
      ['Quitar los adornos', 'casa', 14],
    ],
  },
  {
    slug: 'nochevieja', grupo: 'fiestas', nombre: 'Nochevieja', dibujo: '🎆', pregunta: '¿Qué día es Nochevieja?', fija: { mes: 12, dia: 31 },
    tareas: [
      ['Decidir dónde y con quién', 'otros', -21],
      ['Comprar el cava', 'casa', -3],
      ['Comprar las uvas', 'casa', -2],
      ['Preparar la ropa', 'otros', -1],
    ],
  },
  {
    slug: 'reyes', grupo: 'fiestas', nombre: 'Reyes', dibujo: '👑', pregunta: '¿Qué día son los Reyes?', fija: { mes: 1, dia: 6 },
    tareas: [
      ['Escribir la carta', 'otros', -30],
      ['Comprar los regalos', 'otros', -14],
      ['Ir a ver la cabalgata', 'otros', -1],
      ['Comprar el roscón', 'casa', -1],
      ['Envolver y esconder los regalos', 'casa', -1],
    ],
  },
  {
    slug: 'halloween', grupo: 'fiestas', nombre: 'Halloween', dibujo: '🎃', pregunta: '¿Qué día es Halloween?', fija: { mes: 10, dia: 31 },
    tareas: [
      ['Preparar o comprar el disfraz', 'otros', -14],
      ['Comprar caramelos', 'casa', -3],
      ['Decorar la casa', 'casa', -2],
      ['Quitar la decoración', 'casa', 3],
    ],
  },
  // --- Barbacoas y comidas al aire libre
  {
    slug: 'barbacoa', grupo: 'aire_libre', nombre: 'Barbacoa', dibujo: '🍖', pregunta: '¿Cuándo es la barbacoa?',
    tareas: [
      ['Avisar a la gente y contar cuántos sois', 'otros', -10],
      ['Revisar la barbacoa y limpiar la parrilla', 'casa', -5],
      ['Comprar carbón y pastillas de encendido', 'casa', -3],
      ['Mirar el tiempo', 'otros', -2],
      ['Comprar la carne, las verduras y el pan', 'casa', -1],
      ['Comprar la bebida y el hielo', 'casa', -1],
      ['Preparar las salsas y las ensaladas', 'casa', 0],
      ['Recoger, limpiar la parrilla y sacar el vidrio', 'casa', 1],
    ],
  },
  {
    slug: 'asado-en-el-campo', grupo: 'aire_libre', nombre: 'Asado en el campo', dibujo: '🔥', pregunta: '¿Cuándo es el asado?',
    tareas: [
      ['Buscar un merendero o una zona de barbacoa permitida', 'otros', -14],
      ['Avisar a la gente', 'otros', -10],
      ['Mirar si está prohibido hacer fuego esos días', 'papeleo', -2],
      ['Comprar la carne, el pan y la bebida', 'casa', -1],
      ['Preparar la nevera portátil y el hielo', 'casa', -1],
      ['Llevar carbón, pinzas, cuchillos y bolsas de basura', 'casa', -1],
    ],
  },
  {
    slug: 'paella', grupo: 'aire_libre', nombre: 'Paella para muchos', dibujo: '🥘', pregunta: '¿Cuándo es la paella?',
    tareas: [
      ['Avisar a la gente y contar cuántos sois', 'otros', -10],
      ['Revisar la paellera y el gas', 'casa', -3],
      ['Encargar el marisco', 'casa', -3],
      ['Comprar el arroz, el azafrán y la carne', 'casa', -2],
      ['Comprar la bebida y el hielo', 'casa', -1],
    ],
  },
]

export const SUGERIDAS: Plantilla[] = SUGERIDAS_BASE.map((s) => ({
  clave: `s-${s.slug}`,
  id: null,
  nombre: s.nombre,
  dibujo: s.dibujo,
  pregunta: s.pregunta,
  grupo: s.grupo,
  fija: s.fija,
  tareas: s.tareas.map(([titulo, categoria, dias]) => ({ titulo, categoria, dias })),
}))

export const slugDe = (clave: string) => (clave.startsWith('s-') ? clave.slice(2) : null)

// La fecha de una tarea: el día clave ± sus días.
export const fechaDeTarea = (fechaClave: string, dias: number) => sumarDias(fechaClave, dias)

// «2 semanas antes», «el mismo día», «1 mes después», «3 días antes».
export function textoDias(dias: number): string {
  if (dias === 0) return 'el mismo día'
  const n = Math.abs(dias)
  const cuando = dias < 0 ? 'antes' : 'después'
  if (n % 30 === 0) return `${n / 30 === 1 ? '1 mes' : `${n / 30} meses`} ${cuando}`
  if (n % 7 === 0) return `${n / 7 === 1 ? '1 semana' : `${n / 7} semanas`} ${cuando}`
  return `${n === 1 ? '1 día' : `${n} días`} ${cuando}`
}

// La próxima vez de una fiesta con fecha fija (hoy incluido).
export function proximaFechaFija(fija: { mes: number; dia: number }, hoy = hoyComoTexto()): string {
  const anio = Number(hoy.slice(0, 4))
  const dos = (n: number) => String(n).padStart(2, '0')
  const esteAnio = `${anio}-${dos(fija.mes)}-${dos(fija.dia)}`
  return esteAnio >= hoy ? esteAnio : `${anio + 1}-${dos(fija.mes)}-${dos(fija.dia)}`
}

// «⚖️ Repartir a medias»: una para cada persona, por turnos (empezando por ti).
export function repartirAMedias<T>(tareas: T[], miembros: Pick<Miembro, 'id'>[], yo: string | null): (string | null)[] {
  if (miembros.length === 0) return tareas.map(() => null)
  const orden = yo ? [...miembros.filter((m) => m.id === yo), ...miembros.filter((m) => m.id !== yo)] : miembros
  return tareas.map((_, i) => orden[i % orden.length].id)
}

// ---------------------------------------------------------------------
// Planes: ¿qué plantilla le va a un plan? ¿Es un plan «con miga»?
// ---------------------------------------------------------------------

const normalizar = (texto: string) => texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const PALABRAS: [RegExp, string][] = [
  [/barbacoa|parrillada|a la brasa/, 'barbacoa'],
  [/asado|merendero/, 'asado-en-el-campo'],
  [/paella/, 'paella'],
  [/ruta en coche|road ?trip/, 'viaje-en-coche'],
  [/escapada|finde|fin de semana|casa rural|camping|acampada/, 'escapada'],
  [/viaje|vuelo|avion|vacaciones/, 'viaje'],
  [/cumple/, 'cumple'],
  [/boda/, 'boda'],
  [/aniversario/, 'aniversario'],
  [/nochebuena|navidad/, 'navidad'],
  [/nochevieja|fin de ano/, 'nochevieja'],
  [/reyes|roscon/, 'reyes'],
  [/halloween/, 'halloween'],
  [/fiesta|cena con amigos|cena en casa|guateque/, 'fiesta'],
]

// La sugerida que pega con el nombre del plan («Barbacoa con amigos» → barbacoa).
export function sugeridaParaPlan(plan: Pick<Plan, 'nombre'>): Plantilla | null {
  const nombre = normalizar(plan.nombre)
  const slug = PALABRAS.find(([re]) => re.test(nombre))?.[1]
  return slug ? (SUGERIDAS.find((s) => s.clave === `s-${slug}`) ?? null) : null
}

// La plantilla de un plan: la que tiene elegida o, si no, la que pega con su nombre.
export function plantillaDelPlan(plan: Plan, vuestras: Plantilla[]): Plantilla | null {
  if (plan.plantilla_id) return vuestras.find((p) => p.id === plan.plantilla_id) ?? null
  if (plan.plantilla_sugerida) return SUGERIDAS.find((s) => s.clave === `s-${plan.plantilla_sugerida}`) ?? null
  return sugeridaParaPlan(plan)
}

// ¿Merece la pena preguntar al programarlo? (De un día o más, con mucha
// energía, con plantilla elegida o con un nombre que pega con una.)
export function esPlanConMiga(plan: Plan): boolean {
  if (plan.sin_preparativos) return false
  return Boolean(
    plan.plantilla_id || plan.plantilla_sugerida || plan.duracion === 'dia' || plan.duracion === 'varios_dias' || plan.energia === 'mucha' || sugeridaParaPlan(plan),
  )
}

// ---------------------------------------------------------------------
// Datos: vuestras plantillas y los preparativos (con su progreso)
// ---------------------------------------------------------------------

type FilaPlantilla = { id: string; nombre: string; dibujo: string; pregunta: string; tareas: TareaPlantilla[] }
const deFila = (f: FilaPlantilla): Plantilla => ({ clave: f.id, id: f.id, nombre: f.nombre, dibujo: f.dibujo, pregunta: f.pregunta, tareas: f.tareas, grupo: 'vuestras' })

function faltaElSql(codigo: string | undefined) {
  return codigo === '42P01' || codigo === 'PGRST205' || codigo === '42703' || codigo === 'PGRST204'
}
export const MENSAJE_FALTA_SQL = 'Falta ejecutar en Supabase el SQL de las plantillas (20261201100000_plantillas.sql).'

export type DatosPlantillas = { vuestras: Plantilla[]; preparativos: Preparativo[] }

export function usePlantillas() {
  const [datos, setDatos] = useState<DatosPlantillas | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    Promise.all([
      supabase.from('plantillas').select('id, nombre, dibujo, pregunta, tareas').order('nombre'),
      supabase.from('preparativos').select('*').order('fecha'),
      supabase.from('tareas').select('preparativo_id, completada').not('preparativo_id', 'is', null),
    ]).then(([plantillas, preparativos, tareas]) => {
      if (!vigente) return
      const fallo = plantillas.error ?? preparativos.error ?? tareas.error
      if (fallo) {
        setError(faltaElSql(fallo.code) ? MENSAJE_FALTA_SQL : mensajeDeError(fallo))
        setDatos({ vuestras: [], preparativos: [] })
        return
      }
      setError(null)
      const cuentas = new Map<string, { total: number; hechas: number }>()
      for (const t of tareas.data as { preparativo_id: string; completada: boolean }[]) {
        const c = cuentas.get(t.preparativo_id) ?? { total: 0, hechas: 0 }
        c.total++
        if (t.completada) c.hechas++
        cuentas.set(t.preparativo_id, c)
      }
      setDatos({
        vuestras: (plantillas.data as FilaPlantilla[]).map(deFila),
        preparativos: (preparativos.data as Omit<Preparativo, 'total' | 'hechas'>[]).map((p) => ({ ...p, ...(cuentas.get(p.id) ?? { total: 0, hechas: 0 }) })),
      })
    })
    const alCambiar = () => setRecarga((n) => n + 1)
    window.addEventListener('plantillas-cambiadas', alCambiar)
    return () => {
      vigente = false
      window.removeEventListener('plantillas-cambiadas', alCambiar)
    }
  }, [recarga])

  return { datos, error, recargar: () => setRecarga((n) => n + 1) }
}

// En marcha = le queda algo por hacer.
export const enMarcha = (p: Preparativo) => p.total > 0 && p.hechas < p.total

export function buscarPlantilla(clave: string, vuestras: Plantilla[]): Plantilla | null {
  return SUGERIDAS.find((s) => s.clave === clave) ?? vuestras.find((p) => p.clave === clave) ?? null
}

const avisar = () => window.dispatchEvent(new Event('plantillas-cambiadas'))

async function hacer(consulta: PromiseLike<{ error: { message?: string; code?: string } | null }>): Promise<string | null> {
  const { error } = await consulta
  if (!error) {
    avisar()
    return null
  }
  return faltaElSql(error.code) ? MENSAJE_FALTA_SQL : mensajeDeError(error)
}

export type PlantillaParaGuardar = Pick<Plantilla, 'nombre' | 'dibujo' | 'pregunta' | 'tareas'>

// Guarda una plantilla vuestra (nueva o cambiada). Devuelve su id o el error.
export async function guardarPlantilla(hogarId: string, p: PlantillaParaGuardar, id: string | null): Promise<{ id: string | null; error: string | null }> {
  if (!supabase) return { id: null, error: 'Sin conexión.' }
  const fila = { nombre: p.nombre.trim(), dibujo: p.dibujo.trim() || '📋', pregunta: p.pregunta.trim() || '¿Para cuándo?', tareas: p.tareas.map((t) => ({ titulo: t.titulo.trim(), categoria: t.categoria, dias: Math.round(t.dias) })) }
  const consulta = id
    ? supabase.from('plantillas').update(fila).eq('id', id).select('id').single()
    : supabase.from('plantillas').insert({ hogar_id: hogarId, ...fila }).select('id').single()
  const { data, error } = await consulta
  if (error) return { id: null, error: faltaElSql(error.code) ? MENSAJE_FALTA_SQL : mensajeDeError(error) }
  avisar()
  return { id: (data as { id: string }).id, error: null }
}

export function borrarPlantilla(id: string): Promise<string | null> {
  if (!supabase) return Promise.resolve('Sin conexión.')
  return hacer(supabase.from('plantillas').delete().eq('id', id))
}

export type TareaParaCrear = { titulo: string; categoria: Categoria; fecha_limite: string; responsable_id: string | null }

// Usar una plantilla: los preparativos y todas sus tareas de una vez.
export async function crearPreparativos(datos: {
  nombre: string
  dibujo: string
  fecha: string
  tareas: TareaParaCrear[]
  plantillaId: string | null
  agendaPlanId: string | null
}): Promise<{ id: string | null; error: string | null }> {
  if (!supabase) return { id: null, error: 'Sin conexión.' }
  const { data, error } = await supabase.rpc('crear_preparativos', {
    nombre: datos.nombre.trim(),
    dibujo: datos.dibujo,
    fecha: datos.fecha,
    las_tareas: datos.tareas,
    plantilla: datos.plantillaId,
    agenda_plan: datos.agendaPlanId,
  })
  if (error) {
    const sinSql = faltaElSql(error.code) || error.code === '42883' || error.code === 'PGRST202'
    return { id: null, error: sinSql ? MENSAJE_FALTA_SQL : mensajeDeError(error) }
  }
  avisar()
  return { id: data as string, error: null }
}

export function cambiarFechaPreparativos(id: string, fecha: string): Promise<string | null> {
  if (!supabase) return Promise.resolve('Sin conexión.')
  return hacer(supabase.from('preparativos').update({ fecha }).eq('id', id))
}

export function cambiarNombrePreparativos(id: string, nombre: string): Promise<string | null> {
  if (!supabase) return Promise.resolve('Sin conexión.')
  return hacer(supabase.from('preparativos').update({ nombre: nombre.trim() }).eq('id', id))
}

export function borrarPreparativos(id: string): Promise<string | null> {
  if (!supabase) return Promise.resolve('Sin conexión.')
  return hacer(supabase.from('preparativos').delete().eq('id', id))
}

// Recordar en el plan qué plantilla se usó (para la próxima vez), o «no preguntar más».
export function elegirPlantillaDelPlan(planId: string, clave: string | null, sinPreparativos = false): Promise<string | null> {
  if (!supabase) return Promise.resolve('Sin conexión.')
  const slug = clave ? slugDe(clave) : null
  return hacer(
    supabase
      .from('planes')
      .update({ plantilla_id: clave && !slug ? clave : null, plantilla_sugerida: slug, sin_preparativos: sinPreparativos })
      .eq('id', planId),
  )
}

// «✨ Hazme una plantilla»: la IA propone; nada se guarda hasta revisarlo.
export async function plantillaConIA(texto: string): Promise<{ plantilla: PlantillaParaGuardar | null; error: string | null }> {
  if (!supabase) return { plantilla: null, error: 'Sin conexión.' }
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { plantilla: null, error: 'Tienes que entrar con tu cuenta.' }
  try {
    const respuesta = await fetch('/api/plantilla-ia', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto }),
    })
    const cuerpo = (await respuesta.json().catch(() => ({}))) as { plantilla?: PlantillaParaGuardar; error?: string }
    if (!respuesta.ok || !cuerpo.plantilla) return { plantilla: null, error: cuerpo.error ?? 'La IA no ha podido hacer la plantilla. Prueba otra vez.' }
    return { plantilla: cuerpo.plantilla, error: null }
  } catch {
    return { plantilla: null, error: 'Sin conexión. Prueba otra vez.' }
  }
}

// El plan del calendario con el que van unos preparativos (#/…/plan/<id>).
// undefined = cargando; null = no está (o no hay id).
export function usePlanDeAgenda(agendaId: string | null) {
  const [resultado, setResultado] = useState<{ id: string; fecha: string; hecho: boolean; plan: Plan } | null | undefined>(agendaId ? undefined : null)
  useEffect(() => {
    if (!supabase || !agendaId) return
    let vigente = true
    const cliente = supabase
    void (async () => {
      const { data: entrada } = await cliente.from('agenda_planes').select('id, fecha, hecho, plan_id').eq('id', agendaId).maybeSingle()
      const fila = entrada as { id: string; fecha: string; hecho: boolean; plan_id: string } | null
      const { data: plan } = fila ? await cliente.from('planes').select('*').eq('id', fila.plan_id).maybeSingle() : { data: null }
      if (vigente) setResultado(fila && plan ? { id: fila.id, fecha: fila.fecha, hecho: fila.hecho, plan: plan as Plan } : null)
    })()
    return () => {
      vigente = false
    }
  }, [agendaId])
  return resultado
}

// «/plan/<id>» al final de una ruta (si va con un plan del calendario).
export const sufijoPlan = (agendaId: string | null) => (agendaId ? `/plan/${agendaId}` : '')
