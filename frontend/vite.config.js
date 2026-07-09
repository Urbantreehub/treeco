// v4
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    // Pure-logic unit tests run in Node (no DOM needed yet).
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    // Lets modules that read Supabase env vars import cleanly under test.
    env: { VITE_DEMO: 'true' },
  },
})
