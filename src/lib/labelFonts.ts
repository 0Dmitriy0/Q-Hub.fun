/* Шрифти для написів на мапі (specs/089): відібрані Google Fonts з кирилицею (перевірено в Fontsource 2026-11-16).
   Файли — з Fontsource CDN (дзеркало Google Fonts, CORS «*»); у базі — id (map_labels.font) і товщина (weight). */
export type LabelFont = { id: string; name: string; weights: number[] };

export const LABEL_FONTS: LabelFont[] = [
  { id: 'roboto-condensed', name: 'Roboto Condensed', weights: [400, 500, 700, 900] },
  { id: 'oswald', name: 'Oswald', weights: [400, 500, 600, 700] },
  { id: 'montserrat', name: 'Montserrat', weights: [400, 600, 700, 900] },
  { id: 'rubik', name: 'Rubik', weights: [400, 500, 700, 900] },
  { id: 'jost', name: 'Jost', weights: [400, 500, 700, 900] },
  { id: 'manrope', name: 'Manrope', weights: [400, 600, 800] },
  { id: 'exo-2', name: 'Exo 2', weights: [400, 600, 800] },
  { id: 'unbounded', name: 'Unbounded', weights: [400, 600, 800] },
  { id: 'russo-one', name: 'Russo One', weights: [400] },
  { id: 'pt-sans-narrow', name: 'PT Sans Narrow', weights: [400, 700] },
  { id: 'ubuntu', name: 'Ubuntu', weights: [400, 500, 700] },
  { id: 'play', name: 'Play', weights: [400, 700] },
  { id: 'jura', name: 'Jura', weights: [400, 700] },
  { id: 'comfortaa', name: 'Comfortaa', weights: [400, 700] },
  { id: 'philosopher', name: 'Philosopher', weights: [400, 700] },
  { id: 'roboto-slab', name: 'Roboto Slab', weights: [400, 700, 900] },
  { id: 'kelly-slab', name: 'Kelly Slab', weights: [400] },
  { id: 'yeseva-one', name: 'Yeseva One', weights: [400] },
  { id: 'alice', name: 'Alice', weights: [400] },
  { id: 'seymour-one', name: 'Seymour One', weights: [400] },
  { id: 'ruslan-display', name: 'Ruslan Display', weights: [400] },
  { id: 'press-start-2p', name: 'Press Start 2P', weights: [400] },
  { id: 'lobster', name: 'Lobster', weights: [400] },
  { id: 'pacifico', name: 'Pacifico', weights: [400] },
  { id: 'caveat', name: 'Caveat', weights: [400, 700] },
  { id: 'marck-script', name: 'Marck Script', weights: [400] },
  { id: 'neucha', name: 'Neucha', weights: [400] },
];
export const FONT_BY_ID: Record<string, LabelFont> = Object.fromEntries(LABEL_FONTS.map(f => [f.id, f]));
export const DEFAULT_FONT = 'roboto-condensed';

/* найближча доступна товщина шрифту (у базі могла лишитись товщина, якої в шрифту немає) */
export function fontWeight(id: string, weight: number): number {
  const ws = FONT_BY_ID[id]?.weights ?? [400];
  return ws.reduce((b, w) => (Math.abs(w - weight) < Math.abs(b - weight) ? w : b), ws[0]);
}

const SUBSETS = {
  latin: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
  cyrillic: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116',
} as const;
export const fontUrl = (id: string, subset: keyof typeof SUBSETS, weight: number) =>
  `https://cdn.jsdelivr.net/fontsource/fonts/${id}@latest/${subset}-${weight}-normal.woff2`;
/* ім'я сімейства для canvas: своє, щоб не зачепити шрифти сайту */
export const fontFamily = (id: string) => `QL-${id}`;
/* рядок ctx.font; товщина — саме вибрана: якщо файлу такої товщини в шрифту немає, браузер домальовує жирний сам
   (завантажується найближчий файл — loadLabelFont). Шрифт не завантажився — запасний sans-serif */
export const fontCss = (id: string, weight: number, px: number) => `${weight} ${px}px "${fontFamily(id)}", sans-serif`;

/* «Жирний» у формі напису: три кроки товщини (specs/089) */
export const BOLD_STEPS: [number, string][] = [[400, 'Звичайний'], [700, 'Жирний'], [900, 'Дуже жирний']];
export const boldStep = (weight: number) => (weight >= 800 ? 900 : weight >= 600 ? 700 : 400);

const loading = new Map<string, Promise<boolean>>();
/* завантажити шрифт (latin + cyrillic) — true, коли готовий; false — не вдалося (немає інтернету, тайм-аут) */
export function loadLabelFont(id: string, weight: number, timeoutMs = 6000): Promise<boolean> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined' || !FONT_BY_ID[id]) return Promise.resolve(false);
  const w = fontWeight(id, weight), key = `${id}:${w}`;
  let p = loading.get(key);
  if (!p) {
    const faces = (Object.keys(SUBSETS) as (keyof typeof SUBSETS)[]).map(s =>
      new FontFace(fontFamily(id), `url(${fontUrl(id, s, w)}) format('woff2')`, { weight: String(w), unicodeRange: SUBSETS[s], display: 'swap' }));
    const all = Promise.all(faces.map(f => f.load().then(ff => { document.fonts.add(ff); })));
    p = Promise.race([all.then(() => true), new Promise<boolean>(r => setTimeout(() => r(false), timeoutMs))]).catch(() => false);
    p.then(ok => { if (!ok) loading.delete(key); });   // не вдалося — наступного разу спробуємо знову
    loading.set(key, p);
  }
  return p;
}
