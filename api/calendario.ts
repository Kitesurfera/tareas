// El calendario de cada persona para el iPhone o Google Calendar:
// …/api/calendario?t=<su enlace privado>. Sin sesión (los calendarios no
// pueden iniciar sesión): lo protege el código al azar de 64 letras, que la
// persona puede desactivar o cambiar desde Ajustes.
//
// - Solo sale lo suyo y lo que no es de nadie (tareas con fecha) y los
//   planes del hogar. Lo atrasado sale hoy, para que el calendario lo avise.
// - Si está desactivado, el calendario sale vacío; si el enlace no existe
//   (o se cambió), responde 404.
// - En el registro no se apunta nada de nadie.
import { ahoraEnEspana, supabaseServidor } from './_lib/avisos.js'
import { crearCalendario, type EventoCalendario } from './_lib/ics.js'

type Respuesta =
  | { estado: 'desconocido' }
  | { estado: 'desactivado' }
  | {
      estado: 'activo'
      hoy: string
      hogar: string | null
      tareas: { id: string; titulo: string; fecha: string }[]
      planes: { id: string; titulo: string; fecha: string }[]
    }

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
const fechaCorta = (fecha: string) => `${Number(fecha.slice(8, 10))} ${MESES[Number(fecha.slice(5, 7)) - 1]}`

const CABECERAS = {
  'Content-Type': 'text/calendar; charset=utf-8',
  'Content-Disposition': 'inline; filename="tareas.ics"',
  // Cada persona tiene el suyo: que nadie lo guarde para otra.
  'Cache-Control': 'private, max-age=300',
  'X-Robots-Tag': 'noindex',
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const token = url.searchParams.get('t') ?? ''
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return new Response('Este enlace de calendario no existe.', { status: 404 })
  }

  const supabase = supabaseServidor()
  const { data, error } = await supabase.rpc('calendario_por_enlace', { el_token: token })
  if (error) {
    console.error('Calendario: no se pudo preparar', error.code)
    return new Response('No se ha podido preparar el calendario. Prueba más tarde.', { status: 500 })
  }
  const datos = data as Respuesta
  if (datos.estado === 'desconocido') {
    return new Response('Este enlace de calendario no existe o se ha cambiado.', { status: 404 })
  }

  const app = url.origin
  if (datos.estado === 'desactivado') {
    return new Response(
      crearCalendario({ nombre: 'Tareas', descripcion: 'Desactivado desde Ajustes de la app Tareas.', eventos: [] }),
      { headers: CABECERAS },
    )
  }

  const hoy = datos.hoy || ahoraEnEspana().dia
  const eventos: EventoCalendario[] = [
    ...datos.tareas.map((t) => {
      // Lo atrasado sale hoy (así el calendario lo vuelve a avisar).
      const atrasada = t.fecha < hoy
      return {
        uid: `tarea-${t.id}@tareas`,
        titulo: atrasada ? `${t.titulo} (atrasada desde el ${fechaCorta(t.fecha)})` : t.titulo,
        fecha: atrasada ? hoy : t.fecha,
        descripcion: 'Desde la app Tareas. Márcala como hecha en la app.',
        url: `${app}/#/tareas`,
      }
    }),
    ...datos.planes.map((p) => ({
      uid: `plan-${p.id}@tareas`,
      titulo: `🎉 ${p.titulo}`,
      fecha: p.fecha,
      descripcion: 'Un plan del calendario de la app Tareas.',
      url: `${app}/#/planes`,
    })),
  ]

  return new Response(
    crearCalendario({
      nombre: datos.hogar ? `Tareas · ${datos.hogar}` : 'Tareas',
      descripcion: 'Tus tareas con fecha, las que no son de nadie y los planes. Con aviso a las 8:00.',
      eventos,
    }),
    { headers: CABECERAS },
  )
}

// Algunos calendarios preguntan antes si el enlace existe (sin descargarlo).
export async function HEAD(request: Request): Promise<Response> {
  const respuesta = await GET(request)
  return new Response(null, { status: respuesta.status, headers: respuesta.headers })
}
