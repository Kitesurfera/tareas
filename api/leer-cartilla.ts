// «Leer la cartilla»: recibe fotos de las páginas de la cartilla de la
// mascota (pasaporte europeo), se las pasa a una IA y devuelve las vacunas y
// tratamientos que encuentra, para que la persona los revise en la app.
//
// La IA es la gratuita de api/_lib/ia.ts (Gemma 4 en Cloudflare).
//
// - Las fotos NO se guardan en ningún sitio: se mandan a la IA y se olvidan.
// - Solo puede usarlo alguien con sesión y con hogar.
// - Máximo de lecturas al día por hogar, para no gastar el cupo gratuito.
import { ahoraEnEspana, supabaseServidor } from './_lib/avisos.js'
import { INSTRUCCIONES, validarResultado } from './_lib/cartilla.js'
import { faltaConfigurarLaIA, preguntarALaIA, respuestaDeError as error, type ParteDelMensaje } from './_lib/ia.js'

const MAX_PAGINAS = 8
const MAX_LECTURAS_AL_DIA = 10
// Una página ya reducida en el móvil pesa unos 300-600 KB.
const MAX_CARACTERES_POR_PAGINA = 2_000_000

// «data:image/jpeg;base64,AAAA…» (y nada más: ni enlaces ni otros tipos).
function paginaValida(valor: unknown): valor is string {
  return (
    typeof valor === 'string' &&
    valor.length <= MAX_CARACTERES_POR_PAGINA &&
    /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(valor)
  )
}

export async function POST(request: Request): Promise<Response> {
  // 1. ¿Quién eres? La app manda tu sesión; Supabase nos dice si es válida.
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token) return error('Tienes que entrar con tu cuenta.', 401)
  const supabase = supabaseServidor()
  const { data: usuario, error: errorUsuario } = await supabase.auth.getUser(token)
  if (errorUsuario || !usuario.user) return error('Tu sesión no es válida. Vuelve a entrar.', 401)

  // 2. ¿De qué hogar eres?
  const { data: miembro } = await supabase
    .from('miembros')
    .select('hogar_id')
    .eq('user_id', usuario.user.id)
    .maybeSingle()
  if (!miembro) return error('Primero tienes que crear o unirte a un hogar.', 403)

  // 3. Las fotos.
  let cuerpo: { paginas?: unknown }
  try {
    cuerpo = (await request.json()) as { paginas?: unknown }
  } catch {
    return error('No se han recibido las fotos.', 400)
  }
  const paginas = Array.isArray(cuerpo.paginas) ? cuerpo.paginas : []
  if (paginas.length === 0) return error('Añade al menos una foto de la cartilla.', 400)
  if (paginas.length > MAX_PAGINAS) return error(`Como mucho ${MAX_PAGINAS} fotos cada vez.`, 400)
  if (!paginas.every(paginaValida)) return error('Alguna foto no se ha podido leer. Prueba a hacerla otra vez.', 400)

  // 4. Claves de Cloudflare y límite al día por hogar.
  const faltaAlgo = faltaConfigurarLaIA()
  if (faltaAlgo) return faltaAlgo
  const haceUnDia = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error: errorCuenta } = await supabase
    .from('lecturas_cartilla')
    .select('id', { count: 'exact', head: true })
    .eq('hogar_id', miembro.hogar_id)
    .gte('creado_en', haceUnDia)
  if (errorCuenta) return error('No se ha podido comprobar el límite de lecturas.', 500)
  if ((count ?? 0) >= MAX_LECTURAS_AL_DIA) {
    return error(`Ya habéis leído ${MAX_LECTURAS_AL_DIA} cartillas en las últimas 24 horas. Prueba mañana.`, 429)
  }
  // Se apunta antes de llamar a la IA: así cuentan también los intentos fallidos.
  await supabase
    .from('lecturas_cartilla')
    .insert({ hogar_id: miembro.hogar_id, user_id: usuario.user.id, paginas: paginas.length })

  // 5. Se las pasamos a la IA.
  const contenido: ParteDelMensaje[] = []
  paginas.forEach((pagina, i) => {
    contenido.push({ type: 'text', text: `Foto ${i + 1}:` })
    contenido.push({ type: 'image_url', image_url: { url: pagina, detail: 'high' } })
  })
  contenido.push({
    type: 'text',
    text: `Hoy es ${ahoraEnEspana().dia}. Lee estas ${paginas.length} fotos de la cartilla y devuelve sus vacunas y tratamientos. Contesta solo con el JSON.`,
  })
  const respuesta = await preguntarALaIA({
    etiqueta: 'Cartilla',
    instrucciones: INSTRUCCIONES,
    contenido,
    maxTokens: 6000,
    mensajes: {
      largo: 'La cartilla es demasiado larga para leerla de una vez. Prueba con menos fotos.',
      pesado: 'Las fotos pesan demasiado para la IA. Prueba con menos fotos.',
      tiempo: 'La IA ha tardado demasiado. Prueba con menos fotos.',
      negativa: 'La IA no ha querido leer estas fotos. Prueba con otras.',
    },
  })
  if ('error' in respuesta) return respuesta.error

  // En el registro, solo números.
  const resultado = validarResultado(respuesta.datos, paginas.length)
  console.log('Cartilla leída', { paginas: paginas.length, encontrados: resultado.tratamientos.length })
  return Response.json(resultado)
}
