import { useState, type FormEvent } from 'react'
import { mensajeDeError } from '../lib/errores'
import { abiertaComoApp } from '../lib/instalar'
import { ir, volver } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import type { Yo } from '../lib/tipos'
import { avisoError, botonSecundario, campo } from './estilos'
import { TarjetaAvisos } from './TarjetaAvisos'
import { TarjetaHogar } from './TarjetaHogar'
import { TarjetaInstalar } from './TarjetaInstalar'
import { CabeceraPestana } from './CabeceraPestana'
import { TituloSeccion } from './Piezas'

type Props = {
  yo: Yo
  email: string | null
  // Vuelve a leer tu nombre y el del hogar (después de cambiarlos).
  onCambio: () => void
  onSalirDelHogar: () => void
  onCerrarSesion: () => void
  // Cierra la sesión en TODOS los dispositivos (por si pierdes el móvil).
  onCerrarSesionEnTodos: () => void
}

// Un campo de texto con botón «Guardar» que solo se activa si hay cambios.
function CampoEditable({
  etiqueta,
  valorInicial,
  maximo,
  ayuda,
  onGuardar,
}: {
  etiqueta: string
  valorInicial: string
  maximo: number
  ayuda?: string
  onGuardar: (valor: string) => Promise<string | null>
}) {
  const [valor, setValor] = useState(valorInicial)
  const [guardando, setGuardando] = useState(false)
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null)
  const limpio = valor.trim()
  const cambiado = limpio !== valorInicial && limpio.length > 0

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    setGuardando(true)
    const error = await onGuardar(limpio)
    setGuardando(false)
    setEstado(error ? { ok: false, texto: error } : { ok: true, texto: 'Guardado ✓' })
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-stone-700" htmlFor={etiqueta}>
        {etiqueta}
      </label>
      <div className="flex gap-2">
        <input
          id={etiqueta}
          className={campo}
          value={valor}
          onChange={(e) => {
            setValor(e.target.value)
            setEstado(null)
          }}
          maxLength={maximo}
          required
        />
        <button
          type="submit"
          disabled={!cambiado || guardando}
          className="shrink-0 rounded-xl bg-marca px-4 font-semibold text-white disabled:opacity-40"
        >
          {guardando ? '…' : 'Guardar'}
        </button>
      </div>
      {ayuda && !estado && <span className="text-xs text-stone-500">{ayuda}</span>}
      {estado && (
        <span role={estado.ok ? 'status' : 'alert'} className={estado.ok ? 'text-sm text-marca' : avisoError}>
          {estado.texto}
        </span>
      )}
    </form>
  )
}

// Pantalla de ajustes: perfil, avisos, viajes, accesos, hogar, la app y cerrar sesión.
export function PantallaAjustes({ yo, email, onCambio, onSalirDelHogar, onCerrarSesion, onCerrarSesionEnTodos }: Props) {
  async function guardarMiNombre(nombre: string): Promise<string | null> {
    if (!supabase) return 'Sin conexión'
    // Gracias a RLS, solo puedes cambiar tu propio nombre.
    const { error } = await supabase.from('miembros').update({ nombre_visible: nombre }).eq('user_id', yo.userId)
    if (error) return mensajeDeError(error)
    onCambio()
    return null
  }

  async function guardarNombreHogar(nombre: string): Promise<string | null> {
    if (!supabase) return 'Sin conexión'
    const { error } = await supabase.from('hogares').update({ nombre }).eq('id', yo.hogar.id)
    if (error) return mensajeDeError(error)
    onCambio()
    return null
  }

  function cerrarSesion() {
    if (window.confirm('¿Cerrar sesión en este móvil? Tus datos se quedan guardados; para volver, entra con Google.')) {
      onCerrarSesion()
    }
  }

  function cerrarSesionEnTodos() {
    const seguro = window.confirm(
      '¿Cerrar sesión en TODOS tus dispositivos (este y cualquier otro móvil u ordenador)? Úsalo si has perdido el móvil. Los demás dispositivos saldrán en menos de una hora; para volver, entra con Google.',
    )
    if (seguro) onCerrarSesionEnTodos()
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 px-5 py-8">
      <CabeceraPestana
        color="ajustes"
        titulo="Ajustes"
        subtitulo="Tu perfil, tu hogar y cómo te avisa la app."
        dibujo="⚙️"
        etiqueta={
          <button type="button" onClick={() => volver('/')} className="font-semibold">
            ← Inicio
          </button>
        }
      />

      <section className="tarjeta flex flex-col gap-4">
        <TituloSeccion dibujo="👤" titulo="Tu perfil" color="inicio" />
        <CampoEditable
          etiqueta="Tu nombre en la app"
          valorInicial={yo.nombre}
          maximo={40}
          ayuda="Así te ve el resto del hogar."
          onGuardar={guardarMiNombre}
        />
        {email && <p className="text-sm text-stone-500">Has entrado con Google como {email}.</p>}
      </section>

      <TarjetaAvisos />

      <section className="tarjeta">
        <TituloSeccion dibujo="✈️" titulo="Modo viaje" color="vencimientos" />
        <p className="mt-3 text-sm text-stone-600">
          Si alguien se va de viaje, sus tareas, turnos y avisos pasan a quien se queda en casa.
        </p>
        <button type="button" onClick={() => ir('/viajes')} className={`mt-3 ${botonSecundario}`}>
          Ver y añadir viajes
        </button>
      </section>

      <section className="tarjeta">
        <TituloSeccion dibujo="🔑" titulo="Acceso temporal" color="casa" />
        <p className="mt-3 text-sm text-stone-600">
          Deja que alguien de fuera (quien cuida la mascota, riega…) vea y haga solo las tareas que elijáis,
          durante unos días.
        </p>
        <button type="button" onClick={() => ir('/accesos')} className={`mt-3 ${botonSecundario}`}>
          Ver y dar accesos
        </button>
      </section>

      <section className="tarjeta flex flex-col gap-4">
        <TituloSeccion dibujo="🏡" titulo="Tu hogar" color="coral" />
        <CampoEditable
          etiqueta="Nombre del hogar"
          valorInicial={yo.hogar.nombre}
          maximo={60}
          onGuardar={guardarNombreHogar}
        />
      </section>

      <TarjetaHogar
        // Al cambiar tu nombre o el del hogar, la lista se vuelve a cargar.
        key={`${yo.nombre}|${yo.hogar.nombre}`}
        hogar={yo.hogar}
        miUserId={yo.userId}
        onSalir={onSalirDelHogar}
        titulo="Quién está en el hogar"
      />

      {abiertaComoApp() ? (
        <section className="tarjeta">
          <TituloSeccion dibujo="📲" titulo="La app" color="tareas" />
          <p className="mt-3 text-sm text-stone-600">Tienes Tareas instalada en este móvil. ✅</p>
        </section>
      ) : (
        <TarjetaInstalar siempre />
      )}

      <button
        type="button"
        onClick={cerrarSesion}
        className="mt-2 w-full rounded-full px-5 py-3 font-semibold text-red-700 ring-1 ring-red-200 active:scale-[0.98]"
      >
        Cerrar sesión
      </button>
      <button
        type="button"
        onClick={cerrarSesionEnTodos}
        className="-mt-2 w-full py-2 text-sm text-red-700 underline-offset-2 hover:underline"
      >
        Cerrar sesión en todos mis dispositivos
      </button>
      <p className="-mt-3 text-center text-xs text-stone-500">Por si pierdes el móvil o entraste en un sitio que no es tuyo.</p>
    </main>
  )
}
