import { useEffect, useRef, useState } from 'react'
import { esApple, grabar, pasarATexto, sePuedeGrabar, type Grabacion } from './grabarVoz'

// Dictar con la voz usando el reconocimiento del propio navegador (Chrome
// en Android, Safari en iPhone…). No instala nada: si el navegador no lo
// tiene, el botón no sale y siempre queda el micrófono del teclado del móvil.
// Ojo: el navegador manda el audio a su servicio (Google o Apple) para
// pasarlo a texto; la app nunca recibe ni guarda el audio.
//
// Los móviles fallan a veces sin avisar: el micrófono no llega a arrancar, o
// se queda escuchando para siempre aunque te hayas callado. Por eso la app
// vigila con relojes y, si el navegador no dice nada, lo corta ella y deja
// volver a intentarlo.
//
// En el iPhone (y en Safari) el dictado del navegador deja de funcionar a
// partir de la segunda vez, así que allí se usa otro motor: la app graba y
// el servidor lo pasa a texto con la IA gratuita (src/lib/grabarVoz.ts).
// También se usa si el navegador no sabe dictar (Firefox).

type Resultado = { isFinal: boolean; 0: { transcript: string } }
type EventoResultado = { results: ArrayLike<Resultado> }
type Reconocedor = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onstart: (() => void) | null
  onaudiostart: (() => void) | null
  onresult: ((e: EventoResultado) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
type ClaseReconocedor = new () => Reconocedor

function claseDelNavegador(): ClaseReconocedor | undefined {
  const w = window as unknown as { SpeechRecognition?: ClaseReconocedor; webkitSpeechRecognition?: ClaseReconocedor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

const MENSAJES: Record<string, string> = {
  'not-allowed': 'No hay permiso para usar el micrófono. Puedes darlo en el navegador o usar el micrófono del teclado.',
  'service-not-allowed': 'Este navegador no deja dictar aquí. Usa el micrófono del teclado del móvil.',
  'no-speech': 'No te he oído. Pulsa 🎤 y habla cerca del móvil.',
  'audio-capture': 'No encuentro el micrófono.',
  network: 'Para dictar hace falta conexión a internet.',
}
const NO_ARRANCA =
  'El micrófono no ha arrancado. Pulsa 🎤 otra vez; si sigue sin ir, cierra la app del todo y vuelve a abrirla, o usa el micrófono del teclado.'

// Cuánto se espera (en milisegundos) antes de cortar por nuestra cuenta.
export const ESPERAS = {
  arranque: 8000, // a que el micrófono arranque
  primeraPalabra: 10000, // a oír algo, ya con el micrófono abierto
  silencio: 2500, // callada después de hablar: se da por terminado
  parada: 1500, // a que el navegador confirme que ha parado
}

function sinFallar(hacer: () => void) {
  try {
    hacer()
  } catch {
    // El navegador ya lo había parado: da igual.
  }
}

// ¿Está el móvil preguntando aún si deja usar el micrófono? (Entonces no se
// corta: la primera vez se tarda en contestar.)
async function permisoPorContestar(): Promise<boolean> {
  try {
    const estado = await navigator.permissions?.query({ name: 'microphone' as PermissionName })
    return estado?.state === 'prompt'
  } catch {
    return false
  }
}

type Motor = 'navegador' | 'grabar' | null
function elegirMotor(): Motor {
  if (sePuedeGrabar() && (esApple() || !claseDelNavegador())) return 'grabar'
  return claseDelNavegador() ? 'navegador' : null
}

// Para los botones: «⏹️ Parar» mientras escucha, «✍️ Un momento…» mientras
// lo pasa a texto y, si no, el texto de siempre («🎤 Dictar»).
export function textoBotonDictar(d: { escuchando: boolean; pasando: boolean }, enReposo: string): string {
  if (d.pasando) return '✍️ Un momento…'
  return d.escuchando ? '⏹️ Parar' : enReposo
}

// Solo un dictado a la vez en toda la app: si queda uno a medias (de esta
// pantalla o de otra), se corta antes de empezar el nuevo.
let elDeAhora: { reconocedor: Reconocedor; cerrar: () => void } | null = null

type Sesion = { reconocedor: Reconocedor; reloj: ReturnType<typeof setTimeout> | null; parando: boolean }

// alTexto recibe lo que se va entendiendo.
export function useDictado(alTexto: (texto: string) => void) {
  const [motor] = useState(elegirMotor)
  const soportado = motor !== null
  const [escuchando, setEscuchando] = useState(false)
  // true mientras se espera a que el micrófono arranque de verdad.
  const [abriendo, setAbriendo] = useState(false)
  // Grabando: true mientras el servidor lo pasa a texto; y el volumen (0-4).
  const [pasando, setPasando] = useState(false)
  const [nivel, setNivel] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sesion = useRef<Sesion | null>(null)
  const grabacion = useRef<{ g: Grabacion; vigente: boolean } | null>(null)
  const avisar = useRef(alTexto)
  useEffect(() => {
    avisar.current = alTexto
  }, [alTexto])

  function relojar(s: Sesion, ms: number, alSonar: () => void) {
    if (s.reloj) clearTimeout(s.reloj)
    s.reloj = setTimeout(() => {
      s.reloj = null
      if (sesion.current === s) alSonar()
    }, ms)
  }

  // Deja todo como antes de empezar. Lo que llegue luego de ese reconocedor
  // (pasa en el iPhone) ya no cuenta.
  function terminar(s: Sesion, mensaje?: string) {
    if (sesion.current !== s) return
    if (s.reloj) clearTimeout(s.reloj)
    sesion.current = null
    if (elDeAhora?.reconocedor === s.reconocedor) elDeAhora = null
    setEscuchando(false)
    setAbriendo(false)
    if (mensaje) setError(mensaje)
  }

  function cortar(s: Sesion, mensaje?: string) {
    sinFallar(() => s.reconocedor.abort())
    terminar(s, mensaje)
  }

  // Pide parar y, si el navegador no lo confirma enseguida, lo da por parado.
  function pedirQuePare(s: Sesion, mensaje?: string) {
    if (mensaje) setError(mensaje)
    if (s.parando) return
    s.parando = true
    sinFallar(() => s.reconocedor.stop())
    relojar(s, ESPERAS.parada, () => cortar(s))
  }

  // Si se sale de la pantalla mientras escucha, se corta.
  useEffect(
    () => () => {
      if (grabacion.current) {
        grabacion.current.vigente = false
        grabacion.current.g.cancelar()
        grabacion.current = null
      }
      const s = sesion.current
      if (!s) return
      if (s.reloj) clearTimeout(s.reloj)
      sinFallar(() => s.reconocedor.abort())
      if (elDeAhora?.reconocedor === s.reconocedor) elDeAhora = null
      sesion.current = null
    },
    [],
  )

  // Grabando (iPhone): la app graba, nota cuándo te callas y el servidor lo
  // pasa a texto. Tiene que empezar justo al tocar el botón.
  function empezarAGrabar() {
    if (grabacion.current || pasando) return
    setError(null)
    setEscuchando(true)
    setAbriendo(true)
    setNivel(0)
    const esta = { g: null as unknown as Grabacion, vigente: true }
    const terminarYa = (mensaje?: string) => {
      if (!esta.vigente) return
      esta.vigente = false
      if (grabacion.current === esta) grabacion.current = null
      setEscuchando(false)
      setAbriendo(false)
      setPasando(false)
      setNivel(null)
      if (mensaje) setError(mensaje)
    }
    esta.g = grabar({
      alArrancar: () => esta.vigente && setAbriendo(false),
      alOir: (n) => esta.vigente && setNivel(Math.round(n * 4)),
      alTerminar: (fin) => {
        if (!esta.vigente) return
        if ('error' in fin) return terminarYa(fin.error)
        if ('nada' in fin) return terminarYa(fin.porTiempo ? MENSAJES['no-speech'] : undefined)
        setPasando(true)
        setNivel(null)
        pasarATexto(fin.wav).then(
          (texto) => {
            if (!esta.vigente) return
            if (texto.trim()) avisar.current(texto.trim())
            terminarYa(texto.trim() ? undefined : 'No te he entendido. Prueba otra vez, o escríbelo.')
          },
          (e: unknown) => terminarYa(e instanceof Error ? e.message : 'No se ha podido pasar a texto. Prueba otra vez.'),
        )
      },
    })
    grabacion.current = esta
  }

  function empezar() {
    if (motor === 'grabar') return empezarAGrabar()
    const Clase = claseDelNavegador()
    if (!Clase) return
    if (elDeAhora) {
      sinFallar(() => elDeAhora?.reconocedor.abort())
      elDeAhora.cerrar()
    }
    setError(null)

    let r: Reconocedor
    try {
      r = new Clase()
    } catch {
      setError('No se ha podido empezar a dictar. Prueba otra vez.')
      return
    }
    const s: Sesion = { reconocedor: r, reloj: null, parando: false }
    const vigente = () => sesion.current === s
    let arrancado = false
    let oido = false

    r.lang = 'es-ES'
    r.interimResults = true // ir enseñando lo que entiende mientras hablas
    r.continuous = false // para solo al callarte
    const alArrancar = () => {
      if (!vigente() || arrancado) return
      arrancado = true
      setAbriendo(false)
      if (!oido) relojar(s, ESPERAS.primeraPalabra, () => pedirQuePare(s, MENSAJES['no-speech']))
    }
    r.onstart = alArrancar
    r.onaudiostart = alArrancar
    r.onresult = (e) => {
      if (!vigente()) return
      oido = true
      if (!arrancado) alArrancar()
      const texto = Array.from(e.results)
        .map((resultado) => resultado[0].transcript)
        .join(' ')
      avisar.current(texto)
      // Si el navegador no se para solo al callarte, se para la app.
      if (!s.parando) relojar(s, ESPERAS.silencio, () => pedirQuePare(s))
    }
    r.onerror = (e) => {
      if (!vigente() || e.error === 'aborted') return
      // «No te he oído» después de haber oído algo no es un error.
      if (e.error === 'no-speech' && oido) return
      setError(MENSAJES[e.error] ?? 'No se ha podido dictar. Prueba otra vez.')
    }
    r.onend = () => terminar(s)

    sesion.current = s
    elDeAhora = { reconocedor: r, cerrar: () => terminar(s) }
    try {
      r.start()
    } catch {
      terminar(s, 'No se ha podido empezar a dictar. Prueba otra vez.')
      return
    }
    setEscuchando(true)
    setAbriendo(true)

    // Si el micrófono no arranca (y no es porque el móvil esté preguntando
    // por el permiso), se corta y se puede volver a intentar.
    const vigilarArranque = () =>
      relojar(s, ESPERAS.arranque, () => {
        if (arrancado || oido) return
        void permisoPorContestar().then((preguntando) => {
          if (!vigente() || arrancado || oido) return
          if (preguntando) vigilarArranque()
          else cortar(s, NO_ARRANCA)
        })
      })
    vigilarArranque()
  }

  function parar() {
    if (grabacion.current) return grabacion.current.g.parar()
    const s = sesion.current
    if (s) pedirQuePare(s)
  }

  return { soportado, escuchando, abriendo, pasando, nivel, error, empezar, parar }
}
