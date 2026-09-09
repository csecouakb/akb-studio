import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/akb-studio/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'AKB Studio',
        short_name: 'AKB Studio',
        description: 'Offline-first lightweight video editor and Voice Studio',
        theme_color: '#111111',
        background_color: '#111111',
        display: 'standalone',
        start_url: '/akb-studio/',
        scope: '/akb-studio/',
        icons: [
          {
            src: '/akb-studio/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
})
