import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The app is served at https://bhaviktanna.dev/brickwords/, so every asset
  // URL it emits has to carry that prefix. This must stay in step with the
  // `basePath` the CDK stack deploys under — see infra/lib/brickwords-stack.ts.
  base: process.env.BASE_PATH ?? '/brickwords/',
  server: {
    // The CV project next door owns Vite's default 5173, so this one moves
    // aside. strictPort matters as much as the number: without it Vite quietly
    // slides to the next free port when 5174 is taken, and you end up looking
    // at whichever project claimed the port you typed. Failing loudly is the
    // whole point.
    port: 5174,
    strictPort: true,
  },
  preview: {
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    // Hashed filenames let us cache assets forever and only bust index.html.
    assetsDir: 'assets',
    sourcemap: false,
  },
})
