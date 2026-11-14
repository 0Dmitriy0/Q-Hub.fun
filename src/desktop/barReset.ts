/* Нове відкриття Alt+Q (specs/082): плашка — як перше відкриття сесії, без минулих відповідей (вони в «Історії»).
   Лишається лише відповідь ШІ, що прийшла, поки плашку не бачили (unseen), — і вже без цієї позначки. */
export function freshAsks<T extends { unseen?: boolean }>(asks: T[]): T[] {
  return asks.filter(a => a.unseen === true).map(a => { const { unseen: _seen, ...rest } = a; return rest as T; });
}
