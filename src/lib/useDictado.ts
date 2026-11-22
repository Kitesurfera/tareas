import { useEffect, useRef, useState } from 'react'

// Dictar con la voz usando el reconocimiento del propio navegador (Chrome
// en Android, Safari en iPhone…). No instala nada: si el navegador no lo
// tiene, el botón no sale y siempre queda el micrófono del teclado del móvil.
// Ojo: el navegador manda el audio a su servicio (Google o Apple) para
// pasarlo a texto; la app nunca recibe ni guarda el audio.

type Resultado = { isFinal: boolean; 0: { transcript: string } }
type EventoResultado = { results: ArrayLike<Resultado> }
type Reconocedor = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  abort: () => void
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

// alTexto recibe lo que se va entendiendo (y si ya es definitivo).
export function useDictado(alTexto: (texto: string) => void) {
  const [soportado] = useState(() => Boolean(claseDelNavegador()))
  const [escuchando, setEscuchando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reconocedor = useRef<Reconocedor | null>(null)
  const avisar = useRef(alTexto)
  useEffect(() => {
    avisar.current = alTexto
  }, [alTexto])

  // Si se sale de la pantalla mientras escucha, se corta.
  useEffect(() => () => reconocedor.current?.abort(), [])

  function empezar() {
    const Clase = claseDelNavegador()
    if (!Clase) return
    setError(null)
    const r = new Clase()
    r.lang = 'es-ES'
    r.interimResults = true // ir enseñando lo que entiende mientras hablas
    r.continuous = false // para solo al callarte
    r.onresult = (e) => {
      const texto = Array.from(e.results)
        .map((resultado) => resultado[0].transcript)
        .join(' ')
      avisar.current(texto)
    }
    r.onerror = (e) => {
      if (e.error !== 'aborted') setError(MENSAJES[e.error] ?? 'No se ha podido dictar. Prueba otra vez.')
    }
    r.onend = () => {
      setEscuchando(false)
      reconocedor.current = null
    }
    reconocedor.current = r
    try {
      r.start()
      setEscuchando(true)
    } catch {
      setError('No se ha podido empezar a dictar. Prueba otra vez.')
    }
  }

  function parar() {
    reconocedor.current?.stop()
  }

  return { soportado, escuchando, error, empezar, parar }
}
