import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PopupApp } from './PopupApp.tsx'
import '../index.css'

export function mountPopup(): void {
  const root = document.getElementById('root')
  if (!root) throw new Error('Popup root element was not found.')
  createRoot(root).render(
    <StrictMode>
      <PopupApp />
    </StrictMode>,
  )
}
