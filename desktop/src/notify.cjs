/* Сповіщення Windows (specs/075–077 і оновлення програми). Об'єкт Notification тримаємо, доки сповіщення не закрили:
   без посилання збирач сміття прибирає його разом з обробником кліку — сповіщення видно, а клік нічого не робить.
   Через HOLD відпускаємо самі: у центрі сповіщень Windows воно може лежати днями, і подія «закрито» не прийде.
   Notification передається ззовні, щоб перевірити тестом без Electron. */
const HOLD = 10 * 60e3;

function createNotifier({ Notification, icon, hold = HOLD }) {
  const live = new Set();
  /* note: { title, body }; onClick — що відкрити. false — Windows сповіщень не підтримує */
  function notify(note, onClick) {
    if (!note || !Notification.isSupported()) return false;
    const n = new Notification({ title: String(note.title), body: String(note.body || ''), icon });
    let timer = null;
    const drop = () => { clearTimeout(timer); live.delete(n); };
    n.on('click', () => { drop(); try { onClick?.(); } catch { /* вікно вже закрили */ } });
    n.on('close', drop);
    n.on('failed', drop);
    live.add(n);
    timer = setTimeout(drop, hold);
    timer.unref?.();
    n.show();
    return true;
  }
  return { notify, size: () => live.size };
}

module.exports = { createNotifier, HOLD };
