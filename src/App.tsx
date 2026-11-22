import type { Session } from '@supabase/supabase-js'
import { useEffect, useState, type ReactNode } from 'react'
import {
  PantallaEditarMascota,
  PantallaNuevaMascota,
} from './components/FormularioMascota'
import { PantallaBienvenida } from './components/PantallaBienvenida'
import { PantallaFichaMascota } from './components/PantallaFichaMascota'
import {
  PantallaEditarTratamiento,
  PantallaNuevoTratamiento,
} from './components/FormularioTratamiento'
import { PantallaLogin } from './components/PantallaLogin'
import { TarjetaMascotas } from './components/TarjetaMascotas'
import { TarjetaProximo } from './components/TarjetaProximo'
import { TarjetaInstalar } from './components/TarjetaInstalar'
import { TarjetaCargaMental } from './components/TarjetaCargaMental'
import { PantallaCargaMental } from './components/PantallaCargaMental'
import { PantallaAjustes } from './components/PantallaAjustes'
import { FormularioViaje, PantallaViajes } from './components/PantallaViajes'
import { TarjetaViaje } from './components/TarjetaViaje'
import { ConPestanas } from './components/BarraPestanas'
import { PantallaVencimientos } from './components/PantallaVencimientos'
import {
  PantallaEditarVencimiento,
  PantallaNuevoVencimiento,
} from './components/FormularioVencimiento'
import { PantallaCasa } from './components/PantallaCasa'
import { PantallaEditarRutina, PantallaNuevaRutina } from './components/FormularioRutina'
import { PantallaTareas } from './components/PantallaTareas'
import { PantallaEditarTarea, PantallaNuevaTarea } from './components/FormularioTarea'
import { guardarInvitacionDeLaUrl } from './lib/invitacionPendiente'
import { ir, reemplazar, useRuta } from './lib/ruta'
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
  const ruta = useRuta()

  // Al cambiar de pantalla, empezamos arriba del todo.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [ruta])
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

  // Vuelve a leer tu nombre y el del hogar sin enseñar «Cargando…».
  function refrescar() {
    setIntento((n) => n + 1)
  }

  // Al salir del hogar, de vuelta a la bienvenida.
  function despuesDeSalirDelHogar() {
    reemplazar('/')
    recargar()
  }

  // undefined = cargando; null = aún no tiene hogar.
  const yo = cargado && cargado.userId === userId ? cargado.yo : undefined

  // Cierra la sesión solo en este dispositivo (no en los demás).
  const salir = () => supabase?.auth.signOut({ scope: 'local' })

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

  // Pantallas según la dirección (lo que va detrás de «#»):
  //   #/mascotas/nueva                     → añadir mascota
  //   #/mascotas/<id>                      → ficha
  //   #/mascotas/<id>/editar               → editar mascota
  //   #/mascotas/<id>/tratamientos/nuevo   → añadir tratamiento
  //   #/tratamientos/<id>/editar           → editar tratamiento
  //   #/tareas                             → lista de tareas
  //   #/tareas/nueva                       → nueva tarea
  //   #/tareas/<id>/editar                 → editar tarea
  //   #/casa                               → rutinas y lista de la compra
  //   #/casa/rutinas/nueva                 → nueva rutina
  //   #/casa/rutinas/<id>/editar           → editar rutina
  //   #/vencimientos                       → seguros y suscripciones
  //   #/vencimientos/nuevo/<seguro|suscripcion>
  //   #/vencimientos/<id>/editar
  //   #/viajes                             → modo viaje
  //   #/viajes/nuevo · #/viajes/<grupo>/editar
  const partes = ruta.split('/').filter(Boolean)
  const comun = { hogarId: yo.hogar.id, miUserId: yo.userId }
  if (partes[0] === 'mascotas' && partes[1] === 'nueva') {
    return <PantallaNuevaMascota hogarId={yo.hogar.id} />
  }
  if (partes[0] === 'mascotas' && partes[1] && partes[2] === 'tratamientos' && partes[3] === 'nuevo') {
    return <PantallaNuevoTratamiento key={partes[1]} mascotaId={partes[1]} {...comun} />
  }
  if (partes[0] === 'mascotas' && partes[1] && partes[2] === 'editar') {
    return <PantallaEditarMascota key={partes[1]} id={partes[1]} hogarId={yo.hogar.id} />
  }
  if (partes[0] === 'mascotas' && partes[1] && !partes[2]) {
    return <PantallaFichaMascota key={partes[1]} id={partes[1]} miUserId={yo.userId} />
  }
  if (partes[0] === 'tratamientos' && partes[1] && partes[2] === 'editar') {
    return <PantallaEditarTratamiento key={partes[1]} id={partes[1]} {...comun} />
  }
  if (partes[0] === 'ajustes') {
    return (
      <PantallaAjustes
        yo={yo}
        email={sesion.user.email ?? null}
        onCambio={refrescar}
        onSalirDelHogar={despuesDeSalirDelHogar}
        onCerrarSesion={salir}
      />
    )
  }
  if (partes[0] === 'viajes' && !partes[1]) {
    return <PantallaViajes miUserId={yo.userId} />
  }
  if (partes[0] === 'viajes' && partes[1] === 'nuevo') {
    return <FormularioViaje miUserId={yo.userId} />
  }
  if (partes[0] === 'viajes' && partes[1] && partes[2] === 'editar') {
    return <FormularioViaje key={partes[1]} miUserId={yo.userId} grupo={partes[1]} />
  }
  if (partes[0] === 'carga') {
    return <PantallaCargaMental />
  }
  if (partes[0] === 'tareas' && !partes[1]) {
    return (
      <ConPestanas actual="tareas">
        <PantallaTareas miUserId={yo.userId} />
      </ConPestanas>
    )
  }
  if (partes[0] === 'casa' && !partes[1]) {
    return (
      <ConPestanas actual="casa">
        <PantallaCasa {...comun} />
      </ConPestanas>
    )
  }
  if (partes[0] === 'casa' && partes[1] === 'rutinas' && partes[2] === 'nueva') {
    return <PantallaNuevaRutina {...comun} />
  }
  if (partes[0] === 'casa' && partes[1] === 'rutinas' && partes[2] && partes[3] === 'editar') {
    return <PantallaEditarRutina key={partes[2]} id={partes[2]} {...comun} />
  }
  if (partes[0] === 'vencimientos' && !partes[1]) {
    return (
      <ConPestanas actual="vencimientos">
        <PantallaVencimientos miUserId={yo.userId} />
      </ConPestanas>
    )
  }
  if (partes[0] === 'vencimientos' && partes[1] === 'nuevo' && (partes[2] === 'seguro' || partes[2] === 'suscripcion')) {
    return <PantallaNuevoVencimiento key={partes[2]} tipo={partes[2]} {...comun} />
  }
  if (partes[0] === 'vencimientos' && partes[1] && partes[2] === 'editar') {
    return <PantallaEditarVencimiento key={partes[1]} id={partes[1]} {...comun} />
  }
  if (partes[0] === 'tareas' && partes[1] === 'nueva') {
    return <PantallaNuevaTarea {...comun} />
  }
  if (partes[0] === 'tareas' && partes[1] && partes[2] === 'editar') {
    return <PantallaEditarTarea key={partes[1]} id={partes[1]} {...comun} />
  }

  return (
    <ConPestanas actual="inicio">
      <main className="mx-auto flex min-h-svh max-w-md flex-col gap-6 px-5 py-10">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-marca">Tareas</h1>
            <p className="mt-1 text-stone-600">Hola, {yo.nombre} 👋</p>
          </div>
          <button
            type="button"
            onClick={() => ir('/ajustes')}
            aria-label="Ajustes"
            title="Ajustes"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl shadow-sm ring-1 ring-stone-200 active:scale-95"
          >
            <span aria-hidden="true">⚙️</span>
          </button>
        </header>

        <TarjetaInstalar />

        <TarjetaViaje miUserId={yo.userId} />

        <TarjetaProximo miUserId={yo.userId} />

        <TarjetaCargaMental />

        <TarjetaMascotas />

        <footer className="mt-auto text-center text-xs text-stone-400">
          Tareas · Fase 2
        </footer>
      </main>
    </ConPestanas>
  )
}

export default App
