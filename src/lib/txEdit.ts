import { parseMoney } from './format';
import type { Account } from './cats';

/* правка вже зробленого запису обліку (docs/ledger-edit-todo.md). Що можна міняти — за джерелом запису:
   переказ — лише суму й нотатку (обидві половини), запис угоди — усе, крім суми й типу (їх рахує угода).
   Ті самі правила — в editTx у desktop/src/main.cjs (правка помічником); міняєш тут — міняй і там */
export interface TxRow { source: string; type: 'in' | 'out'; amount: number; category: string; note: string; account?: Account }
export interface TxForm { type: 'in' | 'out'; amount: string; category: string; account: Account; note: string }
export type TxSet = Partial<Pick<TxRow, 'type' | 'amount' | 'category' | 'note' | 'account'>>;

export const txFields = (source: string) => ({
  type: source !== 'transfer' && source !== 'deal',
  amount: source !== 'deal',
  category: source !== 'transfer',
  account: source !== 'transfer'
});

/* форма з рядка — щоб відкрити правку з тими самими значеннями */
export const txForm = (t: TxRow): TxForm => ({ type: t.type, amount: String(t.amount), category: t.category, account: t.account ?? 'cash', note: t.note ?? '' });

/* лише змінені поля, які дозволено для цього джерела, і з обмеженнями бази (сума > 0, категорія ≤ 30, нотатка ≤ 200) */
export function txPatch(t: TxRow, f: TxForm): { set: TxSet } | { error: string } {
  const can = txFields(t.source), set: TxSet = {};
  if (can.amount) {
    const a = parseMoney(f.amount);
    if (!(a > 0)) return { error: 'Вкажи суму більше 0.' };
    if (a !== t.amount) set.amount = a;
  }
  if (can.type && f.type !== t.type) set.type = f.type;
  if (can.category) {
    const c = f.category.trim();
    if (!c) return { error: 'Обери категорію.' };
    if (c.length > 30) return { error: 'Категорія — до 30 символів.' };
    if (c !== t.category) set.category = c;
  }
  if (can.account && f.account !== (t.account ?? 'cash')) set.account = f.account;
  const n = f.note.trim();
  if (n.length > 200) return { error: 'Нотатка — до 200 символів.' };
  if (n !== (t.note ?? '')) set.note = n;
  return { set };
}
