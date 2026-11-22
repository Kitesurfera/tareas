import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AvisoVersionNueva } from './components/AvisoVersionNueva'
import { registrarServiceWorker } from './lib/actualizaciones'

registrarServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AvisoVersionNueva />
    <App />
  </StrictMode>,
)
