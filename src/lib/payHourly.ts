/* Заробіток за годину з тексту «Заробіток» роботи (редизайн 2026-11-15): щоб показати графік замість абзацу.
   Тексти пишуть люди, тож шукаємо лише явне «… $ за годину» / «$/год»: «≈50 000–75 000$ за годину», «Рівень 1: ≈132 200 $/год»,
   «Апельсини — ≈150 000$ за годину». Нічого не знайшли — порожньо, і вікно показує просто текст (нічого не вигадуємо). */
export interface HourlyRate { label: string; min: number; max: number }

const num = (s: string) => Number(s.replace(/[^\d]/g, ''));
/* сума (чи «від–до»), далі $ і «за годину» чи «/год»; між ними може бути «чистими» */
const RATE = /≈?\s*(\d[\d\s  ]*\d|\d)\s*(?:\$\s*)?(?:[–—-]\s*≈?\s*(\d[\d\s  ]*\d|\d)\s*)?\$\s*(?:чистими\s*)?(?:за\s+годину|\/\s*год)/giu;

/* підпис рядка — з тексту поруч із сумою: «Апельсини — ≈…», «шкури — ще ≈…» (перед сумою); «Рівень 1: ≈…» чи «≈… за годину
   на 4 рівні» → «4 рівень»; «легально/нелегально» після суми */
const LVL = /рів(?:ень|ні)\s*(\d{1,3})|(\d{1,3})\s*рів(?:ні|ень|ня)/iu;
function labelOf(before: string, after: string): string {
  const head = /([А-ЯІЇЄҐа-яіїєґ'’ ]{3,28}?)\s*[—:–]\s*(?:ще\s*)?$/u.exec(before);
  if (head && !/^\s*рівень\s*$/iu.test(head[1])) return head[1].trim().replace(/^./u, c => c.toUpperCase());
  const lvl = LVL.exec(before.slice(-14)) || LVL.exec(after);
  if (lvl) return `${lvl[1] || lvl[2]} рівень`;
  const legal = /^\s*(не)?легально/iu.exec(after);   // лише одразу після суми: далі може йти вже інша сума
  if (legal) return legal[1] ? 'нелегально' : 'легально';
  return '';
}

export function hourlyRates(pay: string): HourlyRate[] {
  const out: HourlyRate[] = [];
  for (const part of String(pay || '').split(/\s·\s|\r?\n|(?<=[.!?])\s+(?=[A-ZА-ЯІЇЄҐ«])/u)) {
    let prev = 0;
    for (const m of part.matchAll(RATE)) {
      const before = part.slice(prev, m.index), after = part.slice(m.index! + m[0].length, m.index! + m[0].length + 40);
      prev = m.index! + m[0].length;
      const a = num(m[1]), b = m[2] ? num(m[2]) : a;
      if (!a || a < 1000 || a > 10_000_000) continue;   // «12$ за штуку» чи помилка — не годинний заробіток
      out.push({ label: labelOf(before, after), min: Math.min(a, b), max: Math.max(a, b) });
    }
  }
  return out;
}

/* одне число для картки й сортування: найбільше «до» серед знайдених */
export const hourlyTop = (pay: string) => hourlyRates(pay).reduce((m, r) => Math.max(m, r.max), 0);

/* «≈120 тис.» / «≈50–75 тис.» — коротко для картки */
export function shortK(min: number, max: number): string {
  const k = (n: number) => (n >= 1_000_000 ? (n / 1_000_000).toFixed(1).replace('.0', '') + ' млн' : Math.round(n / 1000) + ' тис.');
  if (min === max) return '≈' + k(max);
  const a = k(min), b = k(max);
  return '≈' + (a.endsWith(' тис.') && b.endsWith(' тис.') ? a.replace(' тис.', '') + '–' + b : a + '–' + b);
}
