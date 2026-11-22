import { useState, type FormEvent } from 'react'
import type { Encargo, EncargoTarea } from '../lib/accesos'
import { mensajeDeError } from '../lib/errores'
import { cuandoToca, diasHasta, hoyComoTexto } from '../lib/fechas'
import { volver } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import { infoCategoria } from '../lib/tipos'
import { diaMes } from '../lib/viajes'
import { avisoError, botonPrincipal, campo } from './estilos'
import { TarjetaAvisos } from './TarjetaAvisos'

type Props = {
  encargos: Encargo[] | null
  // Error al aceptar un enlace (por ejemplo, si ya lo usa otra persona).
  errorEnlace: string | null
  recargar: () => void
  // true = esta persona no tiene hogar propio: solo ve sus encargos.
  soloEncargos: boolean
  onCrearHogar?: () => void
  onCerrarSesion?: () => void
}

function colorDeFecha(fecha: string | null): string {
  if (!fecha) return 'text-stone-500'
  const dias = diasHasta(fecha)
  if (dias < 0) return 'text-red-700'
  if (dias <= 1) return 'text-amber-700'
  return 'text-stone-500'
}

// Una tarea encargada, con su botón «Hecho» (fecha y nota opcional).
function FilaEncargo({ tarea, onHecha }: { tarea: EncargoTarea; onHecha: () => void }) {
  const [abierta, setAbierta] = useState(false)
  const [fecha, setFecha] = useState(hoyComoTexto)
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const categoria = infoCategoria(tarea.categoria)

  async function confirmar(evento: FormEvent) {
    evento.preventDefault()
    if (!supabase) return
    setEnviando(true)
    setError(null)
    const { error } = await supabase.rpc('completar_encargo', {
      tarea_id: tarea.id,
      hecha_el: fecha,
      nota: nota.trim() || null,
    })
    setEnviando(false)
    if (error) return setError(mensajeDeError(error))
    onHecha()
  }

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="text-xl leading-none">{categoria.dibujo}</span>
        <span className="flex-1">
          <span className="block font-medium">{tarea.titulo}</span>
          <span className="block text-sm">
            {tarea.fecha_limite && (
              <span className={`font-medium ${colorDeFecha(tarea.fecha_limite)}`}>{cuandoToca(tarea.fecha_limite)}</span>
            )}
            {tarea.mascota && <span className="text-stone-500"> · {tarea.mascota}</span>}
            {tarea.planta && <span className="text-stone-500"> · {tarea.planta}</span>}
          </span>
          {(tarea.notas || tarea.descripcion) && (
            <span className="mt-1 block whitespace-pre-line text-sm text-stone-600">
              {tarea.notas ?? tarea.descripcion}
            </span>
          )}
        </span>
        {!abierta && (
          <button
            type="button"
            onClick={() => setAbierta(true)}
            className="shrink-0 rounded-full bg-linear-to-b from-marca to-[#0b5f58] shadow-[0_6px_14px_-6px_rgb(15_118_110/0.6)] px-4 py-2 text-sm font-semibold text-white"
          >
            Hecho
          </button>
        )}
      </div>
      {abierta && (
        <form onSubmit={confirmar} className="mt-3 flex flex-col gap-3 rounded-xl bg-stone-50 p-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-stone-700">
            ¿Cuándo lo hiciste?
            <input
              type="date"
              className={campo}
              value={fecha}
              max={hoyComoTexto()}
              onChange={(e) => setFecha(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-stone-700">
            ¿Quieres dejar una nota? (si quieres)
            <textarea
              className={campo}
              rows={2}
              maxLength={500}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Todo bien. Ha comido poco."
            />
          </label>
          {error && <p role="alert" className={avisoError}>{error}</p>}
          <button type="submit" disabled={enviando} className={botonPrincipal}>
            {enviando ? 'Guardando…' : 'Marcar como hecho'}
          </button>
          <button type="button" onClick={() => setAbierta(false)} className="text-sm text-stone-600">
            Cancelar
          </button>
        </form>
      )}
    </li>
  )
}

// Nota para la casa sin marcar nada.
function NotaSuelta({ encargoId }: { encargoId: string }) {
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null)

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (!supabase || !texto.trim()) return
    setEnviando(true)
    const { error } = await supabase.rpc('nota_para_el_hogar', { acceso_id: encargoId, texto: texto.trim() })
    setEnviando(false)
    if (error) return setEstado({ ok: false, texto: mensajeDeError(error) })
    setTexto('')
    setEstado({ ok: true, texto: 'Nota enviada ✓' })
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-2">
      <label className="text-sm font-medium text-stone-700" htmlFor={`nota-${encargoId}`}>
        📝 Dejar una nota para la casa
      </label>
      <textarea
        id={`nota-${encargoId}`}
        className={campo}
        rows={2}
        maxLength={500}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value)
          setEstado(null)
        }}
        placeholder="Ha llegado un paquete, lo he dejado en la entrada."
      />
      {estado && (
        <span role={estado.ok ? 'status' : 'alert'} className={estado.ok ? 'text-sm text-marca' : avisoError}>
          {estado.texto}
        </span>
      )}
      <button
        type="submit"
        disabled={enviando || !texto.trim()}
        className="self-start rounded-full px-4 py-2 text-sm font-semibold bg-marca-suave/70 text-marca ring-1 ring-marca/15 disabled:opacity-40"
      >
        {enviando ? 'Enviando…' : 'Enviar nota'}
      </button>
    </form>
  )
}

