/* Черга чернеток міток (F9): спершу на диск, потім на сайт. Без інтернету чернетки лежать у теці й ідуть, щойно звʼязок
   з'явиться (конституція, принцип V). id чернетки створюється тут — повторна відправка на сервері не дає дубля.
   Тека: %APPDATA%\Q-Hub\drafts\<id>.jpg + <id>.json. Перевіряється outbox.test.cjs. */
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

/* send(draft, jpeg) → 'ok' | 'denied' | 'retry': ok і denied прибирають чернетку з черги, retry — лишає до наступного разу */
function outbox(dir, send) {
  fs.mkdirSync(dir, { recursive: true });
  let running = null;
  const ids = () => fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();
  const drop = id => { for (const ext of ['.json', '.jpg']) try { fs.unlinkSync(path.join(dir, id + ext)); } catch { /* уже немає */ } };

  async function run() {
    const out = { sent: 0, denied: 0, left: 0 };
    for (const id of ids()) {
      let draft, jpeg;
      try { draft = JSON.parse(fs.readFileSync(path.join(dir, id + '.json'), 'utf8')); jpeg = fs.readFileSync(path.join(dir, id + '.jpg')); }
      catch { drop(id); continue; }   // пошкоджений запис — не застрягати на ньому назавжди
      let r;
      try { r = await send(draft, jpeg); } catch { r = 'retry'; }
      if (r === 'ok') { drop(id); out.sent++; } else if (r === 'denied') { drop(id); out.denied++; } else out.left++;
    }
    return out;
  }

  return {
    dir,
    /* draft: { taken_at, x, y, match } → id; спершу знімок, потім опис — недописаний запис без .json flush не бачить */
    put(draft, jpeg) {
      const id = randomUUID();
      fs.writeFileSync(path.join(dir, id + '.jpg'), jpeg);
      fs.writeFileSync(path.join(dir, id + '.json'), JSON.stringify({ ...draft, id }));
      return id;
    },
    /* одна відправка за раз: другий виклик під час першої чекає її результату, а не шле ті самі чернетки вдруге */
    flush() {
      if (!running) running = run().finally(() => { running = null; });
      return running;
    },
    size: () => ids().length,
  };
}

/* клавіша мітки не має збігатися з клавішею плашки й навчальних знімків */
function pinKeyConflict(pin, barKey, shotKey) {
  const k = s => String(s || '').toLowerCase();
  if (!pin) return 'Оберіть клавішу.';
  if (k(pin) === k(barKey)) return `${pin} уже відкриває плашку — оберіть іншу клавішу.`;
  if (k(pin) === k(shotKey)) return `${pin} уже робить навчальний знімок — оберіть іншу клавішу.`;
  return null;
}

module.exports = { outbox, pinKeyConflict };
