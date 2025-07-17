import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: true },
      includeAssets: [
        'favicon.ico',
        'favicon-16x16.png',
        'favicon-32x32.png',
        'apple-touch-icon.png',
        'android-chrome-192x192.png',
        'android-chrome-512x512.png',
      ],
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,webmanifest,sm,ssc}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /(?:^|\/)sm\/.*\.(sm|ssc)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'simfiles-cache',
              expiration: {
                maxEntries: 2000,
              },
            },
          },
          {
            urlPattern: /(?:^|\/)(sm-files|song-meta|course-data|dan-data|vega-data)\.json$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'json-cache',
            },
          },
        ],
      },
      manifest: {
        name: 'DDR Toolkit',
        short_name: 'DDR Toolkit',
        description: 'A toolkit for DanceDanceRevolution players.',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
})
