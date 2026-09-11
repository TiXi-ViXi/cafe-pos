import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(), 
    VitePWA({ 
      registerType: 'autoUpdate',
      manifest: {
        name: 'Byron Bay Bliss POS',
        short_name: 'Cafe POS',
        description: 'Offline-first Point of Sale system',
        theme_color: '#1a1a1a',
        background_color: '#1a1a1a',
        display: 'standalone', 
        icons: [
          {
            src: 'https://cdn-icons-png.flaticon.com/512/751/751688.png', 
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'https://cdn-icons-png.flaticon.com/512/751/751688.png',
            sizes: '192x192',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}']
      }
    })
  ],
  // CRITICAL CHANGE: This must be a relative dot-slash so Electron 
  // can find the files on your computer's local hard drive
  base: './', 
})