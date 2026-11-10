import { defineConfig } from 'vite';

/* код сайту, зібраний для головного процесу програми (CommonJS, desktop/src/lib):
   shotparse.cjs — розбір скріншотів скупника (src/lib/shotParse.ts);
   alerts.cjs — сповіщення: «час здавати», івенти, таймер оголошення (src/lib/alerts.ts, specs/075–077) */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'desktop/src/lib', emptyOutDir: true, minify: false,
    lib: { entry: { shotparse: 'src/lib/shotParse.ts', alerts: 'src/lib/alerts.ts' }, formats: ['cjs'], fileName: (_f, name) => name + '.cjs' },
  },
});
