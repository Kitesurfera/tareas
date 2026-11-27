import { supabase } from './supabase'

// Dictar grabando. En el iPhone, el dictado del propio navegador deja de
// funcionar a partir de la segunda vez (un fallo de Apple, aún sin
// arreglar: el micrófono se abre pero no llega nada). Así que allí la app
// graba lo que dices, nota sola cuándo te callas y se lo manda al servidor
// (api/transcribir), que lo pasa a texto con la IA gratuita.
// El audio no se guarda en ningún sitio: ni en el móvil ni en el servidor.

// ¿Se puede grabar en este navegador?
export function sePuedeGrabar(): boolean {
  const w = window as unknown as { AudioContext?: unknown; webkitAudioContext?: unknown }
  return typeof navigator.mediaDevices?.getUserMedia === 'function' && Boolean(w.AudioContext ?? w.webkitAudioContext)
}

// iPhone, iPad y Safari (en el iPhone todos los navegadores son Safari por dentro).
export function esApple(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.vendor ?? '').startsWith('Apple')
}

// Cuánto (en segundos de audio) antes de decidir por nuestra cuenta.
export const TIEMPOS = {
  calibrar: 0.3, // al principio, para saber cuánto ruido hay
  silencio: 1.3, // callada después de hablar: se da por terminado
  primeraPalabra: 8, // sin oír nada: «no te he oído»
  maximo: 45, // como mucho, de una vez
  antes: 0.4, // lo que se guarda de antes de empezar a hablar
  despues: 0.35, // y de después
}
// Si el micrófono no da sonido en este rato (segundos de reloj), algo va mal.
const SIN_SONIDO_MS = 5000
const MUESTRAS_WAV = 16000

export type FinDeGrabacion =
  | { wav: Blob; segundos: number }
  | { nada: true; porTiempo: boolean } // no se ha oído a nadie hablar
  | { error: string }

type Avisos = {
  alArrancar: () => void
  // 0 (silencio) a 1 (hablando fuerte), para enseñar que te oye.
  alOir: (nivel: number) => void
  alTerminar: (fin: FinDeGrabacion) => void
}

export type Grabacion = { parar: () => void; cancelar: () => void }

function mensajeDeError(e: unknown): string {
  const nombre = e instanceof Error ? e.name : ''
  if (nombre === 'NotAllowedError' || nombre === 'SecurityError')
    return 'No hay permiso para usar el micrófono. Dalo en Ajustes del iPhone → Safari → Micrófono (o en el navegador), o usa el micrófono del teclado.'
  if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') return 'No encuentro el micrófono.'
  if (nombre === 'NotReadableError') return 'Otra app está usando el micrófono. Ciérrala y prueba otra vez.'
  return 'No se ha podido usar el micrófono. Prueba otra vez.'
}

// Empieza a grabar. Hay que llamarla justo al tocar un botón (si no, el
// iPhone no deja usar el sonido).
export function grabar(avisos: Avisos): Grabacion {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
  const Clase = (w.AudioContext ?? w.webkitAudioContext)!
  let ctx: AudioContext
  try {
    ctx = new Clase()
  } catch {
    queueMicrotask(() => avisos.alTerminar({ error: 'No se ha podido usar el micrófono. Prueba otra vez.' }))
    return { parar: () => {}, cancelar: () => {} }
  }
  void ctx.resume().catch(() => {})

  let terminado = false
  let flujo: MediaStream | null = null
  let fuente: MediaStreamAudioSourceNode | null = null
  let procesador: ScriptProcessorNode | null = null
  let vigilante: ReturnType<typeof setTimeout> | null = null
  const trozos: Float32Array[] = []
  let muestras = 0
  let arrancado = false
  // Para notar cuándo hablas: el ruido de fondo y desde cuándo hay voz.
  let ruido = 0
  let medidasRuido = 0
  let seguidos = 0
  let inicioVoz = -1
  let ultimaVoz = -1

  function soltar() {
    if (vigilante) clearTimeout(vigilante)
    if (procesador) procesador.onaudioprocess = null
    procesador?.disconnect()
    fuente?.disconnect()
    // Apagar el micrófono de verdad (se va el punto naranja del iPhone).
    flujo?.getTracks().forEach((pista) => pista.stop())
    void ctx.close().catch(() => {})
  }

  function acabar(fin: FinDeGrabacion | null) {
    if (terminado) return
    terminado = true
    soltar()
    if (fin) avisos.alTerminar(fin)
  }

  function acabarConLoDicho() {
    if (inicioVoz < 0) return acabar({ nada: true, porTiempo: false })
    const sr = ctx.sampleRate
    const desde = Math.max(0, inicioVoz - Math.round(TIEMPOS.antes * sr))
    const hasta = Math.min(muestras, ultimaVoz + Math.round(TIEMPOS.despues * sr))
    const audio = juntar(trozos, desde, hasta)
    acabar({ wav: aWav(bajarA(audio, sr, MUESTRAS_WAV), MUESTRAS_WAV), segundos: audio.length / sr })
  }

  function escuchar(d: Float32Array) {
    if (terminado) return
    if (!arrancado) {
      arrancado = true
      if (vigilante) clearTimeout(vigilante)
      avisos.alArrancar()
    }
    trozos.push(new Float32Array(d))
    const sr = ctx.sampleRate
    let suma = 0
    for (let i = 0; i < d.length; i++) suma += d[i] * d[i]
    const nivel = Math.sqrt(suma / d.length)
    const segundo = muestras / sr
    muestras += d.length

    if (segundo < TIEMPOS.calibrar) {
      ruido = (ruido * medidasRuido + nivel) / ++medidasRuido
      return avisos.alOir(0)
    }
    const umbral = Math.min(0.06, Math.max(0.012, Math.min(ruido, 0.03) * 3))
    if (nivel > umbral) {
      // Voz de verdad: unos trozos seguidos por encima del ruido.
      if (++seguidos >= 3) {
        if (inicioVoz < 0) inicioVoz = Math.max(0, muestras - seguidos * d.length)
        ultimaVoz = muestras
      }
    } else seguidos = 0
    avisos.alOir(Math.min(1, nivel / (umbral * 5)))

    const ahora = muestras / sr
    if (inicioVoz >= 0 && ahora - ultimaVoz / sr > TIEMPOS.silencio) return acabarConLoDicho()
    if (inicioVoz < 0 && ahora > TIEMPOS.primeraPalabra) return acabar({ nada: true, porTiempo: true })
    if (ahora > TIEMPOS.maximo) return acabarConLoDicho()
  }

  navigator.mediaDevices
    .getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    .then((f) => {
      if (terminado) return f.getTracks().forEach((pista) => pista.stop())
      flujo = f
      fuente = ctx.createMediaStreamSource(f)
      procesador = ctx.createScriptProcessor(2048, 1, 1)
      procesador.onaudioprocess = (e) => escuchar(e.inputBuffer.getChannelData(0))
      fuente.connect(procesador)
      // (Sin esto, el iPhone no manda el sonido al procesador. No suena nada:
      // el procesador no escribe en su salida.)
      procesador.connect(ctx.destination)
      if (ctx.state !== 'running') void ctx.resume().catch(() => {})
      // Si no llega sonido (el iPhone a veces deja el audio parado), se avisa.
      vigilante = setTimeout(() => {
        if (!arrancado) acabar({ error: 'El micrófono no ha arrancado. Pulsa 🎤 otra vez; si sigue sin ir, cierra la app del todo y vuelve a abrirla.' })
      }, SIN_SONIDO_MS)
    })
    .catch((e) => acabar({ error: mensajeDeError(e) }))

  return {
    // «⏹️ Parar»: lo dicho hasta ahora se pasa a texto.
    parar: () => {
      if (!terminado) acabarConLoDicho()
    },
    // Salir de la pantalla: se apaga el micrófono y no se hace nada más.
    cancelar: () => acabar(null),
  }
}

