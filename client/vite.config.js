import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The React app only ever talks to our own backend; the Gemini key stays there.
    proxy: { '/api': 'http://localhost:4000' },
  },
});
