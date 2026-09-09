import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from "./App.tsx";
import './index.css'

// Import the virtual PWA registration provided by the Vite plugin
import { registerSW } from 'virtual:pwa-register'

// Auto-update the service worker in the background
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)