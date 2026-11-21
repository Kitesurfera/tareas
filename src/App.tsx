import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { PantallaLogin } from './components/PantallaLogin'
import { supabase } from './lib/supabase'

const secciones = [
  {
    titulo: 'Mascota',
    texto: 'Vacunas, desparasitaciones, medicación y peso.',
  },
  {
    titulo: 'Casa',
    texto: 'Seguros, ITV, regalos, renovaciones… todo lo que hay que recordar.',
  },
  {
    titulo: 'Reparto',
    texto: 'Cada cosa con una responsable clara.',
  },
]

// Si Google o Supabase devuelven un error al volver del login, viene en la
// dirección. Lo leemos, lo traducimos y limpiamos la dirección.
function leerErrorDeLogin(): string | null {
  const datos = new URLSearchParams(
    window.location.search || window.location.hash.slice(1),
  )
  if (!datos.get('error')) return null
  window.history.replaceState(null, '', window.location.pathname)
  if (datos.get('error') === 'access_denied') {
    return 'Has cancelado el acceso con Google, o tu cuenta todavía no tiene permiso para entrar.'
  }
  return 'No se ha podido entrar con Google. Inténtalo de nuevo.'
}

function App() {
  // undefined = todavía comprobando si hay sesión; null = no has entrado.
  const [sesion, setSesion] = useState<Session | null | undefined>(undefined)
  const [errorLogin] = useState(leerErrorDeLogin)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))
    // Avisa cada vez que alguien entra o sale.
    const { data } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      setSesion(nuevaSesion)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (!supabase) {
    return (
      <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-5">
        <p className="rounded-2xl bg-amber-50 p-5 text-amber-900">
          Falta configurar Supabase: añade <code>VITE_SUPABASE_URL</code> y{' '}
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> en Vercel y vuelve a
          desplegar.
        </p>
      </main>
    )
  }

  if (sesion === undefined) {
    return (
      <main className="flex min-h-svh items-center justify-center text-stone-400">
        Cargando…
      </main>
    )
  }

  if (sesion === null) {
    return <PantallaLogin errorInicial={errorLogin} />
  }

  const datos = sesion.user.user_metadata
  const nombre: string = datos.full_name ?? datos.name ?? sesion.user.email ?? ''

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-6 px-5 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-marca">Tareas</h1>
          <p className="mt-1 text-stone-600">Hola, {nombre.split(' ')[0]} 👋</p>
        </div>
        <button
          type="button"
          onClick={() => supabase?.auth.signOut()}
          className="rounded-full px-3 py-1 text-sm text-stone-500 ring-1 ring-stone-300"
        >
          Salir
        </button>
      </header>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Próximo</h2>
        <p className="mt-2 text-stone-500">
          Todavía no hay nada pendiente. Aquí verás lo que vence en los
          próximos 30 días y quién se encarga.
        </p>
      </section>

      <ul className="flex flex-col gap-3">
        {secciones.map((seccion) => (
          <li key={seccion.titulo} className="rounded-2xl bg-marca-suave p-4">
            <h3 className="font-semibold text-marca">{seccion.titulo}</h3>
            <p className="text-sm text-stone-700">{seccion.texto}</p>
          </li>
        ))}
      </ul>

      <footer className="mt-auto text-center text-xs text-stone-400">
        Fase 1 en construcción
      </footer>
    </main>
  )
}

export default App
