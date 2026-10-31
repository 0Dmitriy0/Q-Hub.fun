/* авто з гаража гравця → модель з каталогу транспорту сайту (фото, марка, держ. ціна).
   Гравці пишуть як заманеться: «Zeekr 001», «zeekr-001», «BMW M5 F90» при каталожному «M5 F90» з маркою BMW */
export interface Vehicle { id: number; name: string; brand: string; price: number; image_url: string; model?: string | null }

/* фото з CDN гри за кодом моделі (urus → …/Urus.png), як дали розробники */
export const gamePhoto = (model: string) => `https://1ff720c613a55d1a.cdn.express/vehicles/test/${model[0].toUpperCase()}${model.slice(1)}.png`;

/* фото: завантажене адміном → з CDN гри за кодом моделі → з маркетплейсу гри на самому сайті (public/vehicles/map.json).
   Фото з map.json браузер кешує на тиждень, тому оновлене фото отримує в map.json нову ?v=, а map.json читається без кешу */
export async function withSitePhotos<T extends { name: string; image_url: string | null; model?: string | null }>(list: T[]): Promise<T[]> {
  const pics: Record<string, string> = await fetch('/vehicles/map.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : {})).catch(() => ({}));
  return list.map(x => {
    const url = x.image_url || (x.model ? gamePhoto(x.model) : pics[x.name]);
    return url && url !== x.image_url ? { ...x, image_url: url } : x;
  });
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\d]+/gu, ' ').trim();

export function matchVehicle(name: string, vehicles: Vehicle[]): Vehicle | null {
  const n = norm(name);
  if (!n) return null;
  /* у каталозі назва часто вже з маркою («Übermacht F13») — гравець може написати лише модель («F13») */
  const bare = (v: Vehicle) => { const nm = norm(v.name), b = norm(v.brand); return b && nm.startsWith(b + ' ') ? nm.slice(b.length + 1) : nm; };
  const exact = vehicles.find(v => norm(v.name) === n || norm(`${v.brand} ${v.name}`) === n || bare(v) === n);
  if (exact) return exact;
  /* найдовша каталожна назва, що повністю входить у написане гравцем (як окремі слова) */
  const hits = vehicles.filter(v => norm(v.name).length >= 3 && ` ${n} `.includes(` ${norm(v.name)} `));
  return hits.sort((a, b) => norm(b.name).length - norm(a.name).length)[0] ?? null;
}
