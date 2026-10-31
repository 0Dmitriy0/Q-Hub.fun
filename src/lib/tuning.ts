/* Тюнінг у грі: вартість кожного елемента — відсоток від держ. вартості транспорту
   (перевірено на Rune Lanes 300 000 $ і Karin Priu 150 000 $). Чіп DRIFT — фіксована ціна,
   чіп STAGE і ксенон купуються в гравців, тож їхню ціну вписує сам гравець. */
export const TUNING: [string, number][] = [
  ['Хамелеон', 15], ['Двигун', 10], ['Турбонадув', 10], ['Підвіска', 7], ['Автопілот', 6], ['Гальма', 6],
  ['Трансмісія', 6], ['Броня', 5], ['Ремені безпеки', 5], ['Тонування', 5], ['Колір диму від шин', 4], ['Неон', 4],
  ['Перламутр', 4], ['Пофарбування', 4], ['Номерний знак', 2], ['Клаксон', 1]
];
export const DRIFT_CHIP = 500000;
export const XENON_DEFAULT = 300000;

export const tuningCost = (gov: number, pct: number) => Math.round((gov * pct) / 100);

/* округлення «до парного», як у грі: 178,5 → 178, 195,5 → 196 */
function roundEven(x: number) {
  const f = Math.floor(x), d = x - f;
  if (Math.abs(d - 0.5) < 1e-9) return f % 2 === 0 ? f : f + 1;
  return Math.round(x);
}
/* максимальна швидкість з чіпом STAGE 1–4: +5 %, +10 %, +15 %, +20 % */
export const stageSpeeds = (speed: number) => [1, 2, 3, 4].map(k => roundEven(speed * (1 + 0.05 * k)));

/* групи елементів у калькуляторі й гаражі — щоб не шукати в довгому списку */
export const TUNING_GROUPS: { title: string; items: string[] }[] = [
  { title: 'Ходові', items: ['Двигун', 'Турбонадув', 'Трансмісія', 'Підвіска', 'Гальма'] },
  { title: 'Безпека й зручність', items: ['Броня', 'Ремені безпеки', 'Автопілот', 'Клаксон'] },
  { title: 'Вигляд', items: ['Хамелеон', 'Пофарбування', 'Перламутр', 'Тонування', 'Неон', 'Колір диму від шин', 'Номерний знак'] },
];
const PCT = new Map(TUNING);

/* що встановлено (cars.tuning у гаражі) або вибрано в калькуляторі; stage — рівень чіпа STAGE, 0 — без нього */
export interface TuneState { items: string[]; drift: boolean; stage: number; xenon: boolean }
export const emptyTune = (): TuneState => ({ items: [], drift: false, stage: 0, xenon: false });
/* cars.tuning — jsonb з будь-чим (старі записи — {}): лише відомі елементи й рівні 0–4 */
export function readTune(raw: unknown): TuneState {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<TuneState>;
  return {
    items: Array.isArray(o.items) ? o.items.filter(n => PCT.has(n)) : [],
    drift: o.drift === true, xenon: o.xenon === true,
    stage: Number.isInteger(o.stage) && o.stage! >= 0 && o.stage! <= 4 ? o.stage! : 0,
  };
}
/* вартість: елементи — від держ. вартості, DRIFT — фіксовано; STAGE і ксенон — ціна від гравців, якщо відома */
export function tuneTotal(gov: number, t: TuneState, prices: { stage?: number; xenon?: number } = {}) {
  return t.items.reduce((s, n) => s + tuningCost(gov, PCT.get(n) ?? 0), 0)
    + (t.drift ? DRIFT_CHIP : 0) + (t.stage ? prices.stage || 0 : 0) + (t.xenon ? prices.xenon || 0 : 0);
}
/* коротко для картки гаража: «Stage 2 · DRIFT · ксенон · 9 з 16» */
export function tuneSummary(t: TuneState) {
  return [t.stage ? `Stage ${t.stage}` : '', t.drift ? 'DRIFT' : '', t.xenon ? 'ксенон' : '', t.items.length ? `${t.items.length} з ${TUNING.length}` : '']
    .filter(Boolean).join(' · ');
}
