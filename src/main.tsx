import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PopupApp } from './popup/PopupApp'
import './index.css'

const root = document.getElementById('root')

if (!root) throw new Error('Popup root element was not found.')

createRoot(root).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>,
)
