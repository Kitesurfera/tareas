// «✨ Hazme una plantilla»: la persona dice qué quiere organizar («la boda
// de mi hermana», «escapada a la montaña con la perra») y la IA gratuita
// (api/_lib/ia.ts) propone la lista de tareas, cada una con cuántos días
// antes o después del día clave toca. La app no guarda nada hasta que la
// persona lo revisa.
//
// - Solo puede usarlo alguien con sesión y con hogar.
// - Máximo de usos al día por hogar, para no gastar el cupo gratuito.
// - A la IA solo le llega lo que escribe la persona (nada del hogar).
// - En el registro nunca se apunta el texto, solo números.
import { supabaseServidor } from './_lib/avisos.js'
import { faltaConfigurarLaIA, preguntarALaIA, respuestaDeError as error } from './_lib/ia.js'
import { instruccionesPlantilla, validarPlantilla } from './_lib/plantilla.js'

const MAX_USOS_AL_DIA = 20
const MAX_LETRAS = 300

export async function POST(request: Request): Promise<Response> {
  // 1. ¿Quién eres y de qué hogar?
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token) return error('Tienes que entrar con tu cuenta.', 401)
  const supabase = supabaseServidor()
  const { data: usuario, error: errorUsuario } = await supabase.auth.getUser(token)
  if (errorUsuario || !usuario.user) return error('Tu sesión no es válida. Vuelve a entrar.', 401)
  const { data: miembro } = await supabase.from('miembros').select('hogar_id').eq('user_id', usuario.user.id).maybeSingle()
  if (!miembro) return error('Primero tienes que crear o unirte a un hogar.', 403)

  // 2. Qué quieren organizar.
  const cuerpo = (await request.json().catch(() => ({}))) as { texto?: unknown }
  const texto = typeof cuerpo.texto === 'string' ? cuerpo.texto.replace(/\s+/g, ' ').trim() : ''
  if (texto.length < 3) return error('Cuéntame un poco qué queréis organizar.', 400)
  if (texto.length > MAX_LETRAS) return error(`Como mucho ${MAX_LETRAS} letras.`, 400)

  // 3. Claves de Cloudflare y límite al día por hogar (se apunta antes de
  //    llamar a la IA; sin poder apuntarlo, no se llama).
  const faltaAlgo = faltaConfigurarLaIA()
  if (faltaAlgo) return faltaAlgo
  const haceUnDia = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error: errorCuenta } = await supabase
    .from('usos_ia')
    .select('id', { count: 'exact', head: true })
    .eq('hogar_id', miembro.hogar_id)
    .eq('tipo', 'plantilla')
    .gte('creado_en', haceUnDia)
  if (errorCuenta) {
    console.error('Plantilla: no se pudo contar los usos', errorCuenta.code)
    return error('No se ha podido comprobar el límite de usos.', 500)
  }
  if ((count ?? 0) >= MAX_USOS_AL_DIA) {
    return error(`Ya habéis pedido ${MAX_USOS_AL_DIA} plantillas a la IA en las últimas 24 horas. Usa una sugerida o prueba mañana.`, 429)
  }
  const { error: errorApunte } = await supabase.from('usos_ia').insert({ hogar_id: miembro.hogar_id, user_id: usuario.user.id, tipo: 'plantilla' })
  if (errorApunte) {
    console.error('Plantilla: no se pudo apuntar el uso', errorApunte.code)
    return error(
      errorApunte.code === '23514'
        ? 'Falta ejecutar en Supabase el SQL de las plantillas (20261201100000_plantillas.sql).'
        : 'No se ha podido apuntar el uso. Prueba otra vez.',
      500,
    )
  }

  // 4. Se lo pasamos a la IA y comprobamos lo que contesta.
  const respuesta = await preguntarALaIA({
    etiqueta: 'Plantilla',
    instrucciones: instruccionesPlantilla(),
    contenido: `Lo que queremos organizar: ${texto}`,
    maxTokens: 1500,
  })
  if ('error' in respuesta) return respuesta.error
  const plantilla = validarPlantilla(respuesta.datos, texto)
  console.log('Plantilla con IA', { letras: texto.length, tareas: plantilla?.tareas.length ?? 0 })
  if (!plantilla) return error('La IA no ha sabido hacer una lista para eso. Prueba a contarlo de otra forma.', 422)
  return Response.json({ plantilla })
}
