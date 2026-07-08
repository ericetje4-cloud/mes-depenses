import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages sert l'app sous /depenses/, il faut donc un base correspondant
  // pour que les chemins des assets et du Service Worker soient corrects.
  base: '/depenses/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Permet de tester le Service Worker (et donc le offline) en `npm run dev`
      devOptions: {
        enabled: true,
      },
      includeAssets: ['favicon.ico', 'icons/*.png', 'tessdata/*.gz'],
      manifest: {
        name: 'Suivi de Dépenses',
        short_name: 'Dépenses',
        description: 'Suivi de dépenses personnelles — 100% local et hors-ligne',
        theme_color: '#4f46e5',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/depenses/',
        scope: '/depenses/',
        lang: 'fr',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,wasm,traineddata}'],
        // Les WASM de Tesseract font ~3,4 Mo : on relève la limite de précache.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 Mo
        // Ressources runtime : on prend d'abord le cache, puis le réseau (offline-first)
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/tessdata/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'tessdata-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 an
              },
            },
          },
        ],
      },
    }),
  ],
})
