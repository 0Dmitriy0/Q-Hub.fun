/* Хто й коли заміряв заробіток роботи (specs/087): текст заробітку — частинами («Пшениця: …», «Рівень 3: …» чи довільний
   рядок); для кожної теперішньої частини шукаємо версію довідника (wiki_versions), де її текст став таким, як зараз.
   Зміни інших частин і полів роботи кредит не міняють; відкат до вже баченого тексту — кредит першої його появи.
   Чисті функції без мережі — тести в payCredits.test.ts */
export interface PayVersion { version_no: number; kind: string; author: string | null; decided_by: string | null; created_at: string; pay: string }
export interface PayPart {
  text: string; key: string;
  kind: 'seed' | 'proposal' | 'admin' | 'unknown';
  by: string | null; approvedBy: string | null; at: string | null; stale: boolean;
}
export const STALE_DAYS = 30;

/* той самий роздільник, що зводить частини в програмі (mergePay, specs/086) */
export const splitPay = (pay: string): string[] => String(pay ?? '').split(/\s+·\s+|\n+/).map(s => s.trim()).filter(Boolean);

export function partKey(part: string): string {
  const t = String(part ?? '').trim();
  const i = t.indexOf(':');
  return (i > 0 && i <= 40 ? t.slice(0, i) : t).trim().toLowerCase();
}

type Credit = Omit<PayPart, 'text' | 'key' | 'stale'>;
function creditOf(v: PayVersion): Credit {
  /* початкові дані: дата завантаження в довідник — лише для «давно»; на екрані дати не показуємо */
  if (v.kind === 'seed') return { kind: 'seed', by: null, approvedBy: null, at: v.created_at };
  if (v.kind === 'admin') return { kind: 'admin', by: v.decided_by ?? v.author, approvedBy: null, at: v.created_at };
  if (v.kind === 'accept') return { kind: 'proposal', by: v.author, approvedBy: v.decided_by && v.decided_by !== v.author ? v.decided_by : null, at: v.created_at };
  return { kind: 'unknown', by: v.author, approvedBy: null, at: v.created_at };
}

export function payCredits(versions: PayVersion[], currentPay: string, now = Date.now()): PayPart[] {
  const cur = splitPay(currentPay);
  const list = (Array.isArray(versions) ? versions : [])
    .filter(v => v && v.kind !== 'hide' && v.kind !== 'unhide' && Number.isFinite(v.version_no))
    .sort((a, b) => a.version_no - b.version_no);
  if (!cur.length) return [];
  /* історії немає зовсім — робота з початкових даних довідника (додана ще до історії версій) */
  if (!list.length) return cur.map(text => ({ text, key: partKey(text), kind: 'seed' as const, by: null, approvedBy: null, at: null, stale: false }));
  /* розбіжність: остання версія не збігається з показаним заробітком — підписів не показуємо */
  const last = splitPay(list[list.length - 1].pay);
  if (last.join(' · ') !== cur.join(' · ')) return [];

  const now_ = new Map<string, { text: string; credit: Credit }>();       // ключ → теперішній текст і його кредит
  const seen = new Map<string, Map<string, Credit>>();                     // ключ → текст → кредит першої появи
  for (const v of list) {
    for (const text of splitPay(v.pay)) {
      const key = partKey(text);
      const had = now_.get(key);
      if (had && had.text === text) continue;                              // частина не змінилась
      const texts = seen.get(key) ?? new Map<string, Credit>();
      const credit = texts.get(text) ?? creditOf(v);                       // повернулись до баченого — кредит першої появи
      texts.set(text, credit); seen.set(key, texts);
      now_.set(key, { text, credit });
    }
  }
  const limit = STALE_DAYS * 86_400_000;
  return cur.map(text => {
    const key = partKey(text);
    const c = now_.get(key)?.credit ?? { kind: 'unknown' as const, by: null, approvedBy: null, at: null };
    const t = c.at ? Date.parse(c.at) : NaN;
    /* «давно» — лише коли дата відома й старша за STALE_DAYS; без дати (робота без історії) — не позначаємо */
    return { text, key, ...c, stale: Number.isFinite(t) && now - t > limit };
  });
}
