import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Прокси к нашему backend (FastAPI на 8001).
    // Frontend ходит на /api/..., backend отвечает на /... без префикса /api,
    // поэтому strip-им '/api' при пробросе (rewrite).
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
