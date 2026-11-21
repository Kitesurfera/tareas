import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Configuración de Vite: React para la interfaz y Tailwind para los estilos
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
