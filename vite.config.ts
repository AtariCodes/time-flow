import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build:single` vytvoří jediný soubor dist-single/index.html,
// který jde otevřít přímo z disku (bez serveru), stejně jako původní TimeFlow.html.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [preact(), tailwindcss(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    // Ve single režimu nekopírujeme public/ (service worker na file:// nefunguje).
    copyPublicDir: mode !== 'single',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}));
