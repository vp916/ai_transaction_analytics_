import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// During development, requests to /api are forwarded to the Express server,
// so the browser only ever talks to one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': process.env.API_URL || 'http://localhost:5000',
    },
  },
})
