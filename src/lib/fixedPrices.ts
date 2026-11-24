/* Скупник із фіксованими цінами (specs/096, міграція 0082): ціну ставить лише staff, таймера «до зміни цін», меж
   і голосів гравців немає. Поля читаються через select('*'), тож до застосування 0082 їх просто немає — скупник звичайний. */
export interface BuyerFlags { fixed_prices?: boolean | null; sale_limit?: number | string | null; sale_limit_unit?: string | null }

export const isFixed = (b: BuyerFlags | null | undefined) => !!b?.fixed_prices;

/* «5000 кг» або '' — коли ліміт не задано */
export function saleLimitText(b: BuyerFlags | null | undefined): string {
  const n = Number(b?.sale_limit);
  if (!b || b.sale_limit == null || !Number.isFinite(n) || n <= 0) return '';
  return `${n.toLocaleString('uk-UA')} ${b.sale_limit_unit || 'шт'}`;
}

/* що показувати в рядку ціни й у шапці скупника */
export function buyerView(b: BuyerFlags | null | undefined) {
  const fixed = isFixed(b);
  return {
    fixed,
    timer: !fixed,              // «Наступна зміна цін», поле «через скільки»
    limits: !fixed,             // межі мін–макс, положення, «перевір межі … розширити»
    pending: !fixed,            // «нова: X $ · k з N»
    /* кнопка «Оновити ціну» (вхід перевіряє сама сторінка). Фіксовану — нікому, і staff теж (власник 2026-11-25:
       «ціни тепер однакові, вони не змінюються»): staff ставить нову через «На екрані інша ціна → Поставити» */
    canUpdate: !fixed,
    chart: !fixed,              // графік 30 днів і розгорнута картка з історією
    stale: !fixed,              // «може бути застаріла»
    limit: saleLimitText(b),
  };
}