// #/encargos: lo que te han encargado con un acceso temporal.
export function PantallaEncargos({ encargos, errorEnlace, recargar, soloEncargos, onCrearHogar, onCerrarSesion }: Props) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-3xl lg:px-10 lg:py-10">
      {!soloEncargos && (
        <button type="button" onClick={() => volver('/')} className="self-start text-sm font-medium text-marca">
          ← Inicio
        </button>
      )}
      <h1 className="text-2xl font-extrabold text-marca">🔑 Tus encargos</h1>

      {errorEnlace && <p role="alert" className={avisoError}>{errorEnlace}</p>}
      {encargos === null && <p className="text-center text-stone-400">Cargando…</p>}
      {encargos?.length === 0 && (
        <p className="tarjeta text-center text-stone-500">
          Ahora mismo no tienes ningún encargo. Si alguien te ha mandado un enlace, ábrelo desde este móvil.
        </p>
      )}

      {encargos?.map((encargo) => (
        <section key={encargo.id} className="tarjeta flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold">De «{encargo.hogar}»</h2>
            <p className="text-sm text-stone-500">
              {encargo.activo
                ? `Hasta el ${diaMes(encargo.hasta)} · ¡gracias por ayudar! 💚`
                : `Empieza el ${diaMes(encargo.desde)} y dura hasta el ${diaMes(encargo.hasta)}. Ese día verás aquí lo que hay que hacer.`}
            </p>
          </div>

          {encargo.activo && (
            <>
              {encargo.tareas.length === 0 ? (
                <p className="text-stone-500">No hay nada pendiente ahora mismo. 🎉</p>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {encargo.tareas.map((tarea) => (
                    <FilaEncargo key={tarea.id} tarea={tarea} onHecha={recargar} />
                  ))}
                </ul>
              )}

              {encargo.mascotas.length > 0 && (
                <div className="flex flex-col gap-2">
                  {encargo.mascotas.map((m) => (
                    <div key={m.nombre} className="rounded-xl bg-marca-suave/60 p-3">
                      <p className="font-medium">
                        🐾 {m.nombre}
                        <span className="font-normal text-stone-600"> · {[m.especie, m.raza].filter(Boolean).join(' · ')}</span>
                      </p>
                      {m.notas && <p className="mt-1 whitespace-pre-line text-sm text-stone-700">{m.notas}</p>}
                    </div>
                  ))}
                </div>
              )}

              {encargo.plantas?.length > 0 && (
                <div className="flex flex-col gap-2">
                  {encargo.plantas.map((p) => (
                    <div key={p.nombre} className="rounded-xl bg-lime-50 p-3">
                      <p className="font-medium">
                        🪴 {p.nombre}
                        {(p.tipo || p.ubicacion) && (
                          <span className="font-normal text-stone-600"> · {[p.tipo, p.ubicacion].filter(Boolean).join(' · ')}</span>
                        )}
                      </p>
                      {p.notas && <p className="mt-1 whitespace-pre-line text-sm text-stone-700">{p.notas}</p>}
                    </div>
                  ))}
                </div>
              )}

              <NotaSuelta encargoId={encargo.id} />

              {encargo.hechas.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-stone-500">Lo que ya has hecho</p>
                  <ul className="mt-1 text-sm text-stone-600">
                    {encargo.hechas.map((h, i) => (
                      <li key={i}>
                        ✓ {h.titulo} ·{' '}
                        {new Date(h.completada_en).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      ))}

      <TarjetaAvisos />

      {soloEncargos && (
        <div className="flex flex-col items-center gap-3 text-sm">
          {onCrearHogar && (
            <button type="button" onClick={onCrearHogar} className="font-medium text-marca">
              ¿Quieres usar Tareas para tu propia casa? Crear mi hogar
            </button>
          )}
          {onCerrarSesion && (
            <button type="button" onClick={onCerrarSesion} className="text-stone-500">
              Cerrar sesión
            </button>
          )}
        </div>
      )}
    </main>
  )
}
