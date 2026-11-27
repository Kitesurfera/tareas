// La IA gratuita: Gemma 4 (un modelo abierto de Google) funcionando en
// Cloudflare Workers AI. Gratis hasta 10.000 «neuronas» al día por cuenta;
// si un día se acaban, falla hasta el día siguiente (el plan gratuito de
// Cloudflare no cobra nunca). Cloudflare no usa lo que le mandas para entrenar.
// Para pasar la voz a texto (dictar en el iPhone) se usa Whisper, del mismo
// cupo: ver pasarATexto, al final.
// OJO: se ejecuta en el SERVIDOR (funciones de Vercel), nunca en el móvil.
// Las claves (CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_API_TOKEN) solo existen aquí.

const MODELO = '@cf/google/gemma-4-26b-a4b-it'
// Vercel corta la función a los 60 segundos (vercel.json): esperamos 55.
const ESPERA_MAXIMA_MS = 55_000

export type ParteDelMensaje =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail: 'high' } }

// Lo que contesta Cloudflare (solo lo que usamos).
type RespuestaCloudflare = {
  success?: boolean
  errors?: { code?: number; message?: string }[]
  result?: {
    response?: unknown
    choices?: { message?: { content?: string | null }; finish_reason?: string }[]
    // Whisper (pasar la voz a texto)
    text?: unknown
  }
}

export function respuestaDeError(mensaje: string, status: number): Response {
  return Response.json({ error: mensaje }, { status })
}

// La respuesta de la IA → objeto. Acepta que venga ya como objeto, o como
// texto con el JSON (aunque lo envuelva entre ``` o le añada algo antes).
export function leerJson(respuesta: unknown): unknown {
  if (respuesta && typeof respuesta === 'object') return respuesta
  if (typeof respuesta !== 'string') return null
  const texto = respuesta.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim()
  try {
    return JSON.parse(texto)
  } catch {
    const desde = texto.indexOf('{')
    const hasta = texto.lastIndexOf('}')
    if (desde === -1 || hasta <= desde) return null
    try {
      return JSON.parse(texto.slice(desde, hasta + 1))
    } catch {
      return null
    }
  }
}

// ¿Están las claves de Cloudflare? Si falta algo, el mensaje para la app.
export function faltaConfigurarLaIA(): Response | null {
  const cuenta = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
  const clave = process.env.CLOUDFLARE_API_TOKEN?.trim()
  if (!cuenta || !clave) {
    return respuestaDeError('Falta configurar Cloudflare (CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_API_TOKEN) en Vercel.', 500)
  }
  if (!/^[a-f0-9]{32}$/i.test(cuenta)) {
    return respuestaDeError(
      'CLOUDFLARE_ACCOUNT_ID no tiene el formato correcto (son 32 letras y números). Revísalo en Vercel.',
      500,
    )
  }
  return null
}

type Pregunta = {
  // Para el registro de errores («Cartilla», «Tarea»…). Nunca se apunta lo que se manda.
  etiqueta: string
  instrucciones: string
  contenido: string | ParteDelMensaje[]
  maxTokens: number
  // Mensajes propios para cuando la petición es demasiado grande o larga.
  mensajes?: Mensajes
}

type Mensajes = { largo?: string; pesado?: string; tiempo?: string; negativa?: string }

