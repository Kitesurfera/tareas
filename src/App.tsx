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
import { PantallaSemana } from './components/PantallaSemana'
import { TarjetaCalendario } from './components/TarjetaCalendario'
import { PantallaAjustes } from './components/PantallaAjustes'
import { FormularioViaje, PantallaViajes } from './components/PantallaViajes'
import { TarjetaViaje } from './components/TarjetaViaje'
import { Marco } from './components/BarraPestanas'
import { CabeceraPestana } from './components/CabeceraPestana'
import { PantallaVencimientos } from './components/PantallaVencimientos'
import {
  PantallaEditarVencimiento,
  PantallaNuevoVencimiento,
} from './components/FormularioVencimiento'
import { PantallaCasa } from './components/PantallaCasa'
import { PantallaEditarRutina, PantallaNuevaRutina } from './components/FormularioRutina'
import { PantallaEditarPlanta, PantallaNuevaPlanta } from './components/FormularioPlanta'
import { PantallaEditarCuidado, PantallaNuevoCuidado } from './components/FormularioCuidado'
import { PantallaFichaPlanta } from './components/PantallaFichaPlanta'
import { PantallaTareas } from './components/PantallaTareas'
import { PantallaEditarTarea, PantallaNuevaTarea } from './components/FormularioTarea'
import { PantallaAccesos, FormularioAcceso } from './components/PantallaAccesos'
import { PantallaEncargos } from './components/PantallaEncargos'
import { TarjetaAyuda } from './components/TarjetaAyuda'
import { PantallaLeerCartilla } from './components/PantallaLeerCartilla'
import { PantallaPlanes } from './components/PantallaPlanes'
import { FormularioPlan } from './components/FormularioPlan'
import { PantallaCategoriasPlan } from './components/PantallaCategoriasPlan'
import { PantallaImportarPlanes } from './components/PantallaImportarPlanes'
import { PantallaParaVer } from './components/PantallaParaVer'
import { PantallaAnadirParaVer } from './components/PantallaAnadirParaVer'
import { PantallaSugerenciasVer } from './components/PantallaSugerenciasVer'
import { PantallaRegalos } from './components/PantallaRegalos'
import { PantallaBandeja } from './components/PantallaBandeja'
import { TarjetaHoyNoPuedo } from './components/HoyNoPuedo'
import { PantallaPlantillas } from './components/PantallaPlantillas'
import { PantallaUsarPlantilla } from './components/PantallaUsarPlantilla'
import { PantallaEditarPlantilla } from './components/PantallaEditarPlantilla'
import { PantallaPreparativos } from './components/PantallaPreparativos'
import { botonCabecera } from './components/estilos'
import { TarjetaPlanes } from './components/TarjetaPlanes'
import { PantallaDocumento } from './components/PantallaDocumento'
import { FormularioDocumento } from './components/FormularioDocumento'
import {
  borrarEncargoPendiente,
  guardarEncargoDeLaUrl,
  leerEncargoPendiente,
  type Encargo,
} from './lib/accesos'
import { mensajeDeError } from './lib/errores'
import { guardarInvitacionDeLaUrl } from './lib/invitacionPendiente'
import { saludoDelMomento } from './lib/fechas'
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
guardarEncargoDeLaUrl()

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
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center gap-4 px-5 text-center text-stone-500 lg:max-w-xl">
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

  // Encargos de un acceso temporal que te han dado en otro hogar. Al entrar,
  // si venías de un enlace (…/?encargo=CODIGO), primero lo aceptamos.
  const [encargos, setEncargos] = useState<{ userId: string; lista: Encargo[] } | null>(null)
  const [errorEnlace, setErrorEnlace] = useState<string | null>(null)
  const [quiereCrearHogar, setQuiereCrearHogar] = useState(false)
  const [intentoEncargos, setIntentoEncargos] = useState(0)
  useEffect(() => {
    const cliente = supabase
    if (!userId || !cliente) return
    let vigente = true
    ;(async () => {
      const codigo = leerEncargoPendiente()
      if (codigo) {
        const { error } = await cliente.rpc('aceptar_acceso', { codigo_acceso: codigo })
        borrarEncargoPendiente()
        if (!vigente) return
        setErrorEnlace(error ? mensajeDeError(error) : null)
        if (!error) reemplazar('/encargos')
      }
      const { data } = await cliente.rpc('mis_encargos')
      if (vigente) setEncargos({ userId, lista: (data ?? []) as Encargo[] })
    })()
    return () => {
      vigente = false
    }
  }, [userId, intentoEncargos])
  const misEncargos = encargos && encargos.userId === userId ? encargos.lista : null
  const recargarEncargos = () => setIntentoEncargos((n) => n + 1)

  // Al salir del hogar, de vuelta a la bienvenida.
  function despuesDeSalirDelHogar() {
    reemplazar('/')
    recargar()
  }

  // undefined = cargando; null = aún no tiene hogar.
  const yo = cargado && cargado.userId === userId ? cargado.yo : undefined

  // Cierra la sesión solo en este dispositivo (no en los demás).
  const salir = () => supabase?.auth.signOut({ scope: 'local' })
  // Cierra la sesión en todos tus dispositivos: los demás salen cuando
  // caduca su sesión actual (como mucho, una hora).
  const salirDeTodos = () => supabase?.auth.signOut({ scope: 'global' })

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

  // Sin hogar propio pero con encargos (acceso temporal): solo sus encargos.
  if (yo === null && !quiereCrearHogar) {
    if (misEncargos === null) return <Mensaje>Cargando…</Mensaje>
    if (misEncargos.length > 0 || errorEnlace || ruta.startsWith('/encargos')) {
      return (
        <PantallaEncargos
          encargos={misEncargos}
          errorEnlace={errorEnlace}
          recargar={recargarEncargos}
          soloEncargos
          onCrearHogar={() => {
            setQuiereCrearHogar(true)
            reemplazar('/')
          }}
          onCerrarSesion={salir}
        />
      )
    }
  }

  if (yo === null) {
    return (
      <PantallaBienvenida
        nombreSugerido={primerNombre(sesion)}
        onListo={recargar}
        onSalir={salir}
      />
    )
  }

  // Lo que se ve dentro del marco (menú del ordenador y barra del móvil).
  const contenido: ReactNode = (() => {
    // Pantallas según la dirección (lo que va detrás de «#»):
    //   #/mascotas/nueva                     → añadir mascota
    //   #/mascotas/<id>                      → ficha
    //   #/mascotas/<id>/editar               → editar mascota
    //   #/mascotas/<id>/tratamientos/nuevo   → añadir tratamiento
    //   #/mascotas/<id>/cartilla             → leer la cartilla con fotos
    //   #/tratamientos/<id>/editar           → editar tratamiento
    //   #/tareas                             → lista de tareas
    //   #/tareas/nueva                       → nueva tarea
    //   #/tareas/<id>/editar                 → editar tarea
    //   #/casa                               → rutinas y lista de la compra
    //   #/casa/rutinas/nueva                 → nueva rutina
    //   #/casa/rutinas/<id>/editar           → editar rutina
    //   #/casa/plantas/nueva                 → añadir planta
    //   #/casa/plantas/<id>                  → ficha de la planta
    //   #/casa/plantas/<id>/editar           → editar planta
    //   #/casa/plantas/<id>/cuidados/nuevo   → añadir cuidado
    //   #/cuidados/<id>/editar               → editar cuidado
    //   #/planes                             → generador de planes y calendario
  //   #/planes/nuevo · #/planes/importar · #/planes/<id>/editar · #/planes/categorias
  //   #/ver · #/ver/anadir/<pelicula|serie> · #/ver/sugerencias/<pelicula|serie> → «🍿 Para ver»
  //   #/regalos → «🎁 Regalos» (fechas especiales, listas de deseos e ideas)
  //   #/bandeja → «🧠 Tu bandeja» (Vaciar la cabeza)
  //   #/vencimientos                       → seguros, suscripciones y documentos
  //   #/documentos/nuevo · #/documentos/<id> · #/documentos/<id>/editar
    //   #/vencimientos/nuevo/<seguro|suscripcion>
    //   #/vencimientos/<id>/editar
    //   #/viajes                             → modo viaje
    //   #/accesos · #/accesos/nuevo · #/accesos/<id>/editar → acceso temporal
    //   #/encargos                           → lo que te han encargado en otro hogar
    //   #/viajes/nuevo · #/viajes/<grupo>/editar
    const partes = ruta.split('/').filter(Boolean)
    const comun = { hogarId: yo.hogar.id, miUserId: yo.userId }
    if (partes[0] === 'mascotas' && partes[1] === 'nueva') {
      return <PantallaNuevaMascota hogarId={yo.hogar.id} />
    }
    if (partes[0] === 'mascotas' && partes[1] && partes[2] === 'tratamientos' && partes[3] === 'nuevo') {
      return <PantallaNuevoTratamiento key={partes[1]} mascotaId={partes[1]} {...comun} />
    }
    if (partes[0] === 'mascotas' && partes[1] && partes[2] === 'cartilla') {
      return <PantallaLeerCartilla key={partes[1]} mascotaId={partes[1]} {...comun} />
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
          onCerrarSesionEnTodos={salirDeTodos}
        />
      )
    }
    if (partes[0] === 'accesos' && !partes[1]) {
      return <PantallaAccesos nombreHogar={yo.hogar.nombre} />
    }
    if (partes[0] === 'accesos' && partes[1] === 'nuevo') {
      return <FormularioAcceso hogarId={yo.hogar.id} nombreHogar={yo.hogar.nombre} />
    }
    if (partes[0] === 'accesos' && partes[1] && partes[2] === 'editar') {
      return <FormularioAcceso key={partes[1]} hogarId={yo.hogar.id} nombreHogar={yo.hogar.nombre} id={partes[1]} />
    }
    if (partes[0] === 'encargos') {
      return (
        <PantallaEncargos
          encargos={misEncargos}
          errorEnlace={errorEnlace}
          recargar={recargarEncargos}
          soloEncargos={false}
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
    if (partes[0] === 'semana') {
      return <PantallaSemana miUserId={yo.userId} />
    }
    if (partes[0] === 'tareas' && !partes[1]) {
      return <PantallaTareas miUserId={yo.userId} />
    }
    if (partes[0] === 'casa' && !partes[1]) {
      return <PantallaCasa {...comun} />
    }
    if (partes[0] === 'casa' && partes[1] === 'plantas' && partes[2] === 'nueva') {
      return <PantallaNuevaPlanta {...comun} />
    }
    if (partes[0] === 'casa' && partes[1] === 'plantas' && partes[2] && partes[3] === 'editar') {
      return <PantallaEditarPlanta key={partes[2]} id={partes[2]} {...comun} />
    }
    if (partes[0] === 'casa' && partes[1] === 'plantas' && partes[2] && partes[3] === 'cuidados' && partes[4] === 'nuevo') {
      return <PantallaNuevoCuidado key={partes[2]} plantaId={partes[2]} {...comun} />
    }
    if (partes[0] === 'casa' && partes[1] === 'plantas' && partes[2] && !partes[3]) {
      return <PantallaFichaPlanta key={partes[2]} id={partes[2]} miUserId={yo.userId} />
    }
    if (partes[0] === 'cuidados' && partes[1] && partes[2] === 'editar') {
      return <PantallaEditarCuidado key={partes[1]} id={partes[1]} {...comun} />
    }
    if (partes[0] === 'casa' && partes[1] === 'rutinas' && partes[2] === 'nueva') {
      return <PantallaNuevaRutina {...comun} />
    }
    if (partes[0] === 'casa' && partes[1] === 'rutinas' && partes[2] && partes[3] === 'editar') {
      return <PantallaEditarRutina key={partes[2]} id={partes[2]} {...comun} />
    }
    if (partes[0] === 'planes' && !partes[1]) {
      return <PantallaPlanes hogarId={yo.hogar.id} />
    }
    if (partes[0] === 'planes' && partes[1] === 'nuevo') {
      return <FormularioPlan hogarId={yo.hogar.id} />
    }
    if (partes[0] === 'bandeja' && !partes[1]) {
      return <PantallaBandeja {...comun} />
    }
    if (partes[0] === 'regalos' && !partes[1]) {
      return <PantallaRegalos {...comun} />
    }
    if (partes[0] === 'ver' && !partes[1]) {
      return <PantallaParaVer {...comun} />
    }
    if (partes[0] === 'ver' && partes[1] === 'anadir' && (partes[2] === 'pelicula' || partes[2] === 'serie')) {
      return <PantallaAnadirParaVer key={partes[2]} tipo={partes[2]} {...comun} />
    }
    if (partes[0] === 'ver' && partes[1] === 'sugerencias' && (partes[2] === 'pelicula' || partes[2] === 'serie')) {
      return <PantallaSugerenciasVer key={partes[2]} tipo={partes[2]} {...comun} />
    }
    if (partes[0] === 'planes' && partes[1] === 'importar') {
      return <PantallaImportarPlanes hogarId={yo.hogar.id} />
    }
    if (partes[0] === 'planes' && partes[1] === 'categorias') {
      return <PantallaCategoriasPlan hogarId={yo.hogar.id} />
    }
    if (partes[0] === 'planes' && partes[1] && partes[2] === 'editar') {
      return <FormularioPlan key={partes[1]} hogarId={yo.hogar.id} id={partes[1]} />
    }
    if (partes[0] === 'documentos' && partes[1] === 'nuevo') {
      return <FormularioDocumento {...comun} />
    }
    if (partes[0] === 'documentos' && partes[1] && partes[2] === 'editar') {
      return <FormularioDocumento key={partes[1]} id={partes[1]} {...comun} />
    }
    if (partes[0] === 'documentos' && partes[1] && !partes[2]) {
      return <PantallaDocumento key={partes[1]} id={partes[1]} />
    }
    if (partes[0] === 'vencimientos' && !partes[1]) {
      return <PantallaVencimientos miUserId={yo.userId} />
    }
    if (partes[0] === 'vencimientos' && partes[1] === 'nuevo' && (partes[2] === 'seguro' || partes[2] === 'suscripcion')) {
      return <PantallaNuevoVencimiento key={partes[2]} tipo={partes[2]} {...comun} />
    }
    if (partes[0] === 'vencimientos' && partes[1] && partes[2] === 'editar') {
      return <PantallaEditarVencimiento key={partes[1]} id={partes[1]} {...comun} />
    }
    // 📋 Plantillas: #/plantillas · /nueva · /ia · /elegir · /usar/<clave> ·
    // /copiar/<clave> · /<id>/editar (con «/plan/<id>» si van con un plan
    // del calendario) y #/preparativos/<id>.
    if (partes[0] === 'plantillas') {
      const enPlan = partes.indexOf('plan')
      const agendaId = enPlan > 0 ? (partes[enPlan + 1] ?? null) : null
      // «/fecha/2027-03-15»: con la fecha ya puesta (desde el asistente 🧠).
      const enFecha = partes.indexOf('fecha')
      const fechaInicial = enFecha > 0 && /^\d{4}-\d{2}-\d{2}$/.test(partes[enFecha + 1] ?? '') ? partes[enFecha + 1] : null
      const corte = [enPlan, enFecha].filter((i) => i > 0)
      const resto = corte.length > 0 ? partes.slice(1, Math.min(...corte)) : partes.slice(1)
      if (resto.length === 0) return <PantallaPlantillas />
      if (resto[0] === 'elegir') return <PantallaPlantillas key={agendaId ?? 'elegir'} agendaId={agendaId} />
      if (resto[0] === 'nueva') return <PantallaEditarPlantilla key="nueva" hogarId={yo.hogar.id} modo="nueva" />
      if (resto[0] === 'ia') return <PantallaEditarPlantilla key={`ia-${agendaId}`} hogarId={yo.hogar.id} modo="ia" agendaId={agendaId} />
      if (resto[0] === 'usar' && resto[1]) return <PantallaUsarPlantilla key={`${resto[1]}-${agendaId}-${fechaInicial}`} clave={resto[1]} agendaId={agendaId} fechaInicial={fechaInicial} miUserId={yo.userId} />
      if (resto[0] === 'copiar' && resto[1]) return <PantallaEditarPlantilla key={`copiar-${resto[1]}`} hogarId={yo.hogar.id} modo="copiar" clave={resto[1]} agendaId={agendaId} />
      if (resto[1] === 'editar') return <PantallaEditarPlantilla key={`editar-${resto[0]}`} hogarId={yo.hogar.id} modo="editar" clave={resto[0]} />
    }
    if (partes[0] === 'preparativos' && partes[1]) {
      return <PantallaPreparativos key={partes[1]} id={partes[1]} miUserId={yo.userId} />
    }
    if (partes[0] === 'tareas' && partes[1] === 'nueva') {
      return <PantallaNuevaTarea {...comun} />
    }
    if (partes[0] === 'tareas' && partes[1] && partes[2] === 'editar') {
      return <PantallaEditarTarea key={partes[1]} id={partes[1]} {...comun} />
    }

    const saludo = saludoDelMomento()

    return (
      <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-6 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-6xl lg:px-10 lg:py-10">
        <CabeceraPestana
          color="inicio"
          etiqueta={<>🏡 {yo.hogar.nombre}</>}
          titulo={`${saludo.texto}, ${yo.nombre}`}
          subtitulo="Esto es lo que se viene en casa."
          dibujo={saludo.dibujo}
          boton={
            // En la tablet y el ordenador, Ajustes ya está en el menú de la izquierda.
            <button
              type="button"
              onClick={() => ir('/ajustes')}
              aria-label="Ajustes"
              title="Ajustes"
              className={`${botonCabecera} md:hidden`}
            >
              <span aria-hidden="true">⚙️</span>
            </button>
          }
        />

        {/* El calendario, lo primero (en el ordenador, a todo el ancho). */}
        {/* «🙋 Hoy no puedo»: lo que te piden y lo que has pedido (solo si hay algo). */}
        <TarjetaHoyNoPuedo miUserId={yo.userId} />

        <TarjetaCalendario miUserId={yo.userId} />

        {/* En el móvil, una sola columna (en este orden). En el ordenador, dos:
            a la izquierda los avisos y «Próximo»; a la derecha, el resto. */}
        <div className="contents lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
          <div className="contents lg:flex lg:flex-col lg:gap-6">
            <TarjetaInstalar />

            <TarjetaViaje miUserId={yo.userId} />

            {misEncargos && misEncargos.length > 0 && (
              <button
                type="button"
                onClick={() => ir('/encargos')}
                className="tarjeta text-left ring-2 ring-marca/30"
              >
                <span className="block font-semibold">🔑 Tienes encargos</span>
                <span className="block text-sm text-stone-600">
                  De {misEncargos.map((e) => `«${e.hogar}»`).join(' y ')}. Toca para verlos ›
                </span>
              </button>
            )}

            <TarjetaAyuda />

            <TarjetaProximo miUserId={yo.userId} />
          </div>

          <div className="contents lg:flex lg:flex-col lg:gap-6">
            <TarjetaPlanes />

            <TarjetaCargaMental />

            <TarjetaMascotas />
          </div>
        </div>

        <footer className="mt-auto text-center text-xs text-stone-400">
          Tareas · hecho en casa con 💚
        </footer>
      </main>
    )
  })()

  return (
    <Marco
      ruta={ruta}
      hogar={yo.hogar.nombre}
      hogarId={yo.hogar.id}
      miUserId={yo.userId}
      nombre={yo.nombre}
      conEncargos={(misEncargos?.length ?? 0) > 0}
    >
      {contenido}
    </Marco>
  )
}

export default App
