import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="min-h-screen flex items-center justify-center">
      <h1 className="text-2xl font-semibold">Tabularis Registry — bootstrapping…</h1>
    </div>
  </StrictMode>,
)
