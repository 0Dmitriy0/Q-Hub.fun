/* типи pricescan.cjs для тестів сайту (src/lib/priceFixtures.test.ts) — програма їх не використовує */
export interface PickRow { buyer_id: string; item_id: number; price: number; score?: number; min: number; max: number }
export interface Sent { buyer_id: string; item_id: number; price: number }
export interface Picker {
  (buyer: string, rows: PickRow[], now: number): Sent[];
  confirmed: Set<number>;
  outside: { item_id: number; price: number; min: number; max: number }[];
}
export interface Cover { buyer: string; read: number; total: number; pending: number; shown: boolean }
export const OPEN_GAP: number;
export function pricePicker(every?: number): Picker;
export function coverage(gap?: number, showAfter?: number): {
  frame(buyer: string, total: number, seen: number[], confirmed: Set<number>, now: number): Cover | null;
  view(now: number): Cover | null;
};
