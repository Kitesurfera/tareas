import { useState, type FormEvent } from 'react'
import { mensajeDeError } from '../lib/errores'
import {
  borrarInvitacionPendiente,
  leerInvitacionPendiente,
} from '../lib/invitacionPendiente'
import { supabase } from '../lib/supabase'
import { botonPrincipal, campo } from './estilos'

type Props = {
  nombreSugerido: string
  onListo: () => void
  onSalir: () => void
}

type Opcion = 'crear' | 'unirme'

// Primera pantalla después de entrar, para quien aún no tiene hogar:
// o crea uno nuevo, o se une al de su pareja con un código.
export function PantallaBienvenida({ nombreSugerido, onListo, onSalir }: Props) {
  const invitacion = leerInvitacionPendiente()
  const [opcion, setOpcion] = useState<Opcion>(invitacion ? 'unirme' : 'crear')
  const [miNombre, setMiNombre] = useState(nombreSugerido)
  const [nombreHogar, setNombreHogar] = useState('')
  const [codigo, setCodigo] = useState(invitacion)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (!supabase) return
    setEnviando(true)
    setError(null)

    const { error } =
      opcion === 'crear'
        ? await supabase.rpc('crear_hogar', {
            nombre_hogar: nombreHogar,
            mi_nombre: miNombre,
          })
        : await supabase.rpc('unirse_a_hogar', {
            codigo_invitacion: codigo,
            mi_nombre: miNombre,
          })

    if (error) {
      setError(mensajeDeError(error))
      setEnviando(false)
      return
    }
    borrarInvitacionPendiente()
    onListo()
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-6 px-5 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-marca">¡Hola!</h1>
          <p className="mt-1 text-stone-600">
            Para empezar, necesitas un hogar: el espacio que compartes con tu
            pareja o con quien vivas.
          </p>
        </div>
        <button
          type="button"
          onClick={onSalir}
          className="shrink-0 rounded-full px-3 py-1 text-sm text-stone-500 ring-1 ring-stone-300"
        >
          Salir
        </button>
      </header>

      {/* Selector: crear o unirme */}
      <div className="grid grid-cols-2 gap-1 rounded-full bg-stone-200 p-1" role="tablist">
        {(
          [
            ['crear', 'Crear un hogar'],
            ['unirme', 'Tengo un código'],
          ] as const
        ).map(([valor, texto]) => (
          <button
            key={valor}
            type="button"
            role="tab"
            aria-selected={opcion === valor}
            onClick={() => {
              setOpcion(valor)
              setError(null)
            }}
            className={`rounded-full px-3 py-2 text-sm font-medium transition ${
              opcion === valor ? 'bg-white text-marca shadow-sm' : 'text-stone-600'
            }`}
          >
            {texto}
          </button>
        ))}
      </div>

      <form onSubmit={enviar} className="flex flex-col gap-5 rounded-2xl bg-white p-5 shadow-sm">
        {opcion === 'unirme' && invitacion && (
          <p className="rounded-xl bg-marca-suave p-3 text-sm text-marca">
            Te han invitado a un hogar. Revisa tu nombre y pulsa «Unirme».
          </p>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">
            Tu nombre en la app
          </span>
          <input
            className={campo}
            value={miNombre}
            onChange={(e) => setMiNombre(e.target.value)}
            maxLength={40}
            required
            autoComplete="given-name"
          />
          <span className="text-xs text-stone-500">
            Así te verá el resto del hogar.
          </span>
        </label>

        {opcion === 'crear' ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-stone-700">
              Nombre del hogar
            </span>
            <input
              className={campo}
              value={nombreHogar}
              onChange={(e) => setNombreHogar(e.target.value)}
              placeholder="Por ejemplo: Casa"
              maxLength={60}
              required
            />
          </label>
        ) : (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-stone-700">
              Código de invitación
            </span>
            <input
              className={`${campo} text-center font-mono text-xl tracking-[0.3em] uppercase`}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder="ABCD2345"
              maxLength={8}
              minLength={8}
              required
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
            />
            <span className="text-xs text-stone-500">
              Te lo pasa quien ya está en el hogar. Son 8 letras y números.
            </span>
          </label>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <button type="submit" disabled={enviando} className={botonPrincipal}>
          {enviando
            ? 'Un momento…'
            : opcion === 'crear'
              ? 'Crear hogar'
              : 'Unirme'}
        </button>
      </form>
    </main>
  )
}
