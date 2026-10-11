import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { registerSW } from 'virtual:pwa-register'
import App from './app/App'
import { TimerProvider } from './app/timers/store'
import { APP_NAME } from './app/branding'
import { initTheme } from './app/theme'
import './index.css'

registerSW({ immediate: true })
document.title = APP_NAME
initTheme()
// Chiede al browser di non svuotare lo spazio dell'app quando libera memoria (iOS lo fa dopo settimane di inattività).
navigator.storage?.persist?.().catch(() => undefined)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <TimerProvider>
        <App />
      </TimerProvider>
    </BrowserRouter>
  </StrictMode>,
)
