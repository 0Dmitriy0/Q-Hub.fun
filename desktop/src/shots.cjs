/* Навчальні скріншоти гри (етап «зір програми»): гравець тисне Alt+S, програма знімає екран і просить позначити,
   що на ньому. З таких прикладів потім будується розпізнавання тригерів (вікно скупника, чек продажу, банк…).
   Знімки лежать локально: %APPDATA%\Q-Hub\shots\<час>.png + <час>.json з позначкою. */
const fs = require('node:fs');
const path = require('node:path');

const LABELS = { buyer: 'Вікно скупника', sell: 'Продаж / чек', buy: 'Купівля', bank: 'Банк / баланс', job: 'Зарплата / робота', other: 'Інше' };

/* «2026-10-23_05-12-07» — за місцевим часом, сортується як рядок */
function stamp(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

/* повноекранний DirectX часто дає чорний кадр: беремо кожен n-й піксель BGRA і дивимось на середню яскравість */
function isBlack(bgra, step = 997) {
  let sum = 0, n = 0;
  for (let i = 0; i + 2 < bgra.length; i += step * 4) { sum += bgra[i] + bgra[i + 1] + bgra[i + 2]; n++; }
  return !n || sum / (n * 3) < 6;
}

function store(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return {
    dir,
    save(png, at = new Date()) {
      let name = stamp(at), i = 1;
      while (fs.existsSync(path.join(dir, name + '.png'))) name = `${stamp(at)}_${++i}`;
      fs.writeFileSync(path.join(dir, name + '.png'), png);
      return name;
    },
    label(name, label, note = '') {
      if (!/^[\d_-]+$/.test(name) || !LABELS[label]) return false;
      if (!fs.existsSync(path.join(dir, name + '.png'))) return false;
      fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify({ label, note: String(note).slice(0, 200), at: new Date().toISOString() }, null, 2));
      return true;
    },
    /* скільки знімків кожного типу вже є; unlabeled — без позначки */
    stats() {
      const out = Object.fromEntries(Object.keys(LABELS).map(k => [k, 0])); out.unlabeled = 0;
      for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.png'))) {
        try { out[JSON.parse(fs.readFileSync(path.join(dir, f.replace(/\.png$/, '.json')), 'utf8')).label]++; } catch { out.unlabeled++; }
      }
      return out;
    },
  };
}

module.exports = { LABELS, stamp, isBlack, store };
