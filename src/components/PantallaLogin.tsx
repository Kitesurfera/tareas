import { useState } from 'react'
import { leerEncargoPendiente } from '../lib/accesos'
import { supabase } from '../lib/supabase'
import { BotonGoogle } from './BotonGoogle'

type Props = {
  errorInicial: string | null
}

// Pantalla para quien todavía no ha entrado.
export function PantallaLogin({ errorInicial }: Props) {
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(errorInicial)

  async function entrarConGoogle() {
    if (!supabase) return
    setCargando(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      // Volvemos a la misma dirección desde la que se entró
      // (la web real o el enlace de prueba de un pull request).
      options: { redirectTo: window.location.origin },
    })
    if (error) {
      setError('No se ha podido abrir Google. Inténtalo de nuevo.')
      setCargando(false)
    }
    // Si no hay error, el navegador ya se está yendo a Google.
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-8 px-5 py-10">
      <header className="text-center">
        <h1 className="text-4xl font-bold text-marca">Tareas</h1>
        <p className="mt-2 text-stone-600">
          {leerEncargoPendiente()
            ? 'Te han dado acceso a unas tareas. Entra con tu cuenta de Google para verlas.'
            : 'Lo que hay que recordar en casa, repartido entre las dos.'}
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <BotonGoogle onClick={entrarConGoogle} cargando={cargando} />
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </main>
  )
}
