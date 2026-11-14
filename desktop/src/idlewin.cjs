/* Приховані вікна (мапа, таймер, «Окремо») тримають пам'ять, доки програма працює: кожне — окремий процес на ~50–140 МБ.
   Тож вікно, яке давно сховане, закриваємо; наступне відкриття створить його знову (стан живе в головному процесі).
   Чиста логіка без Electron — перевіряється idlewin.test.cjs. */
const TTL_MS = 10 * 60 * 1000;

function createIdle(ttl = TTL_MS) {
  const since = new Map();   // вікно → відколи сховане
  return {
    /* опитується раз на хвилину. exists — вікно створене; visible — його видно; keep — ще потрібне (є що показати).
       true — пора закрити: сховане й непотрібне не менше ttl поспіль */
    due(key, { exists, visible, keep = false }, now) {
      if (!exists || visible || keep) { since.delete(key); return false; }
      if (!since.has(key)) { since.set(key, now); return false; }
      if (now - since.get(key) < ttl) return false;
      since.delete(key);
      return true;
    },
  };
}

module.exports = { createIdle, TTL_MS };
