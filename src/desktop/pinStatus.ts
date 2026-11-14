/* Стан мітки після Alt+F9 (specs/080): зелений — точку під хрестиком знайдено, червоний — ні, з причиною й підказкою,
   що зробити. Тон, заголовок і тексти — тут, щоб їх перевіряв тест; плашка лише малює (PinAsk, PinMiss у Bar.tsx).
   kind — код причини з головного процесу (locatePin у desktop/src/main.cjs), reason — готовий текст причини звідти ж. */
export type PinTone = 'ok' | 'bad';
export interface PinStatusIn { point?: { x: number; y: number } | null; player?: boolean; kind?: string | null; reason?: string; mapKey?: string }
export interface PinStatus { tone: PinTone; title: string; line: string; help: string }

const AGAIN = 'натисніть Alt+F9 ще раз.';
const TIPS: Record<string, string> = {
  no_map: `Відкрийте велику карту гри й ${AGAIN}`,
  zoom_in: `Наблизьте карту до 50–1500 м і ${AGAIN}`,
  zoom_out: `Віддаліть карту до 50–1500 м і ${AGAIN}`,
  unsure: `Поставте хрестик на чітке місце (дорога, будівля) і ${AGAIN}`,
  no_ref: `Зачекайте кілька секунд і ${AGAIN}`,
};
/* підказка дії за кодом причини; невідомий код чи помилка — просто спробувати ще раз */
export const pinTip = (kind?: string | null) => TIPS[kind || ''] || 'Натисніть Alt+F9 ще раз.';

export function pinStatus(a: PinStatusIn): PinStatus {
  if (a.point) {
    const line = `X ${a.point.x} · Y ${a.point.y}`;
    return a.player
      ? { tone: 'ok', title: 'Нова мітка на мапі', line, help: 'Вибери категорію й назви місце — модератор перевірить, і мітку побачать усі. Знімок бачить лише модератор.' }
      : { tone: 'ok', title: 'Точку знайдено', line, help: 'Вибери категорію — адміну буде простіше опублікувати мітку. Повернешся в гру, нічого не вибравши, — точка піде без категорії.' };
  }
  const line = `Причина: ${a.reason?.trim() || 'невідомо'}`;
  const tip = pinTip(a.kind);
  return a.player
    ? { tone: 'bad', title: 'Точку не знайдено', line, help: `Без точки мітку не надіслати. ${tip}${a.mapKey ? ` Або постав мітку на мапі програми — ${a.mapKey}.` : ''}` }
    : { tone: 'bad', title: 'Точку не знайдено', line, help: `Можна надіслати знімок без точки — її поставить адмін на сайті. Якщо на знімку не карта гри (чат, Discord), не надсилайте. ${tip}` };
}
