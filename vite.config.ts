import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api/': {
        target: 'https://dev04.agrovisions.pk',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist/react-app',
    emptyOutDir: true,
  },
});
