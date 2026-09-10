import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite' // <-- Add this import

export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(), // <-- Add this plugin
    VitePWA({ registerType: 'autoUpdate' })
  ],
  base: '/cafe-pos/', 
})