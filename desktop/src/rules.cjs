/* Правила сервера й закони штату для плашки (specs/010 US4): знімок функції rules-sync з публічного бакета rules.
   Порядок: свіжий зі сховища → кеш у %APPDATA%\Q-Hub (rules.json + rules.json.etag) → вбудована копія (src/data/rules.json,
   її бере сама плашка, коли current() — null). Сервер відповідає «не змінилось» (ETag) — нічого не качаємо.
   Битий чи порожній знімок кеш не затирає. fetch передається — щоб тест не ходив у мережу. */
const fs = require('node:fs');
const path = require('node:path');

function createRules({ dir, url, fetch = globalThis.fetch }) {
  const file = path.join(dir, 'rules.json'), etagFile = path.join(dir, 'rules.json.etag');
  let snap;   // undefined — ще не читали кеш; null — кешу немає
  const valid = s => s && Array.isArray(s.topics) && s.topics.length > 0 && typeof s.fetched === 'string';
  function current() {
    if (snap === undefined) { try { const s = JSON.parse(fs.readFileSync(file, 'utf8')); snap = valid(s) ? s : null; } catch { snap = null; } }
    return snap;
  }
  /* → true, якщо знімок змінився (плашці — перечитати) */
  async function refresh() {
    let etag = ''; try { etag = fs.readFileSync(etagFile, 'utf8'); } catch { /* ще немає */ }
    const have = !!current();
    try {
      const r = await fetch(url, { headers: have && etag ? { 'If-None-Match': etag } : {} });
      if (r.status === 304 || !r.ok) return false;
      const text = await r.text();
      const s = JSON.parse(text);
      if (!valid(s)) return false;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, text);
      const e = r.headers.get('etag'); if (e) fs.writeFileSync(etagFile, e);
      snap = s;
      return true;
    } catch { return false; }   // без мережі чи битий JSON — лишається, що було
  }
  return { current, refresh };
}

module.exports = { createRules };