function juntar(trozos: Float32Array[], desde: number, hasta: number): Float32Array {
  const audio = new Float32Array(Math.max(0, hasta - desde))
  let pos = 0
  for (const t of trozos) {
    const ini = Math.max(desde - pos, 0)
    const fin = Math.min(hasta - pos, t.length)
    if (fin > ini) audio.set(t.subarray(ini, fin), pos + ini - desde)
    pos += t.length
    if (pos >= hasta) break
  }
  return audio
}

// De 48.000 (o 44.100) muestras por segundo a 16.000: menos que mandar, y
// de sobra para entender la voz.
export function bajarA(audio: Float32Array, de: number, a: number): Float32Array {
  if (de === a) return audio
  const paso = de / a
  const salida = new Float32Array(Math.floor(audio.length / paso))
  for (let i = 0; i < salida.length; i++) {
    const ini = Math.floor(i * paso)
    const fin = Math.min(audio.length, Math.max(ini + 1, Math.floor((i + 1) * paso)))
    let suma = 0
    for (let j = ini; j < fin; j++) suma += audio[j]
    salida[i] = suma / (fin - ini)
  }
  return salida
}

// WAV de toda la vida: PCM de 16 bits, un canal.
export function aWav(audio: Float32Array, muestrasPorSegundo: number): Blob {
  const datos = audio.length * 2
  const b = new DataView(new ArrayBuffer(44 + datos))
  const texto = (pos: number, t: string) => [...t].forEach((c, i) => b.setUint8(pos + i, c.charCodeAt(0)))
  texto(0, 'RIFF')
  b.setUint32(4, 36 + datos, true)
  texto(8, 'WAVE')
  texto(12, 'fmt ')
  b.setUint32(16, 16, true)
  b.setUint16(20, 1, true)
  b.setUint16(22, 1, true)
  b.setUint32(24, muestrasPorSegundo, true)
  b.setUint32(28, muestrasPorSegundo * 2, true)
  b.setUint16(32, 2, true)
  b.setUint16(34, 16, true)
  texto(36, 'data')
  b.setUint32(40, datos, true)
  for (let i = 0; i < audio.length; i++) {
    const m = Math.max(-1, Math.min(1, audio[i]))
    b.setInt16(44 + i * 2, m < 0 ? m * 0x8000 : m * 0x7fff, true)
  }
  return new Blob([b.buffer], { type: 'audio/wav' })
}

// Se lo manda al servidor y devuelve lo que has dicho (puede ser '').
export async function pasarATexto(wav: Blob): Promise<string> {
  if (!supabase) throw new Error('Sin conexión.')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Tienes que entrar con tu cuenta.')
  let respuesta: Response
  try {
    respuesta = await fetch('/api/transcribir', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'audio/wav' },
      body: wav,
    })
  } catch {
    throw new Error('Para dictar hace falta conexión a internet.')
  }
  const cuerpo = (await respuesta.json().catch(() => null)) as { texto?: string; error?: string } | null
  if (!respuesta.ok || typeof cuerpo?.texto !== 'string') throw new Error(cuerpo?.error ?? 'No se ha podido pasar a texto. Prueba otra vez.')
  return cuerpo.texto
}
