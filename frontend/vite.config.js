import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    // Charts are only used by the dashboard, and the React runtime rarely changes —
    // keeping them in their own chunks means a code change does not bust either cache.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/]node_modules[\\/](recharts|d3-|victory)/.test(id)) return 'charts'
          if (/[\\/]node_modules[\\/](react|react-dom|react-router)/.test(id)) return 'react'
          return 'vendor'
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
})
