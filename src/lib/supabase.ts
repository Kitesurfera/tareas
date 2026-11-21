import { createClient } from '@supabase/supabase-js'

// Conexión con Supabase (login y, más adelante, la base de datos).
// La URL y la clave "publishable" son públicas: lo que protege los datos
// de cada hogar son las reglas RLS de la base de datos, no esta clave.
const url = import.meta.env.VITE_SUPABASE_URL
const clavePublica = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Si faltan las variables, la app avisa en pantalla en lugar de romperse.
export const supabase =
  url && clavePublica
    ? createClient(url, clavePublica, {
        auth: {
          // PKCE: Google nos devuelve un código de un solo uso en vez de la
          // sesión directamente en la dirección, que es más seguro.
          flowType: 'pkce',
        },
      })
    : null
