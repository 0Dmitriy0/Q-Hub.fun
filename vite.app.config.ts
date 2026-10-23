import { cpSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* інтерфейс програми Q-Hub — у desktop/src/ui, звідки його відкриває Electron з диска:
   app.html — кабінет (src/desktop/main.tsx), bar.html — плашка Alt+Q (src/desktop/barMain.tsx).
   Іконки товарів і скупників (public/icons) кладуться поруч: у базі вони записані як «/icons/…» */
export default defineConfig({
  plugins: [react(), { name: 'qhub-icons', closeBundle: () => cpSync('public/icons', 'desktop/src/ui/icons', { recursive: true }) }],
  base: './',
  publicDir: false,
  build: { outDir: 'desktop/src/ui', emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 1500, rollupOptions: { input: { app: 'app.html', bar: 'bar.html' } } },
});
