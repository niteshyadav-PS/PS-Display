import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Keep player files out of the editor's /assets folder when both sites share one host.
    assetsDir: 'player-assets',
  },
  server: {
    host: true,
    port: 5174,
  },
})
