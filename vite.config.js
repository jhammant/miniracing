import { defineConfig } from 'vite';

// The game server (npm start) owns /ws and /api; in dev Vite proxies to it.
export default defineConfig({
  build: { outDir: 'dist', target: 'es2022', chunkSizeWarningLimit: 900 },
  server: {
    host: true,
    proxy: {
      '/ws': { target: 'ws://localhost:8080', ws: true, changeOrigin: true },
      '/api': 'http://localhost:8080',
    },
  },
});
