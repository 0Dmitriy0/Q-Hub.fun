/* текст розділу інструкції (public.guides, specs/023) -> кроки: кроки розділені порожнім рядком;
   рядок «Знімок: https://…» — картинка до кроку, решта рядків — текст.
   specs/027: у «Як поставити» ще «Потрібно: назва | навіщо | посилання [| необов'язково]» — плитка «Що потрібно»,
   «Етап: назва» — заголовок етапу, крок з «Важливо:» — попередження. Без цих рядків інструкція читається як раніше */
export interface GuideStep { text: string; image: string | null; warn: boolean }
export interface GuideTile { name: string; why: string; url: string; optional: boolean; external: boolean }
export interface GuideStage { title: string; first: number; steps: GuideStep[] }

const NEED = /^\s*потрібно:\s*/i;
const STAGE = /^\s*етап:\s*/i;
const WARN = /^\s*важливо:\s*/i;

export function steps(text: string): GuideStep[] {
  return text.replace(/\r\n/g, '\n').split(/\n\s*\n/).map(block => {
    let image: string | null = null;
    const lines = block.split('\n').filter(line => {
      const m = /^\s*знімок:\s*(https:\/\/\S+)\s*$/i.exec(line);
      if (m) { image = m[1]; return false; }
      return true;
    });
    const body = lines.join('\n').trim(), warn = WARN.test(body);
    return { text: warn ? body.replace(WARN, '') : body, image, warn };
  }).filter(s => s.text || s.image);
}

/* посилання плитки: https://… або сторінка сайту (/mapa?game=1) */
export const tileUrlOk = (u: string) => /^https:\/\/\S+$/.test(u) || /^\/(?!\/)\S*$/.test(u);

function tile(line: string): GuideTile | null {
  const [name = '', why = '', url = '', opt = ''] = line.replace(NEED, '').split('|').map(s => s.trim());
  if (!name || !tileUrlOk(url)) return null;
  return { name, why, url, optional: /^необов/i.test(opt), external: url.startsWith('https://') };
}

/* «Як поставити»: плитки, етапи й кроки з наскрізною нумерацією (first — номер першого кроку етапу, з 1).
   Кроки до першого «Етап:» — етап без назви, тож інструкція без етапів — один список, як раніше */
export function guide(text: string): { tiles: GuideTile[]; stages: GuideStage[] } {
  const tiles: GuideTile[] = [], stages: GuideStage[] = [{ title: '', first: 1, steps: [] }];
  const rest = text.replace(/\r\n/g, '\n').split('\n').filter(line => {
    if (!NEED.test(line)) return true;
    const t = tile(line); if (t) tiles.push(t);
    return false;
  }).join('\n');
  let n = 1;
  for (const block of rest.split(/\n\s*\n/)) {
    const lines = block.trim().split('\n');
    if (STAGE.test(lines[0])) {
      stages.push({ title: lines[0].replace(STAGE, '').trim(), first: n, steps: [] });
      lines.shift();
    }
    const s = steps(lines.join('\n'));
    stages[stages.length - 1].steps.push(...s);
    n += s.length;
  }
  return { tiles, stages: stages.filter(s => s.steps.length) };
}

/* для форми адміна: рядки плиток окремо (без «Потрібно:»), решта тексту — окремо; join — назад у один текст */
export function splitTiles(text: string): { tiles: string; rest: string } {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  return {
    tiles: lines.filter(l => NEED.test(l)).map(l => l.replace(NEED, '')).join('\n'),
    rest: lines.filter(l => !NEED.test(l)).join('\n').replace(/^\s*\n/, ''),
  };
}
export function joinTiles(tiles: string, rest: string): string {
  const t = tiles.split('\n').map(l => l.trim()).filter(Boolean).map(l => 'Потрібно: ' + l);
  return t.length ? t.join('\n') + '\n\n' + rest.trim() : rest.trim();
}
/* помилка в рядку плитки — для форми адміна; null — усе гаразд */
export function tileError(tiles: string): string | null {
  for (const l of tiles.split('\n').map(x => x.trim()).filter(Boolean)) {
    const [name = '', , url = ''] = l.split('|').map(s => s.trim());
    if (!name) return `Плитка «${l}»: спершу назва, потім «|».`;
    if (!tileUrlOk(url)) return `Плитка «${name}»: посилання має починатися з https:// або бути сторінкою сайту (/mapa…).`;
  }
  return null;
}

/* шматки тексту кроку: адреса https://…, шлях з «\» (GTAV\update) — з кнопкою «Копіювати», [Кнопка] програми */
export type Piece = { k: 'text' | 'url' | 'path' | 'btn'; v: string };
const TOKEN = /(https:\/\/[^\s«»"<>]+)|((?:[\w.-]+\\)+[\w.-]*[\w-])|\[([^\]\n]{1,40})\]/g;
export function pieces(text: string): Piece[] {
  const out: Piece[] = [];
  let at = 0;
  for (const m of text.matchAll(TOKEN)) {
    let v = m[0], end = m.index! + v.length;
    if (m[1]) { const tail = /[.,;:!?)]+$/.exec(v); if (tail) { v = v.slice(0, -tail[0].length); end -= tail[0].length; } }
    if (m.index! > at) out.push({ k: 'text', v: text.slice(at, m.index) });
    out.push(m[1] ? { k: 'url', v } : m[2] ? { k: 'path', v } : { k: 'btn', v: m[3] });
    at = end;
  }
  if (at < text.length) out.push({ k: 'text', v: text.slice(at) });
  return out;
}

/* версія кроків для позначок «зроблено»: адмін змінив кроки — старі позначки не ставляться не на ті кроки */
export function version(text: string): string {
  let h = 0;
  for (const s of guide(text).stages.flatMap(x => x.steps)) for (const ch of s.text + '\u0000') h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}
