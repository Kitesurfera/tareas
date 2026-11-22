import { supabase } from './supabase'
import type { Categoria } from './tipos'

// Lo que devuelve el servidor (api/entender-tarea) para rellenar el formulario.
export type TareaEntendida = {
  titulo: string
  fecha: string | null
  // Las palabras de la fecha tal como se dijeron («en marzo»).
  cuando: string | null
  categoria: Categoria
  // null = no ha dicho quién; { id: null } = ha dicho que no es de nadie.
  responsable: { id: string | null } | null
  mascota_id: string | null
  detalles: string | null
  aviso: string | null
}

export const MAX_LETRAS = 400

// Manda el texto (y los nombres del hogar, para entender «que lo haga Bea»)
// al servidor, que se lo pasa a la IA. No se guarda nada.
export async function entenderTarea(
  texto: string,
  personas: { id: string; nombre: string; yo: boolean }[],
  mascotas: { id: string; nombre: string }[],
): Promise<TareaEntendida> {
  if (!supabase) throw new Error('Sin conexión.')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Tienes que entrar con tu cuenta.')

  let respuesta: Response
  try {
    respuesta = await fetch('/api/entender-tarea', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto, personas, mascotas }),
    })
  } catch {
    throw new Error('Sin conexión. Prueba otra vez o rellena la tarea a mano.')
  }
  const cuerpo = (await respuesta.json().catch(() => ({}))) as Partial<TareaEntendida> & { error?: string }
  if (!respuesta.ok || !cuerpo.titulo) {
    throw new Error(cuerpo.error ?? 'No se ha podido entender. Prueba otra vez o rellena la tarea a mano.')
  }
  return cuerpo as TareaEntendida
}
