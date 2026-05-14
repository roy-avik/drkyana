import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// GH Pages serves this at https://roy-avik.github.io/drkyana/
export default defineConfig({
  base: '/drkyana/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/quick-check-192.png', 'icons/quick-check-512.png', 'icons/quick-check-maskable.png', 'tooth.svg'],
      manifest: {
        id: '/drkyana/',
        name: 'Dr Kyana — Dental Quick Check',
        short_name: 'Quick Check',
        description: 'AI-assisted dental symptom triage. Runs on-device in Chrome.',
        start_url: '/drkyana/#/quick-check',
        scope: '/drkyana/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0f4c81',
        background_color: '#ffffff',
        lang: 'en',
        icons: [
          { src: 'icons/quick-check-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/quick-check-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/quick-check-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/drkyana/index.html',
      },
    }),
  ],
  build: {
    target: 'es2020',
    sourcemap: false,
  },
});
