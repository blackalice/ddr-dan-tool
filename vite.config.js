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
      '/api': 'http://localhost:8787',
    },
  },
})