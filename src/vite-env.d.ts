/// <reference types="vite/client" />

// Variables de entorno que usa la app.
// En Vercel se configuran en Settings → Environment Variables.
// Las dos son públicas por diseño: nunca pongas aquí claves secretas.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
