import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // In development, forward API calls to the FastAPI backend (nginx does this in production)
    proxy: {
      '/api': process.env.VITE_API_PROXY || 'http://localhost:8000',
    },
  },
  build: { outDir: 'dist' },
})
