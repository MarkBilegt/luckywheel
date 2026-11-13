import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In development the API runs separately (npm run dev starts both). API_URL points elsewhere if needed.
    proxy: { '/api': process.env.API_URL || 'http://localhost:3001' },
  },
});
