import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative assets let the same build work at both the custom domain root
  // and the project-scoped GitHub Pages URL (owner.github.io/rakshacall/).
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: 'es2020',
  },
});
