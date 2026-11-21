import { useState } from 'react'
import { mensajeDeError } from './errores'
import { hoyComoTexto } from './fechas'
import { supabase } from './supabase'
import { esAutomatica, type Tarea } from './tipos'

// Marcar tareas como hechas, deshacer y reabrir. Lo usan la pantalla de
// Tareas y la tarjeta «Próximo». «alCambiar» se llama para recargar.
export function useAccionesTarea(alCambiar: () => void) {
  // Tarea de tratamiento a la que le estamos preguntando la fecha.
  const [marcando, setMarcando] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Última tarea marcada como hecha, para poder deshacerlo.
  const [recienHecha, setRecienHecha] = useState<Tarea | null>(null)

  async function completar(tarea: Tarea, fecha: string) {
    if (!supabase) return
    setEnviando(true)
    setError(null)
    const { error } = await supabase.rpc('completar_tarea', { tarea_id: tarea.id, hecha_el: fecha })
    setEnviando(false)
    if (error) {
      setError(mensajeDeError(error))
      return
    }
    setMarcando(null)
    setRecienHecha(tarea)
    alCambiar()
  }

  // Las tareas a mano se marcan al momento (y se pueden deshacer).
  // Las automáticas (tratamiento, rutina, vencimiento) no se pueden
  // deshacer, así que piden confirmar la fecha.
  function pulsarCirculo(tarea: Tarea) {
    setError(null)
    if (esAutomatica(tarea)) setMarcando(tarea.id)
    else completar(tarea, hoyComoTexto())
  }

  async function reabrir(tarea: Tarea) {
    if (!supabase) return
    setError(null)
    const { error } = await supabase.rpc('reabrir_tarea', { tarea_id: tarea.id })
    if (error) {
      setError(mensajeDeError(error))
      return
    }
    setRecienHecha(null)
    alCambiar()
  }

  return {
    marcando,
    cancelarMarcado: () => setMarcando(null),
    enviando,
    error,
    recienHecha,
    olvidarRecienHecha: () => setRecienHecha(null),
    completar,
    pulsarCirculo,
    reabrir,
  }
}

export type AccionesTarea = ReturnType<typeof useAccionesTarea>
