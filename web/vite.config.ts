import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  // models/tracks/**/*.json are copied to web/public/models/ for static serving
  // (see scripts/verify.sh for the copy step in CI).
  test: {
    globals: true,
    environment: 'node',   // engine is pure TS, no DOM
    include: ['src/engine/**/*.test.ts'],
  },
})
