/* «Розширити межі» (specs/035 US3): ціна, яку програма впевнено прочитала поза межами скупника, → нові межі з запасом,
   щоб наступна зміна цін у грі не вийшла за них знову (власник 2026-11-01 ставив межі рівно на прочитані числа).
   Розширюється лише той край, за який вийшла ціна; межі ніколи не звужуються (FR-006) */
export const MARGIN = 0.1;

export function widen(min: number, max: number, price: number, margin = MARGIN): { min: number; max: number } {
  if (!(price > 0) || !(min > 0 && max > min)) return { min, max };
  if (price < min) return { min: Math.max(1, Math.floor(price * (1 - margin))), max };
  if (price > max) return { min, max: Math.ceil(price * (1 + margin)) };
  return { min, max };
}
