import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

console.log('🚀 main.jsx executing, React version:', React.version)

function mountApp() {
  const rootEl = document.getElementById('root')
  console.log('📦 root element:', rootEl)

  if (!rootEl) {
    console.error('❌ Root element not found!')
    document.body.innerHTML = '<pre style="color: red; padding: 20px;">❌ Root element #root not found!</pre>'
    return
  }

  console.log('✅ Creating React root...')
  try {
    const root = createRoot(rootEl)
    console.log('✅ React root created, rendering...')
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )
    console.log('✅ Render complete')
  } catch (err) {
    console.error('❌ Render error:', err)
    document.body.innerHTML = `<pre style="color: red; padding: 20px; background: #0a0a0f;">❌ Render Error:<br>${err.message}<br><br>${err.stack}</pre>`
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountApp)
} else {
  mountApp()
}