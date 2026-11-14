# Contract: `src/lib/payCredits.ts`

```ts
export interface PayVersion { version_no: number; kind: string; author: string | null; decided_by: string | null; created_at: string; pay: string }
export interface PayPart { text: string; key: string; kind: 'seed' | 'proposal' | 'admin' | 'unknown'; by: string | null; approvedBy: string | null; at: string | null; stale: boolean }

export function splitPay(pay: string): string[];             // ' · ' чи новий рядок; trim; без порожніх
export function partKey(part: string): string;               // до «:» у перших 40 знаках (lowercase, trim) або весь текст
export function payCredits(versions: PayVersion[], currentPay: string, now?: number): PayPart[];
export const STALE_DAYS = 30;
```

Гарантії: чисті функції; не кидають винятків; порядок результату — порядок частин у `currentPay`.

## Підпис у інтерфейсі (`src/components/wiki/PayBlock.tsx`)

| `kind` | Текст під частиною |
|---|---|
| `proposal` | `Заміряв <ім'я by> · <дата>` + ` · підтвердив <ім'я approvedBy>`, якщо є |
| `admin` | `Додав <ім'я by> · <дата>` |
| `seed` | `З початкових даних довідника` |
| `unknown` | (без підпису) |

`stale` → позначка «давно не перевіряли — заміряй таймером Q-Hub і запропонуй свіжу». Імена — `loadNames()`; немає — «гравець» / «модератор». Дата — день і місяць (+ рік, якщо не поточний).
