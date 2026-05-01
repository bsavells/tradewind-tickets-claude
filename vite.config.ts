import path from 'path'
import fs from 'fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Single timestamp shared by the JS bundle and version.json
const BUILD_TIME = new Date().toISOString()

/** Writes dist/version.json at build time with the shared timestamp. */
function versionPlugin(): Plugin {
  return {
    name: 'version-json',
    writeBundle() {
      fs.writeFileSync(
        path.resolve(__dirname, 'dist/version.json'),
        JSON.stringify({ buildTime: BUILD_TIME }),
      )
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    versionPlugin(),
    VitePWA({
      // We register the SW ourselves via @/hooks/useAppUpdate so the existing
      // UpdateBanner component triggers on `needRefresh`.
      injectRegister: false,
      // 'prompt' lets us show our branded refresh banner instead of an
      // auto-reload.
      registerType: 'prompt',
      // Our existing public/manifest.json is hand-curated and already linked
      // from index.html, so we don't need the plugin to emit another one.
      manifest: false,
      // SW only runs against the production build. In dev the registration
      // hook is a no-op, which is what we want — HMR + SW mix poorly.
      devOptions: { enabled: false },
      workbox: {
        // Precache the built assets (JS, CSS, HTML, icons, fonts).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Skip the heavy on-demand chunks — they load when an admin actually
        // clicks Export PDF, and there's no point spending bandwidth eagerly
        // pulling them onto every device.
        globIgnores: [
          '**/assets/exportTicketPdf-*.js',
          '**/assets/html2canvas-*.js',
          '**/assets/index.es-*.js', // dompurify/jspdf transitive chunk
        ],
        // SPA navigations must fall back to index.html so deep links work
        // offline and after the SW takes over.
        navigateFallback: 'index.html',
        // Don't precache or hijack the version.json probe — it has to hit
        // the network to detect a new deploy.
        navigateFallbackDenylist: [/^\/api\//, /^\/version\.json$/],
        cleanupOutdatedCaches: true,
        // Replace the old SW immediately when a new one activates.
        clientsClaim: true,
        // Wait for our banner-driven user opt-in before activating the new SW.
        skipWaiting: false,
        runtimeCaching: [
          {
            // Google Fonts CSS — versioned, fine to cache aggressively.
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            // Google Fonts files — long-lived, cache-first.
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  define: {
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
