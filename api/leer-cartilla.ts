// «Leer la cartilla»: recibe fotos de las páginas de la cartilla de la
// mascota (pasaporte europeo), se las pasa a Claude y devuelve las vacunas y
// tratamientos que encuentra, para que la persona los revise en la app.
//
// - Las fotos NO se guardan en ningún sitio: se mandan a Claude y se olvidan.
// - Solo puede usarlo alguien con sesión y con hogar.
// - Como cada lectura cuesta dinero, hay un máximo de lecturas al día por hogar.
// - La clave de Anthropic (ANTHROPIC_API_KEY) solo existe aquí, en el servidor.
import Anthropic from '@anthropic-ai/sdk'
import { ahoraEnEspana, supabaseServidor } from './_lib/avisos.js'
import { ESQUEMA, INSTRUCCIONES, validarResultado } from './_lib/cartilla.js'

const MODELO = 'claude-opus-5-5'
const MAX_PAGINAS = 8
const MAX_LECTURAS_AL_DIA = 10
// Una página ya reducida en el móvil pesa unos 300-600 KB.
const MAX_CARACTERES_POR_PAGINA = 2_000_000
const TIPOS_DE_IMAGEN = ['image/jpeg', 'image/png', 'image/webp'] as const
type TipoDeImagen = (typeof TIPOS_DE_IMAGEN)[number]

function error(mensaje: string, status: number): Response {
  return Response.json({ error: mensaje }, { status })
}

// «data:image/jpeg;base64,AAAA…» → { tipo, datos }
function leerPagina(valor: unknown): { tipo: TipoDeImagen; datos: string } | null {
  if (typeof valor !== 'string' || valor.length > MAX_CARACTERES_POR_PAGINA) return null
  const partes = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(valor)
  if (!partes) return null
  return { tipo: partes[1] as TipoDeImagen, datos: partes[2] }
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
  const lista = Array.isArray(cuerpo.paginas) ? cuerpo.paginas : []
  if (lista.length === 0) return error('Añade al menos una foto de la cartilla.', 400)
  if (lista.length > MAX_PAGINAS) return error(`Como mucho ${MAX_PAGINAS} fotos cada vez.`, 400)
  const paginas = lista.map(leerPagina)
  if (paginas.some((p) => p === null)) return error('Alguna foto no se ha podido leer. Prueba a hacerla otra vez.', 400)

  // 4. Límite al día por hogar (cada lectura cuesta dinero).
  if (!process.env.ANTHROPIC_API_KEY) {
    return error('Falta configurar la clave de Anthropic (ANTHROPIC_API_KEY) en Vercel.', 500)
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

  // 5. Se las pasamos a Claude.
  const contenido: Anthropic.Beta.BetaContentBlockParam[] = []
  paginas.forEach((pagina, i) => {
    if (!pagina) return
    contenido.push({ type: 'text', text: `Foto ${i + 1}:` })
    contenido.push({ type: 'image', source: { type: 'base64', media_type: pagina.tipo, data: pagina.datos } })
  })
  contenido.push({
    type: 'text',
    text: `Hoy es ${ahoraEnEspana().dia}. Lee estas ${paginas.length} fotos de la cartilla y devuelve sus vacunas y tratamientos.`,
  })

  const cliente = new Anthropic() // lee ANTHROPIC_API_KEY
  let respuesta: Anthropic.Beta.BetaMessage
  try {
    respuesta = await cliente.beta.messages
      .stream({
        model: MODELO,
        max_tokens: 16000,
        // Si la IA se negara a contestar, la API lo reintenta sola con otro modelo.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'high', format: { type: 'json_schema', schema: ESQUEMA } },
        system: INSTRUCCIONES,
        messages: [{ role: 'user', content: contenido }],
      })
      .finalMessage()
  } catch (e) {
    // En el registro solo el tipo de error, nunca las fotos ni lo que ponen.
    if (e instanceof Anthropic.AuthenticationError) {
      console.error('Cartilla: clave de Anthropic no válida')
      return error('La clave de Anthropic no es válida. Revisa ANTHROPIC_API_KEY en Vercel.', 500)
    }
    if (e instanceof Anthropic.RateLimitError) {
      return error('La IA está muy ocupada ahora mismo. Prueba en un rato.', 503)
    }
    if (e instanceof Anthropic.BadRequestError) {
      console.error('Cartilla: petición rechazada', e.status)
      return error('No se han podido leer estas fotos. Si se repite, revisa que tu cuenta de Anthropic tiene saldo.', 502)
    }
    if (e instanceof Anthropic.APIError) {
      console.error('Cartilla: error de la API', e.status)
      return error('La IA no ha respondido bien. Prueba otra vez en un momento.', 502)
    }
    console.error('Cartilla: sin conexión con la IA')
    return error('No se ha podido conectar con la IA. Prueba otra vez.', 502)
  }

  if (respuesta.stop_reason === 'refusal') {
    return error('La IA no ha querido leer estas fotos. Prueba con otras.', 422)
  }
  if (respuesta.stop_reason === 'max_tokens') {
    return error('La cartilla es demasiado larga para leerla de una vez. Prueba con menos fotos.', 422)
  }
  // La respuesta viene en el último bloque de texto (en el formato pedido).
  const textos = respuesta.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
  let datos: unknown
  try {
    datos = JSON.parse(textos[textos.length - 1]?.text ?? '')
  } catch {
    return error('La IA ha contestado algo que no se entiende. Prueba otra vez.', 502)
  }

  // En el registro, solo números.
  const resultado = validarResultado(datos, paginas.length)
  console.log('Cartilla leída', { paginas: paginas.length, encontrados: resultado.tratamientos.length })
  return Response.json(resultado)
}
