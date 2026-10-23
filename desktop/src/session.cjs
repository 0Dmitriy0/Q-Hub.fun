/* Таймер ігрової сесії: програма бачить процес гри QuantRP (RAGE MP поверх GTA V) і пише сесію в game_sessions.
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

/* deps: running() → true/false/null (null — не вдалося перевірити), started() → ms|null, now() → ms,
   db.start(characterId, startedMs, endedMs) → id, db.beat(id, endedMs), db.drop(id), character() → id|null,
   load()/save(state) — що зараз відкрито (переживає перезапуск програми), changed() — повідомити вікна */
function tracker(deps) {
  let cur = deps.load() || null, lastBeat = 0;
  /* сесію взято зі збереженого стану (програму перезапускали) і гру з того часу ще не бачили */
  let resumed = !!cur;
  return async function tick() {
    const on = await deps.running();
    if (on === null) return cur;
    const now = deps.now();
    if (on) resumed = false;
    if (on && !cur) {
      const ch = deps.character(); if (!ch) return cur;
      const started = Math.min(now, (await deps.started()) || now);
      const id = await deps.db.start(ch, started, now + LEASE);
      if (!id) return cur;
      cur = { id, started, last: now }; lastBeat = now; deps.save(cur); deps.changed(); return cur;
    }
    if (on && cur) {
      if (now - lastBeat >= BEAT) { await deps.db.beat(cur.id, now + LEASE); lastBeat = now; cur = { ...cur, last: now }; deps.save(cur); }
      return cur;
    }
    if (!on && cur) {
      /* гру закрито: кінець — зараз; якщо гру закрили, поки програма не працювала, — остання відмітка */
      const end = resumed ? cur.last : now;
      resumed = false;
      if (end - cur.started < MIN_SESSION) await deps.db.drop(cur.id); else await deps.db.beat(cur.id, end);
      cur = null; deps.save(null); deps.changed();
    }
    return cur;
  };
}

module.exports = { tracker, processes, gameStart, GAME, BEAT, MIN_SESSION, LEASE };
