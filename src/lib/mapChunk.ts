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
