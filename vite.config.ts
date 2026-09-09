import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
      },
      manifest: {
        name: 'Cafe POS Offline',
        short_name: 'CafePOS',
        description: 'Local-first point of sale system',
        theme_color: '#1a1a1a',
        display: 'standalone',
        background_color: '#1a1a1a'
      }
    })
  ]
});