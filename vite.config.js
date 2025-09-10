import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // PWA plugin removed due to caching issues
  ],
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          chart: ['chart.js', 'react-chartjs-2'],
          select: ['react-select'],
          window: ['react-window'],
          fa: ['@fortawesome/react-fontawesome', '@fortawesome/free-solid-svg-icons'],
        },
      },
    },
  },
  server: {
    proxy: {
      // This ONLY affects local dev with `vite dev`
      // Everything backend lives under /api and is proxied to Wrangler dev server
      '/api': 'http://localhost:8787',
    },
  },
})
