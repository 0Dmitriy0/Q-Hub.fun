// Значки категорій «є в грі» (specs/015): у манері міток карти GTA — темний силует з білою обводкою, без кружечка.
// Малюнки власні (FR-006): спільна з грою лише ідея образу (футболка, ножиці, кошик…), не сам малюнок.
// Кожен значок — фігури S (силует з обводкою) і деталі D (лінії й точки поверх). Як на карті гри: більшість — темні з білою
// обводкою (магазини, одяг, бари); тип, який гра фарбує, — кольоровий з темною обводкою (c — колір, dc — колір деталей).
// Запуск: node scripts/map-blips.mjs → public/icons/map/game/<id>.svg
import { mkdirSync, writeFileSync } from 'node:fs';

const DARK = '#15171b', HALO = '#ffffff', HALO_W = 3.2;
/* f — залита фігура, l — лінія товщини w; d — біла деталь (fill або лінія) */
const f = el => ({ el, w: 0 });
const l = (el, w) => ({ el, w });
/* шестерня з n зубцями */
const gear = (cx, cy, R, r, n) => 'M' + Array.from({ length: n * 4 }, (_, i) => { const a = (i / (n * 4)) * 2 * Math.PI - Math.PI / 2, q = i % 4 < 2 ? R : r; return `${(cx + q * Math.cos(a)).toFixed(2)} ${(cy + q * Math.sin(a)).toFixed(2)}`; }).join('L') + 'Z';
const star = (cx, cy, R, r) => Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r : R; return `${(cx + q * Math.cos(a)).toFixed(2)},${(cy + q * Math.sin(a)).toFixed(2)}`; }).join(' ');
const car = (dx = 0, dy = 0, k = 1) => `M${4 * k + dx} ${21 * k + dy}V${17 * k + dy}L${7 * k + dx} ${11 * k + dy}H${25 * k + dx}L${28 * k + dx} ${17 * k + dy}V${21 * k + dy}Z`;

