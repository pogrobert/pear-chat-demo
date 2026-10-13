import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The renderer is a plain web app. Electron loads the built files from disk,
// so asset paths have to be relative (base: './').
export default defineConfig({
  root: 'renderer',
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true }
})
