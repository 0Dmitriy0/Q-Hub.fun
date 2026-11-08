/* Блоки гайду (WIKI → Гайди): перевірка перед надсиланням і порожній блок кожного типу для конструктора.
   Межі — ті самі, що в базі (wiki_guide_blocks_ok, 0065): що тут пройде, база прийме. Змінив межу — зміни й там. */
import type { GuideBlock } from '../data/guides';
import type { IconName } from '../components/Icon';

export type BlockKind = GuideBlock['k'];
export const LIMITS = { blocks: 80, text: 2000, heading: 120, items: 40, item: 600, cols: [2, 6], rows: 60, cell: 300, links: 12, label: 60, total: 60000 } as const;
/* іконки гайдів — той самий список, що wiki_guide_icons() у 0065 */
export const GUIDE_ICONS: IconName[] = ['book', 'star', 'shield', 'user', 'trophy', 'spark', 'box', 'jobs', 'car', 'moto', 'plane', 'boat', 'map', 'pin',
  'coin', 'chart', 'clock', 'bolt', 'fuel', 'tag', 'buyer', 'home', 'help', 'camera', 'layers', 'speed'];

/* назви типів — для кнопок конструктора й повідомлень */
export const KIND_NAME: Record<BlockKind, string> = { p: 'Абзац', h: 'Підзаголовок', list: 'Список', tip: 'Порада', warn: 'Увага', table: 'Таблиця', links: 'Посилання' };

export function emptyBlock(k: BlockKind): GuideBlock {
  switch (k) {
    case 'list': return { k, items: [''] };
    case 'table': return { k, head: ['', ''], rows: [['', '']] };
    case 'links': return { k, items: [{ to: '/wiki/', label: '' }] };
    default: return { k, text: '' };
  }
}

/* посилання — лише на сторінки сайту: «/wiki/roboty?job=farmer», «/mapa#…» */
export const LINK_RE = /^\/[A-Za-z0-9/_?=&%.,#~-]{0,200}$/;
export const linkOk = (to: string) => LINK_RE.test(to) && !to.startsWith('//');

const len = (s: string) => [...s].length;   // як char_length у Postgres — за символами, а не за UTF-16
const blank = (s: unknown) => typeof s !== 'string' || !s.trim();

/* перша проблема блоку людським текстом або '' */
export function blockError(b: GuideBlock, i: number): string {
  const at = `Блок ${i + 1} (${KIND_NAME[b.k] ?? '?'})`;
  switch (b.k) {
    case 'p': case 'tip': case 'warn': case 'h': {
      const max = b.k === 'h' ? LIMITS.heading : LIMITS.text;
      if (blank(b.text)) return `${at}: порожній — заповни або прибери`;
      if (len(b.text.trim()) > max) return `${at}: до ${max} символів (зараз ${len(b.text.trim())})`;
      return '';
    }
    case 'list':
      if (!b.items.length || b.items.length > LIMITS.items) return `${at}: від 1 до ${LIMITS.items} пунктів`;
      if (b.items.some(blank)) return `${at}: є порожній пункт — заповни або прибери`;
      if (b.items.some(x => len(x.trim()) > LIMITS.item)) return `${at}: пункт до ${LIMITS.item} символів`;
      return '';
    case 'table': {
      const n = b.head.length;
      if (n < LIMITS.cols[0] || n > LIMITS.cols[1]) return `${at}: від ${LIMITS.cols[0]} до ${LIMITS.cols[1]} стовпців`;
      if (b.head.some(blank)) return `${at}: у кожного стовпця має бути назва`;
      if (b.head.some(h => len(h.trim()) > 60)) return `${at}: назва стовпця до 60 символів`;
      if (!b.rows.length || b.rows.length > LIMITS.rows) return `${at}: від 1 до ${LIMITS.rows} рядків`;
      if (b.rows.some(r => r.length !== n)) return `${at}: у кожному рядку — ${n} клітинок`;
      if (b.rows.some(r => r.some(c => len(c) > LIMITS.cell))) return `${at}: клітинка до ${LIMITS.cell} символів`;
      return '';
    }
    case 'links':
      if (!b.items.length || b.items.length > LIMITS.links) return `${at}: від 1 до ${LIMITS.links} посилань`;
      if (b.items.some(l => blank(l.label) || len(l.label.trim()) > LIMITS.label)) return `${at}: у кожного посилання — назва до ${LIMITS.label} символів`;
      if (b.items.some(l => !linkOk(l.to))) return `${at}: лише сторінки сайту, наприклад /wiki/roboty?job=farmer`;
      return '';
    default:
      return `${at}: невідомий тип блоку`;
  }
}

export function blocksError(blocks: unknown): string {
  if (!Array.isArray(blocks) || !blocks.length) return 'Додай хоча б один блок тексту';
  if (blocks.length > LIMITS.blocks) return `Гайд — до ${LIMITS.blocks} блоків`;
  if (len(JSON.stringify(blocks)) > LIMITS.total) return 'Гайд завеликий — розбий його на два';
  for (let i = 0; i < blocks.length; i++) { const e = blockError(blocks[i] as GuideBlock, i); if (e) return e; }
  return '';
}

/* перед надсиланням і перевіркою: обрізати пробіли по краях, прибрати порожні пункти списку й незаповнені посилання
   (конструктор їх лишає, поки гравець пише) — без цього «було → стало» показувало б пробіли, а Enter у списку — помилку */
const untouchedLink = (l: { to: string; label: string }) => !l.label.trim() && ['', '/', '/wiki/', '/wiki'].includes(l.to.trim());
export function tidyBlocks(blocks: GuideBlock[]): GuideBlock[] {
  return blocks.map(b => {
    switch (b.k) {
      case 'list': return { k: 'list', items: b.items.map(x => x.trim()).filter(Boolean), ...(b.ordered ? { ordered: true } : {}) };
      case 'table': return { k: 'table', head: b.head.map(x => x.trim()), rows: b.rows.map(r => r.map(c => c.trim())) };
      case 'links': return { k: 'links', items: b.items.filter(l => !untouchedLink(l)).map(l => ({ to: l.to.trim(), label: l.label.trim() })) };
      default: return { k: b.k, text: b.text.trim() };
    }
  });
}
