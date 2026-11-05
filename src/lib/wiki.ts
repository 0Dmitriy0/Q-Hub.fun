/* Довідник від гравців (specs/043): поля розділів, «було → стало», схожі назви, адреса з назви, перевірка форми.
   Білий список полів — той самий, що в базі (wiki_clean, 0057): що тут не описано, база не прийме. */

export type Section = 'job' | 'vehicle' | 'map_point';
export type FieldType = 'text' | 'longtext' | 'list' | 'int' | 'bool' | 'select';
export type Field = {
  key: string; label: string; type: FieldType; required?: boolean;
  min?: number; max?: number; maxLen?: number; options?: [string, string][]; hint?: string; nullable?: boolean;
};

const LIST = { type: 'list' as const, maxLen: 400, max: 30 };
export const FIELDS: Record<Section, Field[]> = {
  job: [
    { key: 'name', label: 'Назва', type: 'text', required: true, maxLen: 60 },
    { key: 'legal', label: 'Легальна', type: 'bool' },
    { key: 'level', label: 'З якого рівня', type: 'int', min: 0, max: 100 },
    { key: 'profit', label: 'Прибутковість (0–3)', type: 'int', min: 0, max: 3, hint: '0 — невідомо або мінімальна, 3 — найвища' },
    { key: 'description', label: 'Опис', type: 'longtext', maxLen: 3000 },
    { key: 'pay', label: 'Заробіток', type: 'text', maxLen: 300 },
    { key: 'requirements', label: 'Вимоги', ...LIST },
    { key: 'location', label: 'Де влаштуватися', ...LIST },
    { key: 'features', label: 'Особливості', ...LIST },
    { key: 'skills', label: 'Рівні навички', ...LIST },
    { key: 'progress', label: 'Прокачка навички', ...LIST },
    { key: 'controls', label: 'Керування', ...LIST },
    { key: 'tips', label: 'Поради', ...LIST },
  ],
  vehicle: [
    { key: 'name', label: 'Назва', type: 'text', required: true, maxLen: 80 },
    { key: 'real_name', label: 'Справжня назва', type: 'text', maxLen: 80 },
    { key: 'brand', label: 'Марка', type: 'text', maxLen: 80 },
    { key: 'salon', label: 'Салон', type: 'text', maxLen: 80 },
    { key: 'kind', label: 'Тип', type: 'select', required: true, options: [['auto', 'Авто'], ['moto', 'Мото'], ['avia', 'Авіа'], ['boat', 'Човен']] },
    { key: 'fuel', label: 'Двигун', type: 'select', options: [['petrol', 'Бензин'], ['diesel', 'Дизель'], ['electric', 'Електро']] },
    { key: 'currency', label: 'Валюта', type: 'select', options: [['game', 'Ігрова'], ['donate', 'Донат']] },
    { key: 'price', label: 'Державна вартість, $', type: 'int', min: 0 },
    { key: 'salon_price', label: 'Вартість у салоні', type: 'int', min: 0, nullable: true, hint: 'порожньо — не продається' },
    { key: 'min_level', label: 'Мінімальний рівень', type: 'int', min: 0, nullable: true },
    { key: 'speed', label: 'Макс. швидкість, км/год', type: 'int', min: 0, nullable: true },
    { key: 'seats', label: 'Місць (з водієм)', type: 'int', min: 0, nullable: true },
    { key: 'tank', label: 'Бак, л / батарея', type: 'int', min: 0, nullable: true },
    { key: 'trunk', label: 'Багажник, слотів', type: 'int', min: 0, nullable: true },
    { key: 'exclusive', label: 'Ексклюзив', type: 'bool' },
    { key: 'vinyl', label: 'Вініл', type: 'bool' },
  ],
  /* мітка на мапі (US5, 0059): поки лише нова; варіанти категорії підставляє мапа (categoryOptions) */
  map_point: [
    { key: 'category_id', label: 'Категорія', type: 'select', required: true, options: [] },
    { key: 'name', label: 'Назва', type: 'text', required: true, maxLen: 160 },
    { key: 'note', label: 'Опис', type: 'longtext', maxLen: 600, hint: 'Що тут: час появи, що потрібно, підказка, як знайти.' },
    { key: 'x', label: 'Точка X', type: 'int', required: true, min: -6000, max: 6800 },
    { key: 'y', label: 'Точка Y', type: 'int', required: true, min: -4400, max: 8500 },
  ],
};

export const SECTION_NAME: Record<Section, string> = { job: 'Роботи', vehicle: 'Транспорт', map_point: 'Мапа' };
export const SOURCES: [string, string][] = [['game', 'У грі'], ['discord', 'Discord'], ['forum', 'Форум QuantRP'], ['own', 'Власний досвід']];
export const REJECT_REASONS = ['Копія з іншого сайту', 'Немає джерела', 'Неправильні дані', 'Дубль', 'Порожня або образлива правка'];
export const STATUS: Record<string, [string, 'good' | 'warn' | 'bad' | '']> = {
  pending: ['на розгляді', 'warn'], accepted: ['прийнято', 'good'], accepted_edited: ['прийнято з правками', 'good'],
  rejected: ['відхилено', 'bad'], conflict: ['конфлікт — картку змінили', 'warn'], withdrawn: ['відкликано', ''],
};

export type Data = Record<string, unknown>;
const empty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
const same = (a: unknown, b: unknown) => (empty(a) && empty(b)) || JSON.stringify(a) === JSON.stringify(b);

