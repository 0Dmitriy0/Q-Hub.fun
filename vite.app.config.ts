import { cpSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* інтерфейс програми Q-Hub — у desktop/src/ui, звідки його відкриває Electron з диска:
   bar.html — плашка Alt+Q (src/desktop/barMain.tsx): уся програма, кабінет — її головна, історія — її ліва колонка (src/desktop/History.tsx);
   map.html — мапа Q-Hub поверх гри (src/desktop/mapMain.tsx, specs/014): та сама сторінка мапи сайту, лише перегляд.
   Іконки товарів і скупників (public/icons) кладуться поруч: у базі вони записані як «/icons/…»; логотип (public/brand) — теж,
   у шапці кабінету він через asset(), як і іконки */
export default defineConfig({
  plugins: [react(), { name: 'qhub-icons', closeBundle: () => { for (const d of ['icons', 'brand']) cpSync(`public/${d}`, `desktop/src/ui/${d}`, { recursive: true }); } }],
  base: './',
  publicDir: false,
  /* .ts/.tsx — раніше за .js: забута копія від tsc (src/desktop/Bar.js) не підміняє справжній Bar.tsx у збірці */
  resolve: { extensions: ['.mts', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'] },
  build: { outDir: 'desktop/src/ui', emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 1500, rollupOptions: { input: { bar: 'bar.html', map: 'map.html', rule: 'rule.html', timer: 'timer.html' } } },
});
