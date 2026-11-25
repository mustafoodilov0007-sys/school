import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev: /api so'rovlari backendga proksilanadi (CORS/cookie muammosiz)
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
  build: { sourcemap: false, target: 'es2020' },
});
