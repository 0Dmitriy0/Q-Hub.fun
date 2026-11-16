/* Звірі на полях полювання (specs/088): 8 видів гри, їхні назви на мапі й розміщення іконок усередині поля.
   id — ті самі, що в іконках м'яса й шкір (public/icons/meat, public/icons/hide); у базі — map_areas.animals (0069). */

export type AnimalId = 'rabbit' | 'cow' | 'pig' | 'coyote' | 'deer' | 'puma' | 'panther' | 'boar';
export type Pt = [number, number];

export const ANIMALS: { id: AnimalId; name: string; icon: string }[] = [
  { id: 'rabbit', name: 'Заєць', icon: '/icons/animals/rabbit.svg' },
  { id: 'cow', name: 'Корова', icon: '/icons/animals/cow.svg' },
  { id: 'pig', name: 'Свиня', icon: '/icons/animals/pig.svg' },
  { id: 'coyote', name: 'Койот', icon: '/icons/animals/coyote.svg' },
  { id: 'deer', name: 'Олень', icon: '/icons/animals/deer.svg' },
  { id: 'puma', name: 'Пума', icon: '/icons/animals/puma.svg' },
  { id: 'panther', name: 'Пантера', icon: '/icons/animals/panther.svg' },
  { id: 'boar', name: 'Кабан', icon: '/icons/animals/boar.svg' },
];
export const ANIMAL_BY_ID = Object.fromEntries(ANIMALS.map(a => [a.id, a])) as Record<AnimalId, (typeof ANIMALS)[number]>;
/* категорія мапи, у зонах якої адмін вказує звірів */
export const HUNT_CATEGORY = 'hunting-fields';

export const isAnimal = (s: unknown): s is AnimalId => typeof s === 'string' && s in ANIMAL_BY_ID;
/* лише відомі види, без повторів, у порядку ANIMALS */
export const sortAnimals = (ids: readonly unknown[]): AnimalId[] => ANIMALS.map(a => a.id).filter(id => ids.includes(id));

export function inRing([x, y]: Pt, ring: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* центр мас контуру (формула площі); вироджений контур — середнє вершин */
function centroid(ring: readonly Pt[]): Pt {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f;
  }
  if (Math.abs(a) < 1e-9) return [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
  return [cx / (3 * a), cy / (3 * a)];
}

/* n точок сіткою з кроком step навколо c: rows рядів, у кожному до ceil(n/rows), кожен ряд по центру */
function grid(c: Pt, n: number, rows: number, step: number): Pt[] {
  const per = Math.ceil(n / rows), out: Pt[] = [];
  for (let r = 0; r < rows; r++) {
    const k = Math.min(per, n - r * per); if (k <= 0) break;
    for (let i = 0; i < k; i++) out.push([c[0] + (i - (k - 1) / 2) * step, c[1] - (r - (rows - 1) / 2) * step]);
  }
  return out;
}

/* Звірі на мапі для гри — більші за звичайний значок: поле полювання велике, і значок розміром з мітку на ньому губився.
   Беремо найбільший множник, з яким уся сітка ще влазить у поле; не влазить жоден — звичайний розмір.
   sizeM — розмір звичайного значка (м); крок сітки — 1,15 розміру іконки звіра */
export const ANIMAL_SCALES = [5, 4, 3, 2.5, 2, 1.5, 1];
export function animalLayout(ring: readonly Pt[], n: number, sizeM: number, at?: Pt | null): { spots: Pt[]; k: number } {
  /* місце вказав адмін (map_areas.animals_at): сітка з центром саме там, найбільший розмір, з яким вона ще в полі;
     не влазить жодна — звичайний розмір у цій точці (адмін бачить контур значків під час правки) */
  if (at) {
    if (n <= 0) return { spots: [], k: 1 };
    const pref = Math.ceil(n / 4), rowsOrder = [pref, ...Array.from({ length: n }, (_, i) => i + 1).filter(r => r !== pref)];
    for (const k of ANIMAL_SCALES) for (const rows of rowsOrder) {
      const spots = grid(at, n, rows, sizeM * k * 1.15);
      if (spots.every(p => inRing(p, ring))) return { spots, k };
    }
    return { spots: grid(at, n, pref, sizeM * 1.15), k: 1 };
  }
  for (const k of ANIMAL_SCALES) {
    const spots = animalSpots(ring, n, sizeM * k * 1.15);
    if (k === 1 || spots.every(p => inRing(p, ring))) return { spots, k };
  }
  return { spots: [], k: 1 };
}

/* точка плашки звірів на мапі сайту: вказана адміном або «середина» поля */
export const animalAnchor = (ring: readonly Pt[], at?: Pt | null): Pt => at ?? animalSpots(ring, 1, 0)[0];
export const isPt = (v: unknown): v is Pt => Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number' && Number.isFinite(n));

/* Де поставити n іконок звірів у полі: щільна сітка з кроком stepM (метри гри), уся всередині контуру.
   Центр — центр мас, а якщо він поза контуром (увігнуте поле) чи сітка не влазить — найближчі до нього точки
   всередині (перебір сіткою 1/20 габариту). Ряди: до 4 іконок — один, далі — по 4 в ряд; не влазить — інші варіанти.
   Детерміновано; якщо не влазить ніде — сітка в найкращому центрі (краще трохи за межею, ніж нічого). */
export function animalSpots(ring: readonly Pt[], n: number, stepM: number): Pt[] {
  if (n <= 0 || ring.length < 3) return [];
  const c = centroid(ring);
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const dx = (x1 - x0) / 20, dy = (y1 - y0) / 20;
  const centers: Pt[] = [c];
  for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) { const p: Pt = [x0 + i * dx, y0 + j * dy]; if (inRing(p, ring)) centers.push(p); }
  const d2 = (p: Pt) => (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2;
  centers.sort((a, b) => d2(a) - d2(b));
  const pref = Math.ceil(n / 4);
  const rowsOrder = [pref, ...Array.from({ length: n }, (_, i) => i + 1).filter(r => r !== pref)];
  for (const rows of rowsOrder) for (const ctr of centers) {
    const pts = grid(ctr, n, rows, stepM);
    if (pts.every(p => inRing(p, ring))) return pts;
  }
  return grid(centers.find(p => inRing(p, ring)) ?? c, n, pref, stepM);
}
