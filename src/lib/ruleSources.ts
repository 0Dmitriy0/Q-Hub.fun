/* Джерела правил для адміна (specs/010 US3): адреса розділу чи теми форуму QuantRP → як її зберігає база (0039).
   Та сама перевірка, що й check у базі; тут — щоб помилку було видно одразу, українською */
export type RuleKind = 'rules' | 'law' | 'order' | 'info';
export const KINDS: [RuleKind, string][] = [['rules', 'Правила сервера'], ['law', 'Закон штату'], ['order', 'Наказ організації'], ['info', 'Довідка (F.A.Q.)']];
export const SOURCE_URL = /^https:\/\/forum\.quant5\.com\.ua\/index\.php\?\/(forum|topic)\/[^\s"'<>]+$/;

/* посилання з браузера (закодоване «%D0%BF…», без «/» у кінці, з #коментарем чи /page/2) → одна форма, щоб не було дублів */
export function normalizeSourceUrl(raw: string): { url: string } | { error: string } {
  let s = raw.trim();
  try { s = decodeURI(s); } catch { /* недійсне кодування — перевірка нижче відмовить */ }
  s = s.replace(/#.*$/, '').replace(/\/page\/\d+\/?$/, '').replace(/\/+$/, '') + '/';
  if (!SOURCE_URL.test(s)) return { error: 'Потрібне посилання на розділ чи тему форуму сервера: https://forum.quant5.com.ua/index.php?/forum/… або …/topic/…' };
  return { url: s };
}

/* різниця останнього оновлення — коротко для таблиці */
export function diffText(d: { added: number; changed: number; removed: number } | null): string {
  if (!d) return '—';
  const p = [d.added && `+${d.added}`, d.changed && `змінено ${d.changed}`, d.removed && `−${d.removed}`].filter(Boolean);
  return p.length ? p.join(' · ') : 'без змін';
}
