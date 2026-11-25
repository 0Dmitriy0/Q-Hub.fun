/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* превʼю (.github/workflows/preview.yml, QHUB_PREVIEW=1): та сама збірка під q-hub.fun/preview/. Картинки, мапа й знімок цін
   беруться з кореня живого сайту за абсолютними адресами, тож public/ у превʼю не копіюємо */
const preview = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.QHUB_PREVIEW;   // без типів Node (tsconfig)

export default defineConfig({
  plugins: [react()],
  base: preview ? '/preview/' : '/',
  publicDir: preview ? false : 'public',
  // .ts/.tsx — раніше за .js: забута копія від tsc (.js поруч із .ts у src, вони в .gitignore) не підміняє справжній файл у збірці й тестах
  resolve: { extensions: ['.mts', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'] },
  build: { outDir: 'dist', sourcemap: false },
  test: {
    include: ['src/**/*.test.ts', 'supabase/functions/**/*.test.ts'],   // desktop/ має свої тести (node --test)
    css: { include: [/styles\.css/] },   // mapLayering.test.ts читає styles.css через ?raw — інакше CSS у тестах порожній
  },
});
