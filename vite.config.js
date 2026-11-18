import { fileURLToPath } from 'node:url';

// Multi-page: Home (index.html) + Peta Interaktif (peta.html).
// base './' supaya hasil build bisa dibuka dari subfolder (mis. GitHub Pages).
export default {
  base: './',
  build: {
    sourcemap: true,
    rollupOptions: {
      input: {
        home: fileURLToPath(new URL('./index.html', import.meta.url)),
        peta: fileURLToPath(new URL('./peta.html', import.meta.url)),
      },
    },
  },
};
