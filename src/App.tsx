import type { Session } from '@supabase/supabase-js'
import { useEffect, useState, type ReactNode } from 'react'
import { PantallaBienvenida } from './components/PantallaBienvenida'
import { PantallaLogin } from './components/PantallaLogin'
import { TarjetaHogar } from './components/TarjetaHogar'
import { guardarInvitacionDeLaUrl } from './lib/invitacionPendiente'
import { supabase } from './lib/supabase'
import type { Hogar, Yo } from './lib/tipos'

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

// Se ejecuta una sola vez al abrir la app.
guardarInvitacionDeLaUrl()

function primerNombre(sesion: Session): string {
  const datos = sesion.user.user_metadata
  const completo: string = datos.full_name ?? datos.name ?? ''
  return completo.split(' ')[0]
}

// Busca a qué hogar perteneces. Gracias a RLS, solo puede devolver tu fila.
async function buscarMiHogar(userId: string): Promise<Yo | null | 'error'> {
  if (!supabase) return 'error'
  const { data, error } = await supabase
    .from('miembros')
    .select('nombre_visible, hogares(id, nombre)')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return 'error'
  if (!data) return null
  const fila = data as unknown as { nombre_visible: string; hogares: Hogar }
  return { userId, nombre: fila.nombre_visible, hogar: fila.hogares }
}

function Mensaje({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 px-5 text-center text-stone-500">
      {children}
    </main>
  )
}

function App() {
  // undefined = todavía comprobando si hay sesión; null = no has entrado.
  const [sesion, setSesion] = useState<Session | null | undefined>(undefined)
  const [errorLogin] = useState(leerErrorDeLogin)
  // Tu hogar, guardado junto a tu id de usuaria: si cambia la cuenta,
  // nunca se enseñan por error los datos de la cuenta anterior.
  const [cargado, setCargado] = useState<{ userId: string; yo: Yo | null } | null>(null)
  const [errorCarga, setErrorCarga] = useState(false)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))
    // Avisa cada vez que alguien entra o sale.
    const { data } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      setSesion(nuevaSesion)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = sesion?.user.id

  // Cada vez que cambia la cuenta (o pulsas reintentar), busca tu hogar.
  const [intento, setIntento] = useState(0)
  useEffect(() => {
    if (!userId) return
    let vigente = true
    buscarMiHogar(userId).then((resultado) => {
      if (!vigente) return
      setErrorCarga(resultado === 'error')
      if (resultado !== 'error') setCargado({ userId, yo: resultado })
    })
    return () => {
      vigente = false
    }
  }, [userId, intento])

  function recargar() {
    setCargado(null)
    setErrorCarga(false)
    setIntento((n) => n + 1)
  }

  // undefined = cargando; null = aún no tiene hogar.
  const yo = cargado && cargado.userId === userId ? cargado.yo : undefined

  const salir = () => supabase?.auth.signOut()

  if (!supabase) {
    return (
      <Mensaje>
        <p className="rounded-2xl bg-amber-50 p-5 text-amber-900">
          Falta configurar Supabase: añade <code>VITE_SUPABASE_URL</code> y{' '}
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> en Vercel y vuelve a
          desplegar.
        </p>
      </Mensaje>
    )
  }

  if (sesion === undefined) return <Mensaje>Cargando…</Mensaje>

  if (sesion === null) return <PantallaLogin errorInicial={errorLogin} />

  if (errorCarga) {
    return (
      <Mensaje>
        <p>No se ha podido cargar tu hogar. Comprueba tu conexión.</p>
        <button
          type="button"
          onClick={recargar}
          className="rounded-full bg-marca px-5 py-2 font-semibold text-white"
        >
          Reintentar
        </button>
      </Mensaje>
    )
  }

  if (yo === undefined) return <Mensaje>Cargando…</Mensaje>

  if (yo === null) {
    return (
      <PantallaBienvenida
        nombreSugerido={primerNombre(sesion)}
        onListo={recargar}
        onSalir={salir}
      />
    )
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-6 px-5 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-marca">Tareas</h1>
          <p className="mt-1 text-stone-600">Hola, {yo.nombre} 👋</p>
        </div>
        <button
          type="button"
          onClick={salir}
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

      <TarjetaHogar hogar={yo.hogar} miUserId={yo.userId} />

      <footer className="mt-auto text-center text-xs text-stone-400">
        Fase 1 en construcción
      </footer>
    </main>
  )
}

export default App
