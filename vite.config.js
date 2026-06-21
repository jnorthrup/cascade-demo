import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'remove-crossorigin',
      transformIndexHtml(html) {
        return html
          .replace(/crossorigin\s+/g, '')
          .replace(/crossorigin=""/g, '')
      }
    }
  ],
  base: './',
  build: {
    outDir: 'docs',
    emptyOutDir: true
  },
  server: {
    port: 3001
  }
})