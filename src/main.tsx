import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './lib/auth'
import { ConfirmProvider } from './lib/confirm'
import { ThemeProvider } from './lib/theme'
import { ToastProvider } from './lib/toast'
import './index.css'
import { registerServiceWorker } from './lib/pwa'

registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
