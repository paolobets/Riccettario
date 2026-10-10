import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { registerSW } from 'virtual:pwa-register'
import App from './app/App'
import { TimerProvider } from './app/timers/store'
import { APP_NAME } from './app/branding'
import './index.css'

registerSW({ immediate: true })
document.title = APP_NAME

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <TimerProvider>
        <App />
      </TimerProvider>
    </BrowserRouter>
  </StrictMode>,
)
