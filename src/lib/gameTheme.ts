/* тема «мапи для гри» (specs/021): темна — як було; світла — палітра specs/019. Кольори в мапі Hydra однакові
   і в текстурах (палітри export.json), і в «чистій мапі» (вершини .mesh: «/ r g b a») — тож світла тема
   перефарбовує обидві частини заміною кольору, без нового експорту з Hydra. Дороги, стежки, залізниця, мости — без змін */
import LIGHT_MAP from '../data/mapLight.json';
export type GameTheme = 'dark' | 'light';

/* темний -> світлий (src/data/mapLight.json — та сама таблиця для мапи сайту, specs/019, і для генератора світлих плиток
   scripts/map-light-tiles.cjs): земля #17181a, забудова #24262a, 14 рівнів моря (тло поза мапою = найглибше море #0a0e11);
   світлі назви — темнішими з тієї ж палітри назв, інакше на світлій землі вони не читаються (контраст 1,1–1,2:1);
   темна обводка назв (#0d0d0d — третина вершин names.zip, #191919) — світла, як земля: інакше темний текст у темній обводці
   зіллється. У самій мапі (base.zip) кольорів обводки немає — перевірено 2026-10-29 */
export const LIGHT: Record<string, string> = LIGHT_MAP;

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
