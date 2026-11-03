/* Таймер ігрової сесії: програма бачить процес гри QuantRP (RAGE MP поверх GTA V) і пише сесію в game_sessions (разом з підсумком грошей сеансу, specs/044).
   Поки гра йде — раз на хвилину відсуває кінець сесії на LEASE уперед («оренда»): кабінет бачить «гра йде», поки кінець
   у майбутньому; гру закрито — кінець стає «зараз»; програма впала — оренда сама спливе за ≤ 2 хв. Залежності передаються ззовні, щоб логіку можна було перевірити тестом. */
const { execFile } = require('node:child_process');

const GAME = ['gta5.exe', 'gta5_enhanced.exe', 'ragemp_v.exe'];
const BEAT = 60e3;          // як часто оновлювати кінець сесії в базі
const MIN_SESSION = 60e3;   // коротші — перезапуск лаунчера, а не гра
const LEASE = 2 * BEAT;     // на скільки вперед пишеться кінець, поки гра йде

/* імена процесів Windows (нижній регістр) одним викликом tasklist */
function processes() {
  return new Promise(resolve => execFile('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true, maxBuffer: 8 << 20 }, (err, out) =>
    resolve(err ? null : new Set(out.split(/\r?\n/).map(l => (l.match(/^"([^"]+)"/) || [])[1]?.toLowerCase()).filter(Boolean)))));
}
/* коли запустився процес гри — щоб сесія, яку програма побачила пізніше, почалася вчасно */
function gameStart() {
  const names = GAME.map(n => n.replace(/\.exe$/, '')).join(',');
  return new Promise(resolve => execFile('powershell', ['-NoProfile', '-Command',
    `(Get-Process -Name ${names} -ErrorAction SilentlyContinue | Sort-Object StartTime | Select-Object -First 1).StartTime.ToUniversalTime().ToString('o')`],
  { windowsHide: true }, (err, out) => { const t = Date.parse(String(out).trim()); resolve(err || !t ? null : t); }));
}

const QUEUE_MAX = 200;      // стільки невідправлених підсумків тримаємо; старіші відкидаються

/* deps: running() → true/false/null (null — не вдалося перевірити), started() → ms|null, now() → ms, uuid() → id,
   character() → id|null, money(characterId) → поля money_* | null (specs/044; null — нічого не дописувати),
   db.write(row) → true|false — upsert рядка game_sessions за id (повтор не дає дубля), db.drop(id),
   load()/save(state) — що зараз відкрито (переживає перезапуск програми), changed() — повідомити вікна,
   loadQueue()/saveQueue(rows) — фінальні записи, які не вдалося відправити (без зв'язку; конституція V) */
function tracker(deps) {
  let cur = deps.load() || null, lastBeat = 0;
  /* стан 0.6 — без персонажа: сесія того, хто обраний зараз (гроші дописуються, лише якщо збігається) */
  if (cur && !cur.character) cur = { ...cur, character: deps.character() || null };
  /* сесію взято зі збереженого стану (програму перезапускали) і гру з того часу ще не бачили */
  let resumed = !!cur;
  const row = (c, ended) => ({
    id: c.id, character_id: c.character, started_at: new Date(c.started).toISOString(), ended_at: new Date(ended).toISOString(),
    ...(deps.money(c.character) || {}),
  });
  const write = async r => { try { return !!(await deps.db.write(r)); } catch { return false; } };
  async function flush() {
    const q = deps.loadQueue() || [];
    if (!q.length) return;
    const left = [];
    for (const r of q) if (!(await write(r))) left.push(r);
    if (left.length !== q.length) deps.saveQueue(left);
  }
  return async function tick() {
    const on = await deps.running();
    if (on === null) return cur;
    const now = deps.now();
    await flush();
    if (on) resumed = false;
    if (on && !cur) {
      const ch = deps.character(); if (!ch) return cur;
      const started = Math.min(now, (await deps.started()) || now);
      /* id — свій: сесія відкрита й без зв'язку, а запис до бази повторюється, доки не вдасться */
      cur = { id: deps.uuid(), character: ch, started, last: now };
      if (await write(row(cur, now + LEASE))) lastBeat = now;
      deps.save(cur); deps.changed(); return cur;
    }
    if (on && cur) {
      if (now - lastBeat >= BEAT) {
        cur = { ...cur, last: now }; deps.save(cur);
        if (await write(row(cur, now + LEASE))) lastBeat = now;
      }
      return cur;
    }
    if (!on && cur) {
      /* гру закрито: кінець — зараз; якщо гру закрили, поки програма не працювала, — остання відмітка */
      const end = resumed ? cur.last : now;
      resumed = false;
      if (end - cur.started < MIN_SESSION) { try { await deps.db.drop(cur.id); } catch { /* оренда сама спливе */ } }
      else {
        const r = row(cur, end);
        if (!(await write(r))) deps.saveQueue([...(deps.loadQueue() || []), r].slice(-QUEUE_MAX));
      }
      cur = null; deps.save(null); deps.changed();
    }
    return cur;
  };
}

/* рядок сесії без полів money_* — для бази без міграції 0049 */
const withoutMoney = row => Object.fromEntries(Object.entries(row).filter(([k]) => !k.startsWith('money_')));

module.exports = { tracker, processes, gameStart, withoutMoney, GAME, BEAT, MIN_SESSION, LEASE, QUEUE_MAX };
