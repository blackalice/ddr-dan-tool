import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // PWA plugin removed due to caching issues
  ],
  server: {
    proxy: {
      // This ONLY affects local dev with `vite dev`
      // Everything backend lives under /api and is proxied to Wrangler dev server
      '/api': 'http://localhost:8787',
    },
  },
})
