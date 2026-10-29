/* тема «мапи для гри» (specs/021): темна — як було; світла — палітра specs/019. Кольори в мапі Hydra однакові
   і в текстурах (палітри export.json), і в «чистій мапі» (вершини .mesh: «/ r g b a») — тож світла тема
   перефарбовує обидві частини заміною кольору, без нового експорту з Hydra. Дороги, стежки, залізниця, мости — без змін */
export type GameTheme = 'dark' | 'light';

const SEA_DARK = ['#0a0e11', '#0c1013', '#0d1316', '#0f161a', '#12181d', '#141c21', '#161f24', '#192228', '#1b252c', '#1d2930', '#1e2a31', '#202c34', '#222f38', '#25333c'];
const SEA_LIGHT = ['#8fb3cc', '#92b6ce', '#96b8d0', '#99bbd2', '#9dbdd4', '#a0c0d6', '#a4c2d8', '#a7c5da', '#abc7dc', '#aecade', '#b2cce0', '#b5cfe2', '#b9d1e4', '#bcd4e6'];

/* темний -> світлий: земля, забудова, море (тло поза мапою = найглибше море); світлі назви — темнішими з тієї ж палітри назв,
   інакше на світлій землі вони не читаються (контраст 1,1–1,2:1, specs/019) */
export const LIGHT: Record<string, string> = {
  '#17181a': '#f3f4f6', '#24262a': '#d9dee5',
  ...Object.fromEntries(SEA_DARK.map((c, i) => [c, SEA_LIGHT[i]])),
  '#ffffff': '#111111', '#dbffe9': '#1d512c', '#a9dbda': '#0a2d36', '#90e8fe': '#0058e6', '#fffb7a': '#7b7731', '#fc71fe': '#3f1c40',
  /* темна обводка назв (#0d0d0d — третина вершин names.zip) — світла, як земля: інакше темний текст у темній обводці зіллється.
     У самій мапі (base.zip) цих кольорів немає — перевірено 2026-10-29 */
  '#0d0d0d': '#f3f4f6', '#191919': '#f3f4f6',
};

export const recolor = (hex: string, theme: GameTheme) => (theme === 'light' ? LIGHT[hex.toLowerCase()] ?? hex : hex);
export const themed = (palette: string[], theme: GameTheme) => palette.map(c => recolor(c, theme));

const toHex = (n: number) => n.toString(16).padStart(2, '0');
/* кольори вершин у тексті .mesh («x y z / r g b a»); темна тема — текст без змін */
export function recolorMesh(text: string, theme: GameTheme): string {
  if (theme !== 'light') return text;
  return text.replace(/\/ (\d{1,3}) (\d{1,3}) (\d{1,3}) (\d{1,3})/g, (m, r, g, b, a) => {
    const to = LIGHT[`#${toHex(+r)}${toHex(+g)}${toHex(+b)}`];
    if (!to) return m;
    return `/ ${parseInt(to.slice(1, 3), 16)} ${parseInt(to.slice(3, 5), 16)} ${parseInt(to.slice(5, 7), 16)} ${a}`;
  });
}
