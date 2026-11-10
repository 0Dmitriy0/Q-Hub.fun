/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // .ts/.tsx — раніше за .js: забута копія від tsc (.js поруч із .ts у src, вони в .gitignore) не підміняє справжній файл у збірці й тестах
  resolve: { extensions: ['.mts', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'] },
  build: { outDir: 'dist', sourcemap: false },
  test: {
    include: ['src/**/*.test.ts', 'supabase/functions/**/*.test.ts'],   // desktop/ має свої тести (node --test)
    css: { include: [/styles\.css/] },   // mapLayering.test.ts читає styles.css через ?raw — інакше CSS у тестах порожній
  },
});
