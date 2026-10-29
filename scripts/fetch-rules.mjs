/* Правила сервера й закони штату QuantRP з форуму → src/data/rules.json — запасна копія, вбудована в програму (specs/010).
   Свіжі правила програма бере зі знімка функції rules-sync; ця копія — на перший запуск без інтернету.
   Розбір — спільний з функцією (supabase/functions/rules-sync/parse.ts; Node 24 читає .ts сам). Запуск: node scripts/fetch-rules.mjs */
import { writeFileSync } from 'node:fs';
import { DEFAULT_SOURCES, FORUM, forumTopics, readTopic } from '../supabase/functions/rules-sync/parse.ts';

/* форум не навантажуємо: запити по одному з паузою */
const get = async u => {
  await new Promise(r => setTimeout(r, 250));
  const r = await fetch(new URL(u, FORUM), { headers: { 'User-Agent': 'Mozilla/5.0 Q-Hub rules sync' } });
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  return r.text();
};

const topics = [];
for (const src of DEFAULT_SOURCES) {
  for (const t of await forumTopics(get, src.url)) {
    if (topics.some(x => x.url.includes(t.url))) continue;
    const topic = await readTopic(get, t.url, t.section, src.kind);
    topics.push(topic);
    console.log(`${topic.items.length.toString().padStart(4)}  ${src.kind}  ${topic.section} / ${topic.title}`);
  }
}
writeFileSync('src/data/rules.json', JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), topics }, null, 0) + '\n');
console.log(`Тем: ${topics.length}, пунктів: ${topics.reduce((s, t) => s + t.items.length, 0)} → src/data/rules.json`);
