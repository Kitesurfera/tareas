// «Leer la cartilla»: recibe fotos de las páginas de la cartilla de la
// mascota (pasaporte europeo), se las pasa a una IA y devuelve las vacunas y
// tratamientos que encuentra, para que la persona los revise en la app.
//
// La IA es Gemma 4 (un modelo abierto de Google) funcionando en Cloudflare
// Workers AI, que es GRATIS hasta 10.000 «neuronas» al día por cuenta (de
// sobra para un hogar). Si un día se acaban, simplemente falla hasta el día
// siguiente: el plan gratuito de Cloudflare no cobra nunca.
//
// - Las fotos NO se guardan en ningún sitio: se mandan a la IA y se olvidan
//   (Cloudflare no usa lo que le mandas para entrenar sus modelos).
// - Solo puede usarlo alguien con sesión y con hogar.
// - Máximo de lecturas al día por hogar, para no gastar el cupo gratuito.
// - Las claves de Cloudflare (CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_API_TOKEN)
//   solo existen aquí, en el servidor.
import { ahoraEnEspana, supabaseServidor } from './_lib/avisos.js'
import { INSTRUCCIONES, leerJson, validarResultado } from './_lib/cartilla.js'

const MODELO = '@cf/google/gemma-4-26b-a4b-it'
const MAX_PAGINAS = 8
const MAX_LECTURAS_AL_DIA = 10
// Una página ya reducida en el móvil pesa unos 300-600 KB.
const MAX_CARACTERES_POR_PAGINA = 2_000_000
// Vercel corta la función a los 60 segundos (vercel.json): esperamos 55.
const ESPERA_MAXIMA_MS = 55_000

function error(mensaje: string, status: number): Response {
  return Response.json({ error: mensaje }, { status })
}

// «data:image/jpeg;base64,AAAA…» (y nada más: ni enlaces ni otros tipos).
function paginaValida(valor: unknown): valor is string {
  return (
    typeof valor === 'string' &&
    valor.length <= MAX_CARACTERES_POR_PAGINA &&
    /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(valor)
  )
}

// Lo que contesta Cloudflare (solo lo que usamos).
type RespuestaCloudflare = {
  success?: boolean
  errors?: { code?: number; message?: string }[]
  result?: {
    response?: unknown
    choices?: { message?: { content?: string | null }; finish_reason?: string }[]
  }
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
  const cuenta = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
  const clave = process.env.CLOUDFLARE_API_TOKEN?.trim()
  if (!cuenta || !clave) {
    return error('Falta configurar Cloudflare (CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_API_TOKEN) en Vercel.', 500)
  }
  if (!/^[a-f0-9]{32}$/i.test(cuenta)) {
    return error('CLOUDFLARE_ACCOUNT_ID no tiene el formato correcto (son 32 letras y números). Revísalo en Vercel.', 500)
  }
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
  const contenido: ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail: 'high' } })[] = []
  paginas.forEach((pagina, i) => {
    contenido.push({ type: 'text', text: `Foto ${i + 1}:` })
    contenido.push({ type: 'image_url', image_url: { url: pagina, detail: 'high' } })
  })
  contenido.push({
    type: 'text',
    text: `Hoy es ${ahoraEnEspana().dia}. Lee estas ${paginas.length} fotos de la cartilla y devuelve sus vacunas y tratamientos. Contesta solo con el JSON.`,
  })

  let respuesta: Response
  try {
    respuesta = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cuenta}/ai/run/${MODELO}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: INSTRUCCIONES },
          { role: 'user', content: contenido },
        ],
        // Que conteste con JSON. La forma exacta va en las instrucciones (no
        // todos los modelos de Cloudflare garantizan un esquema), y lo que
        // devuelve se comprueba igualmente en validarResultado.
        response_format: { type: 'json_object' },
        // Sin «pensar en voz alta»: gasta menos cupo y la respuesta es solo el JSON.
        chat_template_kwargs: { enable_thinking: false },
        temperature: 0,
        max_completion_tokens: 6000,
      }),
      signal: AbortSignal.timeout(ESPERA_MAXIMA_MS),
    })
  } catch (e) {
    // En el registro solo el tipo de error, nunca las fotos ni lo que ponen.
    const tiempo = e instanceof Error && e.name === 'TimeoutError'
    console.error('Cartilla:', tiempo ? 'la IA tardó demasiado' : 'sin conexión con Cloudflare')
    return tiempo
      ? error('La IA ha tardado demasiado. Prueba con menos fotos.', 504)
      : error('No se ha podido conectar con la IA. Prueba otra vez.', 502)
  }

  const datosCloudflare = (await respuesta.json().catch(() => ({}))) as RespuestaCloudflare
  if (!respuesta.ok || datosCloudflare.success === false) {
    const codigos = (datosCloudflare.errors ?? []).map((e) => e.code)
    console.error('Cartilla: Cloudflare respondió', respuesta.status, codigos)
    if (codigos.includes(3036)) {
      return error('Hoy se ha acabado la lectura gratuita. Se renueva cada noche (a la 1:00 o las 2:00, hora de España).', 429)
    }
    if (codigos.includes(3040) || respuesta.status === 429) {
      return error('La IA está muy ocupada ahora mismo. Prueba en un rato.', 503)
    }
    if (codigos.includes(3006) || respuesta.status === 413) {
      return error('Las fotos pesan demasiado para la IA. Prueba con menos fotos.', 413)
    }
    if (respuesta.status === 401 || respuesta.status === 403) {
      return error('Cloudflare no acepta la clave. Revisa CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID en Vercel.', 500)
    }
    return error('La IA no ha respondido bien. Prueba otra vez en un momento.', 502)
  }

  // La respuesta viene como en OpenAI (choices) o, en algunos modelos, en «response».
  const eleccion = datosCloudflare.result?.choices?.[0]
  if (eleccion?.finish_reason === 'length') {
    return error('La cartilla es demasiado larga para leerla de una vez. Prueba con menos fotos.', 422)
  }
  if (eleccion?.finish_reason === 'content_filter') {
    return error('La IA no ha querido leer estas fotos. Prueba con otras.', 422)
  }
  const datos = leerJson(eleccion?.message?.content ?? datosCloudflare.result?.response)
  if (datos === null) {
    console.error('Cartilla: la respuesta no era JSON')
    return error('La IA ha contestado algo que no se entiende. Prueba otra vez.', 502)
  }

  // En el registro, solo números.
  const resultado = validarResultado(datos, paginas.length)
  console.log('Cartilla leída', { paginas: paginas.length, encontrados: resultado.tratamientos.length })
  return Response.json(resultado)
}
