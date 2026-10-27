import { cpSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* інтерфейс програми Q-Hub — у desktop/src/ui, звідки його відкриває Electron з диска:
   bar.html — плашка Alt+Q (src/desktop/barMain.tsx): уся програма, кабінет — її головна; history.html — плашка історії ліворуч (src/desktop/histMain.tsx).
   Іконки товарів і скупників (public/icons) кладуться поруч: у базі вони записані як «/icons/…»; логотип (public/brand) — теж,
   у шапці кабінету він через asset(), як і іконки */
export default defineConfig({
  plugins: [react(), { name: 'qhub-icons', closeBundle: () => { for (const d of ['icons', 'brand']) cpSync(`public/${d}`, `desktop/src/ui/${d}`, { recursive: true }); } }],
  base: './',
  publicDir: false,
  build: { outDir: 'desktop/src/ui', emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 1500, rollupOptions: { input: { bar: 'bar.html', history: 'history.html' } } },
});
