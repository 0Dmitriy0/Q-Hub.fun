/* формат шматків векторної мапи (/map/v) — без Leaflet, щоб тестувалось без браузера */
export type Chunk = { n: number; xy: Uint16Array; c: Uint8Array };
export type Index = { cell: number; q: number; n: number; palette: string[]; have: number[] };

/* шматок, у який потрапляє тайл z>=7 */
export const cellOf = (z: number, x: number, y: number): [number, number] => {
  const k = 2 ** (z - 4); return [Math.floor(x / k), Math.floor(y / k)];
};

export function parseChunk(buf: ArrayBuffer): Chunk {
  const n = new DataView(buf).getUint32(0, true);
  return { n, xy: new Uint16Array(buf, 4, n * 6), c: new Uint8Array(buf, 4 + n * 12, n) };
}

/* трикутник у спільний шлях завжди в один бік обходу: трикутники з протилежним обходом, що перекриваються,
   при заливці одним шляхом (правило nonzero) взаємно гасяться — у тексті Hydra від цього були дірки-сітка */
export function triPath(ctx: CanvasRenderingContext2D, xy: ArrayLike<number>, o: number) {
  const ax = xy[o], ay = xy[o + 1], bx = xy[o + 2], by = xy[o + 3], cx = xy[o + 4], cy = xy[o + 5];
  ctx.moveTo(ax, ay);
  if ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay) >= 0) { ctx.lineTo(bx, by); ctx.lineTo(cx, cy); } else { ctx.lineTo(cx, cy); ctx.lineTo(bx, by); }
  ctx.closePath();
}
