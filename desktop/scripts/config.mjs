// Публічні адреса й ключ Supabase — ті самі, що в сайту (../.env.production): програма ходить у ту саму базу
// з правами гравця (RLS). Пише src/config.json, який іде в інсталятор.
import { readFileSync, writeFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../../.env.production', import.meta.url), 'utf8')
  .split('\n').filter(l => /^VITE_SUPABASE_/.test(l)).map(l => l.split('=').map(s => s.trim())));
const cfg = { url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_ANON_KEY, site: 'https://q-hub.fun' };
if (!cfg.url || !cfg.key) throw new Error('немає VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY у .env.production');
writeFileSync(new URL('../src/config.json', import.meta.url), JSON.stringify(cfg, null, 2) + '\n');
console.log('config.json:', cfg.url);
