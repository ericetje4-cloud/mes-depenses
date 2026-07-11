import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// Base path : pour GitHub Pages (servi sous /<repo>/), définir
// VITE_BASE_PATH=/nom-du-repo. Vide par défaut (déploiement racine).
const base = process.env.VITE_BASE_PATH ?? '/';
// Garantit un slash final pour préfixer les chemins du manifest.
const baseDir = base.endsWith('/') ? base : `${base}/`;

// https://vite.dev/config/
export default defineConfig({
  base,

  // Injecte la version (de package.json) comme constante globale côté client.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },

  // Autorise l'accès depuis un tunnel (cloudflared, ngrok...) pour tester la
  // PWA sur mobile en HTTPS. true = accepte tous les hôtes (dev/preview only).
  preview: {
    allowedHosts: true,
  },
  server: {
    allowedHosts: true,
  },
  resolve: {
    // Alias '@' -> '/src' pour les imports type '@/lib/...'.
    // Requis par Vite en dev (le build résout aussi via tsconfig.paths).
    alias: {
      '@': '/src',
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Le fichier de langue OCR (fra.traineddata) est volumineux (~12 Mo) :
      // on l'exclut du precaching pour garder un SW léger, mais il reste
      // mis en cache par le navigateur / Cache Storage lors de la 1re lecture.
      includeAssets: ['favicon.svg', 'icons/*.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // On ne pré-cache jamais les gros assets de Tesseract.
        globIgnores: ['**/tessdata/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // Modèle OCR + core WASM Tesseract : mis en cache au runtime
            // (trop volumineux pour le precache). Reste disponible hors-ligne
            // après la 1re utilisation de l'OCR.
            urlPattern: ({ url }) =>
              url.pathname.includes('/tessdata/') ||
              url.pathname.endsWith('.traineddata') ||
              url.pathname.endsWith('.wasm'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'tessdata-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 an
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'Mes Dépenses',
        short_name: 'Dépenses',
        description: 'Suivi de dépenses 100% local, offline-first, avec scan de tickets.',
        theme_color: '#4f46e5',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        // Chemins relatifs à la base pour fonctionner sous /<repo>/ (GitHub Pages).
        start_url: baseDir,
        scope: baseDir,
        lang: 'fr',
        categories: ['finance', 'productivity'],
        icons: [
          {
            src: `${baseDir}icons/icon-192.png`,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: `${baseDir}icons/icon-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: `${baseDir}icons/icon-maskable-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  // Tesseract.js charge des workers/wasm qu'on sert nous-mêmes depuis /public.
  // On s'assure que les assets ne sont pas optimisés/cassés par Vite.
  build: {
    target: 'es2022',
    // Code-splitting : sépare les grosses libs pour un meilleur cache
    // navigateur et des chunks plus petits (Rolldown requiert une fonction).
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts') || id.includes('d3-') || id.includes('victory'))
              return 'charts-vendor';
            if (id.includes('tesseract.js')) return 'tesseract-vendor';
            if (id.includes('react') || id.includes('scheduler'))
              return 'react-vendor';
          }
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
});
