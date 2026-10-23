import { defineConfig } from 'vite';

/* розбір скріншотів скупника (src/lib/shotParse.ts) — той самий код, що на сайті, зібраний для головного процесу програми */
export default defineConfig({
  publicDir: false,
  build: { outDir: 'desktop/src/lib', emptyOutDir: true, minify: false, lib: { entry: 'src/lib/shotParse.ts', formats: ['cjs'], fileName: () => 'shotparse.cjs' } },
});
