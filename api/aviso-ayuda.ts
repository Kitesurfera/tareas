// «🙋 Hoy no puedo»: manda el aviso al móvil de una petición de ayuda.
// - Quien PIDE lo llama justo después de pedir: avisa a la otra persona
//   («Ana no llega hoy: ¿te encargas de 3 cosas?»).
// - Quien CONTESTA lo llama justo después de contestar: avisa a quien pidió
//   («💚 Bea se encarga»).
// Cada aviso se manda una sola vez (la base de datos apunta cuándo). Si la
// llamada no toca (otra persona, ya avisado, aún sin contestar…), no hace
// nada. En el registro, solo números.
import { enviar, supabaseServidor, type Aviso, type Movil } from './_lib/avisos.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const error = (mensaje: string, status: number) => Response.json({ error: mensaje }, { status })
const cosas = (n: number) => (n === 1 ? '1 cosa' : `${n} cosas`)

type Peticion = {
  id: string
  hogar_id: string
  de_miembro: string
  para_miembro: string
  tareas: string[]
  mensaje: string | null
  estado: 'pendiente' | 'aceptada' | 'rechazada' | 'cancelada'
  avisada_en: string | null
  respuesta_avisada_en: string | null
}

export async function POST(request: Request): Promise<Response> {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token) return error('Tienes que entrar con tu cuenta.', 401)
  const supabase = supabaseServidor()
  const { data: usuario, error: errorUsuario } = await supabase.auth.getUser(token)
  if (errorUsuario || !usuario.user) return error('Tu sesión no es válida. Vuelve a entrar.', 401)

  const cuerpo = (await request.json().catch(() => ({}))) as { peticion?: unknown }
  if (typeof cuerpo.peticion !== 'string' || !UUID.test(cuerpo.peticion)) return error('Falta la petición.', 400)

  const { data: yo } = await supabase.from('miembros').select('id, hogar_id').eq('user_id', usuario.user.id).maybeSingle()
  if (!yo) return error('Primero tienes que crear o unirte a un hogar.', 403)

  const { data, error: errorPeticion } = await supabase
    .from('peticiones_ayuda')
    .select('id, hogar_id, de_miembro, para_miembro, tareas, mensaje, estado, avisada_en, respuesta_avisada_en')
    .eq('id', cuerpo.peticion)
    .eq('hogar_id', yo.hogar_id)
    .maybeSingle()
  if (errorPeticion) {
    console.error('Ayuda: no se pudo leer la petición', errorPeticion.code)
    return error('No se ha podido mandar el aviso.', 500)
  }
  const p = data as Peticion | null
  if (!p) return Response.json({ avisados: 0 })

  const { data: gente } = await supabase.from('miembros').select('id, user_id, nombre_visible').eq('hogar_id', p.hogar_id)
  const persona = (id: string) => (gente ?? []).find((m) => m.id === id) as { id: string; user_id: string; nombre_visible: string } | undefined
  const de = persona(p.de_miembro)
  const para = persona(p.para_miembro)
  if (!de || !para) return Response.json({ avisados: 0 })
  const n = p.tareas.length

  let destino: string | null = null
  let aviso: Aviso | null = null
  let columna: 'avisada_en' | 'respuesta_avisada_en' | null = null

  if (yo.id === p.de_miembro && p.estado === 'pendiente' && !p.avisada_en) {
    // Quien pide → aviso a quien se lo pide.
    destino = para.user_id
    columna = 'avisada_en'
    aviso = {
      title: `🙋 ${de.nombre_visible} no llega hoy`,
      body: `${p.mensaje ? `${p.mensaje} · ` : ''}¿Te encargas de ${cosas(n)}? Toca para verlas 💚`,
      url: '/#/',
      tag: `ayuda-${p.id}`,
    }
  } else if (yo.id === p.para_miembro && (p.estado === 'aceptada' || p.estado === 'rechazada') && !p.respuesta_avisada_en) {
    // Quien contesta → aviso a quien pidió.
    destino = de.user_id
    columna = 'respuesta_avisada_en'
    aviso =
      p.estado === 'aceptada'
        ? { title: `💚 ${para.nombre_visible} se encarga`, body: `De ${n === 1 ? 'la tarea que le pediste' : `las ${n} cosas que le pediste`}. ¡Cuídate!`, url: '/#/tareas', tag: `ayuda-${p.id}` }
        : { title: `${para.nombre_visible} hoy tampoco puede`, body: 'Quizá otra persona de casa, o lo movéis a otro día.', url: '/#/tareas', tag: `ayuda-${p.id}` }
  }
  if (!destino || !aviso || !columna) return Response.json({ avisados: 0 })

  // Se apunta antes de mandar: así nunca llega dos veces aunque se llame dos veces.
  const { data: apuntada } = await supabase
    .from('peticiones_ayuda')
    .update({ [columna]: new Date().toISOString() })
    .eq('id', p.id)
    .is(columna, null)
    .select('id')
  if (!apuntada || apuntada.length === 0) return Response.json({ avisados: 0 })

  const { data: moviles } = await supabase.from('avisos_push').select('id, endpoint, p256dh, auth').eq('user_id', destino)
  let avisados = 0
  for (const movil of (moviles ?? []) as Movil[]) {
    const resultado = await enviar(movil, aviso)
    if (resultado === 'ok') avisados++
    if (resultado === 'borrar') await supabase.from('avisos_push').delete().eq('id', movil.id)
  }
  console.log('Ayuda avisada', { fase: columna === 'avisada_en' ? 'pedir' : 'contestar', moviles: (moviles ?? []).length, avisados })
  return Response.json({ avisados })
}
