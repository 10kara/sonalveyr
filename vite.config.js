import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_BASE задаётся в GitHub Actions: '/<имя-репозитория>/' для
// https://10kara.github.io/<имя-репозитория>/ или '/' для своего домена.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    rollupOptions: {
      output: {
        // Библиотеки — в отдельный файл: он кешируется между обновлениями сайта.
        manualChunks: id => (id.includes('node_modules') ? 'vendor' : undefined),
      },
    },
  },
  server: { host: true, allowedHosts: true },
  preview: { host: true, allowedHosts: true },
})
