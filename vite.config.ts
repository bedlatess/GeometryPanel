import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  base: './',
  build: { target: 'safari16.4' },
  server: { strictPort: true },
  preview: { strictPort: true },
});
