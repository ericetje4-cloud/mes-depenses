import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { setupPWA } from './lib/pwa.ts'
import { seedDefaults } from './lib/db.ts'

// Enregistre le Service Worker (PWA : offline + installable).
setupPWA()

// Initialise les catégories par défaut au premier lancement.
seedDefaults().catch((e) => console.error('Init DB échouée:', e))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
