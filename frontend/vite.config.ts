import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://web:5000',
        changeOrigin: true,
        secure: false,
      },
      '/webhooks': {
        target: 'http://web:5000',
        changeOrigin: true
      }
    }
  }
})

