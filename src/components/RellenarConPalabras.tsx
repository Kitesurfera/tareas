import { useState, type KeyboardEvent } from 'react'
import { fechaLarga } from '../lib/fechas'
import { entenderTarea, MAX_LETRAS, type TareaEntendida } from '../lib/tareaNatural'
import { useDictado } from '../lib/useDictado'
import { avisoError, botonPrincipal, botonSecundario, campo } from './estilos'
import { TituloSeccion } from './Piezas'

type Props = {
  // La gente y las mascotas del hogar (null mientras cargan).
  personas: { id: string; nombre: string; yo: boolean }[] | null
  mascotas: { id: string; nombre: string }[] | null
  onEntendida: (tarea: TareaEntendida) => void
}

// «✨ Dímelo con tus palabras»: escribes o dictas la tarea y la IA rellena
// el formulario de abajo. Nada se guarda hasta que pulsas «Crear tarea».
export function RellenarConPalabras({ personas, mascotas, onEntendida }: Props) {
  const [frase, setFrase] = useState('')
  const [antesDeDictar, setAntesDeDictar] = useState('')
  const [entendiendo, setEntendiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<TareaEntendida | null>(null)
  const dictado = useDictado((texto) => setFrase(`${antesDeDictar} ${texto}`.trim().slice(0, MAX_LETRAS)))

  const listo = personas !== null && mascotas !== null
  const puedeRellenar = listo && frase.trim().length >= 3 && !entendiendo

  async function rellenar() {
    if (!puedeRellenar || !personas || !mascotas) return
    if (dictado.escuchando) dictado.parar()
    setEntendiendo(true)
    setError(null)
    setHecho(null)
    try {
      const tarea = await entenderTarea(frase.trim(), personas, mascotas)
      onEntendida(tarea)
      setHecho(tarea)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido entender. Prueba otra vez o rellena la tarea a mano.')
    }
    setEntendiendo(false)
  }

  function alPulsarTecla(evento: KeyboardEvent<HTMLTextAreaElement>) {
    // «Intro» rellena; «Mayúsculas + Intro» hace un salto de línea.
    if (evento.key === 'Enter' && !evento.shiftKey) {
      evento.preventDefault()
      void rellenar()
    }
  }

  return (
    <section className="tarjeta flex flex-col gap-3 ring-2 ring-tareas">
      <TituloSeccion
        dibujo="✨"
        titulo="Dímelo con tus palabras"
        subtitulo="Escríbelo o díctalo y relleno el formulario"
        color="tareas"
      />

      <textarea
        className={`${campo} min-h-20`}
        value={frase}
        onChange={(e) => {
          setFrase(e.target.value)
          setHecho(null)
        }}
        onKeyDown={alPulsarTecla}
        enterKeyHint="go"
        maxLength={MAX_LETRAS}
        aria-label="La tarea con tus palabras"
        placeholder="Por ejemplo: hay que renovar el seguro de la furgo en marzo"
      />

      <div className="flex gap-2">
        {dictado.soportado && (
          <button
            type="button"
            onClick={() => {
              if (dictado.escuchando) return dictado.parar()
              setAntesDeDictar(frase)
              setHecho(null)
              dictado.empezar()
            }}
            aria-pressed={dictado.escuchando}
            // (Sin «w-full» del botón secundario: este va a su tamaño, al lado de «Rellenar».)
            className={`${botonSecundario.replace('w-full ', '')} shrink-0 px-4 ${dictado.escuchando ? 'animate-pulse bg-coral-suave text-coral-tinta ring-coral/30' : ''}`}
          >
            {dictado.escuchando ? '⏹️ Parar' : '🎤 Dictar'}
          </button>
        )}
        <button type="button" onClick={rellenar} disabled={!puedeRellenar} className={`${botonPrincipal} flex-1`}>
          {entendiendo ? 'Pensando…' : '✨ Rellenar'}
        </button>
      </div>

      {dictado.escuchando && (
        <p role="status" className="text-sm font-medium text-coral-tinta">
          🎙️ {dictado.abriendo ? 'Abriendo el micrófono…' : 'Te escucho… habla y, al callarte, se para solo.'}
        </p>
      )}
      {dictado.error && <p role="alert" className={avisoError}>{dictado.error}</p>}
      {error && <p role="alert" className={avisoError}>{error}</p>}

      {hecho && (
        <div role="status" className="rounded-xl bg-marca-suave p-3 text-sm text-marca">
          <p className="font-semibold">✅ Rellenado. Revísalo abajo y pulsa «Crear tarea».</p>
          {hecho.fecha && (
            <p className="mt-1 text-stone-700">
              📅 {hecho.cuando ? `«${hecho.cuando}» → ` : ''}
              {fechaLarga(hecho.fecha)}
            </p>
          )}
          {hecho.cuando && !hecho.fecha && (
            <p className="mt-1 text-stone-700">📅 No he sabido poner fecha a «{hecho.cuando}»: elígela tú.</p>
          )}
        </div>
      )}
      {hecho?.aviso && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">ℹ️ {hecho.aviso}</p>}

      <p className="text-xs text-stone-500">
        {dictado.soportado ? 'También puedes dictar con el micrófono del teclado. ' : 'Para dictar, usa el micrófono 🎤 del teclado del móvil. '}
        🔒 Lo lee una IA gratuita (Gemma, en Cloudflare) con los nombres del hogar y de las mascotas, para
        entender «que lo haga Bea»; no se guarda.
      </p>
    </section>
  )
}
