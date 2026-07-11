import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'


const PUBLIC_ROOT = path.resolve('public')
const DEV_PUBLIC_TYPES = new Map([
  ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
])

function servePublicFilesInDev() {
  return {
    name: 'serve-public-files-in-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!['GET', 'HEAD'].includes(req.method || '')) return next()
        const rawPath = String(req.url || '').split('?')[0]
        let requestPath
        try {
          requestPath = decodeURIComponent(rawPath)
        } catch {
          return next()
        }
        const relativePath = requestPath.replace(/^\/+/, '')
        if (!relativePath) return next()
        const filePath = path.resolve(PUBLIC_ROOT, relativePath)
        if (!filePath.startsWith(`${PUBLIC_ROOT}${path.sep}`)) return next()
        let stat
        try {
          stat = fs.statSync(filePath)
        } catch {
          return next()
        }
        if (!stat.isFile()) return next()
        const contentType = DEV_PUBLIC_TYPES.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream'
        res.statusCode = 200
        res.setHeader('Content-Type', contentType)
        res.setHeader('Content-Length', stat.size)
        if (req.method === 'HEAD') return res.end()
        fs.createReadStream(filePath).pipe(res)
      })
    },
  }
}
// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const noPwaBuild = mode === 'no-pwa'

  return {
    publicDir: false,
    plugins: [
      servePublicFilesInDev(),
      react(),
      VitePWA({
        disable: noPwaBuild,
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
        registerType: 'autoUpdate',
        manifest: false,
        includeAssets: [
          'favicon.ico',
          'favicon-16x16.png',
          'favicon-32x32.png',
          'apple-touch-icon.png',
          'android-chrome-192x192.png',
          'android-chrome-512x512.png',
          'img/logos/*',
          'site.webmanifest',
        ],
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
          globIgnores: [
            '**/sm/**',
            '**/ddr-ver/**',
            '**/*-jacket.*',
          ],
        },
      }),
    ],
    build: {
      emptyOutDir: false,
      chunkSizeWarningLimit: 500,
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
      warmup: {
        clientFiles: ['./src/main.jsx', './src/App.jsx', './src/BPMTool.jsx'],
      },
      proxy: {
        // This ONLY affects local dev with `vite dev`
        // Everything backend lives under /api and is proxied to Wrangler dev server
        '/api': 'http://localhost:8787',
      },
    },
  }
})
