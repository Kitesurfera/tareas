import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Configuración de Vite: React para la interfaz, Tailwind para los estilos
// y la PWA para poder instalar la app en el móvil.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Cuando hay una versión nueva, se instala sola y se usa al volver a abrir.
      registerType: 'autoUpdate',
      // El aviso al navegador va en un archivo aparte (no «en línea»), para
      // respetar la política de seguridad de vercel.json.
      injectRegister: 'script',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Tareas',
        short_name: 'Tareas',
        description: 'Lo que hay que recordar en casa, repartido entre las dos.',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fafaf9',
        theme_color: '#0f766e',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Se guardan en el móvil solo los archivos de la app (para que abra
        // rápido). Los datos del hogar NO se guardan: siempre se piden a
        // Supabase, así nunca ves datos viejos ni quedan copias en el móvil.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