/* лише змінені поля розділу — те, що піде в пропозицію */
export function diff(section: Section, old: Data, next: Data): Data {
  const out: Data = {};
  for (const f of FIELDS[section]) if (f.key in next && !same(old[f.key], next[f.key])) out[f.key] = next[f.key];
  return out;
}

/* рядки «було → стало» для показу; списки — додані й прибрані пункти окремо */
export type DiffRow = { key: string; label: string; before: unknown; after: unknown; added?: string[]; removed?: string[] };
export function diffRows(section: Section, old: Data, changes: Data): DiffRow[] {
  return FIELDS[section].filter(f => f.key in changes).map(f => {
    const row: DiffRow = { key: f.key, label: f.label, before: old[f.key], after: changes[f.key] };
    if (f.type === 'list') {
      const a = (old[f.key] as string[] | undefined) ?? [], b = (changes[f.key] as string[] | undefined) ?? [];
      row.added = b.filter(x => !a.includes(x)); row.removed = a.filter(x => !b.includes(x));
    }
    return row;
  });
}

export function show(f: Field | undefined, v: unknown): string {
  if (empty(v)) return '—';
  if (f?.type === 'bool') return v ? 'так' : 'ні';
  if (f?.type === 'select') return f.options?.find(([k]) => k === v)?.[1] ?? String(v);
  return Array.isArray(v) ? v.join('; ') : String(v);
}
export const field = (section: Section, key: string) => FIELDS[section].find(f => f.key === key);

/* схожі назви — щоб не плодити дублі (FR-006) */
const norm = (s: string) => s.toLowerCase().replace(/['’"«»`]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function similar(name: string, list: { id: string | number; name: string }[]) {
  const n = norm(name); if (n.length < 3) return [];
  const words = n.split(' ').filter(w => w.length >= 4);
  return list.filter(x => {
    const m = norm(x.name);
    if (!m) return false;
    if (m === n || m.includes(n) || n.includes(m)) return true;
    return words.some(w => m.split(' ').some(y => y.length >= 4 && (y.startsWith(w.slice(0, 5)) || w.startsWith(y.slice(0, 5)))));
  }).slice(0, 5);
}

/* адреса нової роботи з назви: транслітерація за КМУ 2010 → ^[a-z0-9-]{2,40}$ */
const TR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia',
  ы: 'y', э: 'e', ё: 'io', ъ: '',
};
export function slugFromName(name: string): string {
  const s = [...name.toLowerCase()].map(c => TR[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return s.length >= 2 ? s : '';
}

/* помилки форми до надсилання: { ключ: текст } */
export function validate(section: Section, data: Data, isNew: boolean): Record<string, string> {
  const err: Record<string, string> = {};
  for (const f of FIELDS[section]) {
    const v = data[f.key];
    if (isNew && f.required && empty(v)) { err[f.key] = `«${f.label}» — обов'язкове поле`; continue; }
    if (!(f.key in data) || (empty(v) && f.nullable)) continue;
    if (f.type === 'text' || f.type === 'longtext') {
      const s = String(v ?? '');
      if (f.required && !s.trim()) err[f.key] = `«${f.label}» не може бути порожньою`;
      else if (f.maxLen && s.length > f.maxLen) err[f.key] = `«${f.label}» — до ${f.maxLen} символів (зараз ${s.length})`;
    } else if (f.type === 'int') {
      const n = Number(v);
      if (empty(v) || !Number.isInteger(n)) err[f.key] = `«${f.label}» — ціле число`;
      else if (f.min !== undefined && n < f.min) err[f.key] = `«${f.label}» — не менше ${f.min}`;
      else if (f.max !== undefined && n > f.max) err[f.key] = `«${f.label}» — не більше ${f.max}`;
    } else if (f.type === 'list') {
      const a = (v as string[]) ?? [];
      if (f.max && a.length > f.max) err[f.key] = `«${f.label}» — до ${f.max} пунктів`;
      else { const long = a.find(x => x.length > (f.maxLen ?? 400)); if (long) err[f.key] = `Пункт «${long.slice(0, 30)}…» довший за ${f.maxLen} символів`; }
    }
  }
  if (section === 'job' && isNew && !/^[a-z0-9-]{2,40}$/.test(String(data.id ?? ''))) err.id = 'Адреса — лише латинські літери, цифри й дефіс, 2–40';
  return err;
}

/* текстові поля форми → значення для бази: списки — пункт на рядок, числа — з пробілами тисяч */
export function parseInput(f: Field, raw: string | boolean): unknown {
  if (f.type === 'bool') return !!raw;
  const s = String(raw);
  if (f.type === 'list') return s.split('\n').map(x => x.trim()).filter(Boolean);
  if (f.type === 'int') { const t = s.replace(/[\s,]/g, ''); if (!t) return f.nullable ? null : ''; return Number(t); }
  return s;
}
export function toInput(f: Field, v: unknown): string | boolean {
  if (f.type === 'bool') return !!v;
  if (f.type === 'list') return ((v as string[] | undefined) ?? []).join('\n');
  return v == null ? '' : String(v);
}

/* текст помилки бази: наші (QH0xx) — як є, решта — загальна */
export function dbError(e: { code?: string; message?: string } | null | undefined): string {
  if (!e) return '';
  if (e.code && /^QH0\d\d$/.test(e.code)) return e.message || 'Не вдалося.';
  if (/row-level|permission/i.test(e.message || '')) return 'Немає прав на цю дію — увійди через Discord.';
  return 'Не вдалося: ' + (e.message || 'невідома помилка');
}
