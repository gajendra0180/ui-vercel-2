import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'crypto', 'stream', 'util'],
      globals: {
        Buffer: true,
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to backend
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // Bypass proxy for browser navigations (let React Router handle them)
        bypass: (req, res, options) => {
          // If it's a browser navigation (Accept: text/html), don't proxy
          // Let Vite serve the SPA and React Router will handle the route
          const acceptHeader = req.headers.accept || '';
          if (acceptHeader.includes('text/html') && !acceptHeader.includes('application/json')) {
            return req.url; // Return the URL to serve from Vite instead of proxying
          }
          // For API calls (fetch, axios, etc.), proxy to backend
          return null; // null means use the proxy
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})

