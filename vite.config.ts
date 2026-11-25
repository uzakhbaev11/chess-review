import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' — сайт работает из любой подпапки (GitHub Pages: /<repo>/)
export default defineConfig({
  base: './',
  plugins: [react()],
});
