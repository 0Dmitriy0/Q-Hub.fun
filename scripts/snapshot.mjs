// Знімок цін скупників на момент збірки: сайт показує його одразу, ще до відповіді бази,
// тож ціни видно навіть при першому відкритті й на повільному інтернеті. Без бази збірка не падає.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const env = { ...Object.fromEntries(readFileSync('.env.production', 'utf8').split('\n').filter(l => /^\w+=/.test(l)).map(l => l.split(/=(.*)/s).slice(0, 2))), ...process.env };
const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY;
const q = {
  buyers: 'buyers?select=id,name,updated_at,image_url&order=sort',
  rows: 'buyer_items?select=buyer_id,item_id,min_price,max_price,price,price_at,items(id,name,unit,image_url,sub)',
  ups: 'price_updates?select=*&order=created_at.desc&limit=500',
  top: 'contributors?select=*&order=total.desc&limit=500',
  next: 'buyer_next_change?select=*'
};
try {
  if (!url || !key) throw new Error('немає ключів Supabase');
  const get = async p => { const r = await fetch(`${url}/rest/v1/${p}`, { headers: { apikey: key }, signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(`${p.split('?')[0]}: HTTP ${r.status}`); return r.json(); };
  const out = { at: new Date().toISOString() };
  for (const [k, p] of Object.entries(q)) out[k] = await get(p).catch(e => { if (k === 'buyers' || k === 'rows') throw e; return []; });
  mkdirSync('public/snapshot', { recursive: true });
  writeFileSync('public/snapshot/prices.json', JSON.stringify(out));
  console.log(`price snapshot: ${out.buyers.length} buyers, ${out.rows.length} prices`);
} catch (e) { console.log('price snapshot skipped:', e.message); }
