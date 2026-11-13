import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The root .env belongs to the server (it sets NODE_ENV, which would make Vite bundle React's
  // slow development build). The site needs no env vars, so look for them somewhere else.
  envDir: 'src',
  server: {
    port: 5173,
    // In development the API runs separately (npm run dev starts both). API_URL points elsewhere if needed.
    proxy: { '/api': process.env.API_URL || 'http://localhost:3001' },
  },
});
