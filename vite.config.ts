import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Precache all build output + common assets.
      // Note: if you later add huge offline tile packs, you'll want a different caching strategy.
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,json,woff2}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,

        // Runtime caching so the map can keep working offline *after* you've already visited an area.
        // IMPORTANT: Respect your tile provider's Terms of Service before enabling aggressive caching.
        runtimeCaching: [
          {
            // MapLibre demo tiles (replace with your own tile server/style for production).
            urlPattern: ({ url }) => url.origin === 'https://demotiles.maplibre.org',
            handler: 'CacheFirst',
            options: {
              cacheName: 'maplibre-demo-tiles',
              cacheableResponse: { statuses: [0, 200] },
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          }
        ]
      },
      includeAssets: [
        'assets/earth-blue-marble.jpg',
        'assets/earth-topology.png',
        'icons/pwa-192x192.png',
        'icons/pwa-512x512.png'
      ],
      manifest: {
        name: 'TravelApp',
        short_name: 'TravelApp',
        description: 'Offline trip recorder with interactive globe',
        theme_color: '#0b1020',
        background_color: '#0b1020',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      }
    })
  ]
});
