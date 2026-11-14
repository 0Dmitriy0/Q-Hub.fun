/* легка розмітка відповідей ШІ й пунктів правил (specs/085): абзаци, списки, **жирне**.
   Лише розбір у дані — показ робить <Rich> у barParts.tsx React-вузлами, без HTML */
export type Span = { t: 'text' | 'bold'; v: string };
export type Block = { t: 'para'; spans: Span[] } | { t: 'list'; ordered: boolean; start: number; items: Span[][] };

/* маркер списку: «- », «• », «* » (саме зірочка з пробілом — «**жирне**» на початку рядка не список) чи «1. » / «1) » */
const BULLET = /^\s*(?:[-•]|\*(?!\*))\s+/;
const NUM = /^\s*\d{1,2}[.)]\s+/;

export function spans(s: string): Span[] {
  const out: Span[] = [];
  const re = /\*\*(?=\S)([^*]*?\S)\*\*/g;
  let at = 0;
  for (const m of s.matchAll(re)) {
    if (m.index! > at) out.push({ t: 'text', v: s.slice(at, m.index) });
    out.push({ t: 'bold', v: m[1] });
    at = m.index! + m[0].length;
  }
  if (at < s.length) out.push({ t: 'text', v: s.slice(at) });
  return out;
}

export function parseRich(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; start: number; items: string[] } | null = null;
  const flush = () => {
    if (para.length) blocks.push({ t: 'para', spans: spans(para.join('\n')) });
    if (list?.items.length) blocks.push({ t: 'list', ordered: list.ordered, start: list.start, items: list.items.map(spans) });
    para = []; list = null;
  };
  for (const raw of (text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/^\s*#{1,6}\s+/, '').trimEnd();
    if (!line.trim()) { flush(); continue; }
    if (/^\s*(?:[-•*]|\d{1,2}[.)])$/.test(line)) continue; // порожній пункт — сам маркер без тексту
    const b = BULLET.exec(line), n = b ? null : NUM.exec(line);
    if (b || n) {
      if (para.length) flush();
      if (!list) list = { ordered: !!n, start: n ? parseInt(n[0], 10) : 1, items: [] };
      const item = line.slice((b ?? n)![0].length).trim();
      if (item) list.items.push(item);
      continue;
    }
    if (list) flush();
    para.push(line.trim());
  }
  flush();
  return blocks;
}

/* для буфера (Discord, чат гри): без зірочок, пункти «• » / «N. », абзаци через порожній рядок */
export function plainText(text: string): string {
  const flat = (s: Span[]) => s.map(x => x.v).join('');
  return parseRich(text).map(b => b.t === 'para' ? flat(b.spans)
    : b.items.map((it, i) => (b.ordered ? `${b.start + i}. ` : '• ') + flat(it)).join('\n')).join('\n\n');
}