const ICONS = {
  'shop-247': { S: [f('<path d="M5 13H27L24 26H8Z"/>'), l('<path d="M11 13L15 6M21 13L17 6" fill="none"/>', 2.4)], D: ['<path d="M12 16.5v6M16 16.5v6M20 16.5v6" stroke-width="1.6"/>'] },
  barber: { S: [l('<circle cx="10" cy="23" r="3.4" fill="none"/>', 2.6), l('<circle cx="22" cy="23" r="3.4" fill="none"/>', 2.6), l('<path d="M12 20.3L21.5 5M20 20.3L10.5 5" fill="none"/>', 2.6)], D: [] },
  bar: { S: [f('<path d="M5 6H27L16 18Z"/>'), l('<path d="M16 18V26M10.5 26.5H21.5" fill="none"/>', 2.6)], D: ['<circle cx="19.5" cy="9.5" r="1.6" stroke="none" fill="#fff"/>'] },
  guns: { S: [f('<path d="M4 9H27V15H15L13 26H7L9 15H4Z"/>')], D: ['<path d="M14.5 15.5q.5 3.5 3.5 3.5" stroke-width="1.6"/>', '<path d="M6 12H24" stroke-width="1.2"/>'] },
  clothes: { S: [f('<path d="M11 5L5.5 8.5L3 14L7.5 16.5L9 13.5V27H23V13.5L24.5 16.5L29 14L26.5 8.5L21 5Q16 9.5 11 5Z"/>')], D: [] },
  tattoo: { S: [f('<path d="M16 27L5.8 17.2A5.6 5.6 0 0 1 16 9.6A5.6 5.6 0 0 1 26.2 17.2Z"/>')], D: ['<path d="M10.5 13.5Q12.5 11.5 14 12.5" stroke-width="1.6"/>'] },
  gangs: { c: '#d9443a', dc: '#15171b', S: [f('<path d="M16 4A10.5 9.5 0 0 0 5.5 13.5C5.5 18 8 20.5 10 21.5V26H22V21.5C24 20.5 26.5 18 26.5 13.5A10.5 9.5 0 0 0 16 4Z"/>')], D: ['<circle cx="11.8" cy="14" r="2.6" stroke="none" fill="#fff"/>', '<circle cx="20.2" cy="14" r="2.6" stroke="none" fill="#fff"/>', '<path d="M16 17.5l-1.4 2.6h2.8z" stroke="none" fill="#fff"/>', '<path d="M13 25.5v-3M16 25.5v-3M19 25.5v-3" stroke-width="1.3"/>'] },
  gov: { S: [f('<path d="M16 3.5L29 11H3Z"/>'), f('<rect x="4" y="24" width="24" height="3.5"/>'), f('<rect x="6.5" y="12.5" width="3.4" height="11"/>'), f('<rect x="12" y="12.5" width="3.4" height="11"/>'), f('<rect x="17" y="12.5" width="3.4" height="11"/>'), f('<rect x="22.4" y="12.5" width="3.4" height="11"/>')], D: [] },
  mafia: { S: [f('<path d="M2.5 21Q16 27.5 29.5 21Q16 16.5 2.5 21Z"/>'), f('<path d="M8.5 20.5Q7.5 10 11 7.5Q16 11 21 7.5Q24.5 10 23.5 20.5Z"/>')], D: ['<path d="M8.8 17Q16 19.4 23.2 17" stroke-width="2"/>'] },
  spawn: { c: '#f59e0b', S: [f(`<polygon points="${star(16, 16.5, 12.5, 5.2)}"/>`)], D: [] },
  school: { S: [f('<path d="M16 5L30.5 11.5L16 18L1.5 11.5Z"/>'), f('<path d="M8.5 14.5V21Q16 25.5 23.5 21V14.5L16 18Z"/>'), l('<path d="M27.5 12.8V21" fill="none"/>', 1.8)], D: [] },
  'ls-customs': { c: '#3b82f6', S: [f(`<path d="${gear(16, 16, 13, 10, 8)}"/>`)], D: ['<circle cx="16" cy="16" r="4.2" stroke-width="2.4"/>'] },
  'air-salon': { S: [f('<path d="M16 3C17.6 3 18 4.6 18 6V12L28.5 18V21L18 18V24L21 26.5V28.5L16 27L11 28.5V26.5L14 24V18L3.5 21V18L14 12V6C14 4.6 14.4 3 16 3Z"/>')], D: [] },
  'car-market': { S: [f(`<path d="${car(0, 3)}"/>`), f('<circle cx="9" cy="25" r="3"/>'), f('<circle cx="23" cy="25" r="3"/>'), f('<path d="M19 2.5H28V8L23.5 11L19 8Z"/>')], D: ['<path d="M9 16H15V19H8Z" stroke="none" fill="#fff"/>', '<path d="M17 16H23L24 19H17Z" stroke="none" fill="#fff"/>', '<circle cx="23.5" cy="5.5" r="1.3" stroke="none" fill="#fff"/>'] },
  'car-salon': { S: [f('<path d="M2.5 13.5L16 4.5L29.5 13.5V27.5H25.5V15.5H6.5V27.5H2.5Z"/>'), f('<path d="M8 25.5V22.5L10 18.5H22L24 22.5V25.5Z"/>'), f('<circle cx="11" cy="26" r="2"/>'), f('<circle cx="21" cy="26" r="2"/>')], D: [] },
  gas: { c: '#f4f4f2', dc: '#15171b', S: [f('<path d="M7 10L11.5 5H24Q26.5 5 26.5 7.5V25.5Q26.5 28 24 28H9.5Q7 28 7 25.5Z"/>'), f('<rect x="8" y="2.5" width="6" height="4" rx="1"/>')], D: ['<path d="M12 13L22 24M22 13L12 24" stroke-width="2.2"/>'] },
  charge: { c: '#facc15', S: [f('<path d="M18.5 2.5L7 18H14.5L12.5 29.5L25 13H17.5Z"/>')], D: [] },
  'other-salon': { c: '#facc15', S: [f('<path d="M2.5 19H29.5L25.5 26.5H7.5Z"/>'), f('<path d="M15 3.5V17H5.5Z"/>'), f('<path d="M17 6.5V17H25.5Z"/>')], D: [] },
  rent: { S: [l('<circle cx="10" cy="16" r="4.6" fill="none"/>', 3.2), l('<path d="M14.6 16H28.5M24 16V20.5M27.5 16V19.5" fill="none"/>', 3.2)], D: [] },
  casino: { c: '#38c8e3', dc: '#15171b', S: [f('<path d="M9 5.5H23L28.5 12L16 27.5L3.5 12Z"/>')], D: ['<path d="M3.5 12H28.5M12.5 5.5L10.5 12L16 27.5M19.5 5.5L21.5 12L16 27.5" stroke-width="1.3"/>'] },
  cinema: { S: [f('<rect x="3.5" y="13" width="17.5" height="11.5" rx="2"/>'), f('<circle cx="8" cy="8.5" r="4.4"/>'), f('<circle cx="17" cy="8.5" r="4.4"/>'), f('<path d="M21 16.5L28.5 12.5V25L21 21Z"/>')], D: ['<circle cx="8" cy="8.5" r="1.3" stroke="none" fill="#fff"/>', '<circle cx="17" cy="8.5" r="1.3" stroke="none" fill="#fff"/>'] },
  metals: { c: '#e8b730', S: [f('<path d="M3.5 26L6.5 20H14.5L17.5 26Z"/>'), f('<path d="M14.5 26L17.5 20H25.5L28.5 26Z"/>'), f('<path d="M9 18.5L12 12.5H20L23 18.5Z"/>')], D: ['<path d="M8 22.5H13M19 22.5H24M13.5 15H18.5" stroke-width="1.1" stroke="#fff6d0"/>'] },
  fishing: { c: '#f2a31b', S: [l('<path d="M19.5 5V19A6 6 0 0 1 7.5 19V16.5" fill="none"/>', 3.2), f('<path d="M7.5 12.5L4.5 18H10.5Z"/>'), l('<circle cx="19.5" cy="3.8" r="1.6" fill="none"/>', 1.8)], D: [] },
  jobs: { S: [f('<rect x="3.5" y="11" width="25" height="15.5" rx="2.6"/>'), l('<path d="M12 11V8Q12 6.5 13.5 6.5H18.5Q20 6.5 20 8V11" fill="none"/>', 2.4)], D: ['<path d="M3.5 17.5H28.5" stroke-width="1.6"/>', '<rect x="14" y="15.5" width="4" height="4" rx=".8" stroke="none" fill="#fff"/>'] },
  buyers: { S: [f('<path d="M12.5 7.5L10 3.5H22L19.5 7.5Q28 13 27.2 21Q26.5 28.5 16 28.5Q5.5 28.5 4.8 21Q4 13 12.5 7.5Z"/>')], D: ['<text x="16" y="24" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="12" text-anchor="middle" stroke="none" fill="#fff">$</text>'] },
};

/* ореол — ті самі фігури білим і товщі; силует — темний; деталі — білі зверху */
const shape = ({ el, w }, color, extra) => el.replace(/^<(\w+)/, `<$1 ${w ? `stroke="${color}" stroke-width="${w + extra}"` : `fill="${color}"${extra ? ` stroke="${color}" stroke-width="${extra}"` : ''}`}`);
function svg({ S, D, c, dc = '#fff' }) {
  const halo = S.map(s => shape(s, c ? DARK : HALO, c ? 2.6 : HALO_W)).join('');
  const body = S.map(s => shape(s, c || DARK, 0)).join('');
  const det = D.join('').replace(/fill="#fff"/g, `fill="${dc}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 36 36"><g stroke-linejoin="round" stroke-linecap="round">${halo}${body}`
    + `<g fill="none" stroke="${dc}" stroke-linecap="round" stroke-linejoin="round">${det}</g></g></svg>\n`;
}

const OUT = new URL('../public/icons/map/game/', import.meta.url);
mkdirSync(OUT, { recursive: true });
for (const [id, ic] of Object.entries(ICONS)) writeFileSync(new URL(`${id}.svg`, OUT), svg(ic));
console.log(`значків: ${Object.keys(ICONS).length} → public/icons/map/game/`);