// Llama a un modelo de Cloudflare y devuelve su «result», o la respuesta de
// error (ya en español) que hay que mandar a la app. En el registro solo se
// apunta el tipo de error, nunca lo que se ha mandado.
async function llamarACloudflare(
  modelo: string,
  cuerpo: unknown,
  etiqueta: string,
  mensajes: Mensajes,
): Promise<{ result: NonNullable<RespuestaCloudflare['result']> } | { error: Response }> {
  const faltaAlgo = faltaConfigurarLaIA()
  if (faltaAlgo) return { error: faltaAlgo }
  const cuenta = process.env.CLOUDFLARE_ACCOUNT_ID!.trim()
  const clave = process.env.CLOUDFLARE_API_TOKEN!.trim()

  let respuesta: Response
  try {
    respuesta = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cuenta}/ai/run/${modelo}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(ESPERA_MAXIMA_MS),
    })
  } catch (e) {
    const tiempo = e instanceof Error && e.name === 'TimeoutError'
    console.error(`${etiqueta}:`, tiempo ? 'la IA tardó demasiado' : 'sin conexión con Cloudflare')
    return {
      error: tiempo
        ? respuestaDeError(mensajes.tiempo ?? 'La IA ha tardado demasiado. Prueba otra vez.', 504)
        : respuestaDeError('No se ha podido conectar con la IA. Prueba otra vez.', 502),
    }
  }

  const datosCloudflare = ((await respuesta.json().catch(() => null)) ?? {}) as RespuestaCloudflare
  if (!respuesta.ok || datosCloudflare.success === false) {
    const codigos = (datosCloudflare.errors ?? []).map((e) => e.code)
    console.error(`${etiqueta}: Cloudflare respondió`, respuesta.status, codigos)
    if (codigos.includes(3036)) {
      return {
        error: respuestaDeError(
          'Hoy se ha acabado el uso gratuito de la IA. Se renueva cada noche (a la 1:00 o las 2:00, hora de España).',
          429,
        ),
      }
    }
    if (codigos.includes(3040) || respuesta.status === 429) {
      return { error: respuestaDeError('La IA está muy ocupada ahora mismo. Prueba en un rato.', 503) }
    }
    if (codigos.includes(3006) || respuesta.status === 413) {
      return { error: respuestaDeError(mensajes.pesado ?? 'Lo que has mandado es demasiado grande para la IA.', 413) }
    }
    if (respuesta.status === 401 || respuesta.status === 403) {
      return {
        error: respuestaDeError(
          'Cloudflare no acepta la clave. Revisa CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID en Vercel.',
          500,
        ),
      }
    }
    return { error: respuestaDeError('La IA no ha respondido bien. Prueba otra vez en un momento.', 502) }
  }
  return { result: datosCloudflare.result ?? {} }
}

// Hace la pregunta y devuelve el JSON que contesta la IA, o la respuesta de
// error (ya en español) que hay que mandar a la app.
export async function preguntarALaIA(pregunta: Pregunta): Promise<{ datos: unknown } | { error: Response }> {
  const { etiqueta, mensajes = {} } = pregunta
  const llamada = await llamarACloudflare(
    MODELO,
    {
      messages: [
        { role: 'system', content: pregunta.instrucciones },
        { role: 'user', content: pregunta.contenido },
      ],
      // Que conteste con JSON. La forma exacta va en las instrucciones (no
      // todos los modelos de Cloudflare garantizan un esquema), y lo que
      // devuelve se comprueba siempre después.
      response_format: { type: 'json_object' },
      // Sin «pensar en voz alta»: gasta menos cupo y la respuesta es solo el JSON.
      chat_template_kwargs: { enable_thinking: false },
      temperature: 0,
      max_completion_tokens: pregunta.maxTokens,
    },
    etiqueta,
    mensajes,
  )
  if ('error' in llamada) return llamada
  const { result } = llamada

  // La respuesta viene como en OpenAI (choices) o, en algunos modelos, en «response».
  const eleccion = result.choices?.[0]
  if (eleccion?.finish_reason === 'length') {
    return { error: respuestaDeError(mensajes.largo ?? 'La respuesta de la IA ha salido demasiado larga. Prueba otra vez.', 422) }
  }
  if (eleccion?.finish_reason === 'content_filter') {
    return { error: respuestaDeError(mensajes.negativa ?? 'La IA no ha querido contestar a esto.', 422) }
  }
  const datos = leerJson(eleccion?.message?.content ?? result.response)
  if (datos === null) {
    console.error(`${etiqueta}: la respuesta no era JSON`)
    return { error: respuestaDeError('La IA ha contestado algo que no se entiende. Prueba otra vez.', 502) }
  }
  return { datos }
}

// Pasar la voz a texto: Whisper (un modelo abierto de OpenAI) en Cloudflare
// Workers AI, del mismo cupo gratuito. Recibe el audio (WAV) en base64 y
// devuelve lo que se ha dicho. Cloudflare no guarda el audio ni lo usa para
// entrenar; nosotros tampoco lo guardamos.
const MODELO_VOZ = '@cf/openai/whisper-large-v3-turbo'

export async function pasarATexto(audioBase64: string, etiqueta: string): Promise<{ texto: string } | { error: Response }> {
  const llamada = await llamarACloudflare(
    MODELO_VOZ,
    {
      audio: audioBase64,
      task: 'transcribe',
      language: 'es',
      // Que se salte los ratos de silencio (así se inventa menos cosas).
      vad_filter: true,
      condition_on_previous_text: false,
    },
    etiqueta,
    { pesado: 'Es demasiado rato de audio. Dilo en dos veces.', tiempo: 'La IA ha tardado demasiado en entenderte. Prueba otra vez.' },
  )
  if ('error' in llamada) return llamada
  const texto = llamada.result.text
  return { texto: typeof texto === 'string' ? texto : '' }
}
