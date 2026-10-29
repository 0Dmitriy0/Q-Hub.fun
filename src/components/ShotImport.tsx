import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { money, parseMoney } from '../lib/format';
import { detectBuyer, mergeFrames, parseShot, type CatalogItem, type OcrLine } from '../lib/shotParse';
import Icon from './Icon';
import Select from './Select';
import { useCharacterPick } from './CharacterPick';

export interface ShotCatalog extends CatalogItem { min: number; max: number; price: number }
interface Draft { key: string; item_id: number | ''; price: string; read: string; on: boolean; status?: 'ok' | string }

/* Tesseract вантажиться лише коли гравець уперше вставляє скрін (≈17 МБ, з нашого ж сайту), і живе до закриття сторінки */
let workerP: Promise<import('tesseract.js').Worker> | null = null;
async function ocrWorker(onProgress: (p: string) => void) {
  if (!workerP) workerP = import('tesseract.js').then(T => T.createWorker(['ukr', 'eng'], 1, {
    workerPath: '/ocr/worker.min.js', corePath: '/ocr/', langPath: '/ocr', gzip: false,
    logger: m => { if (m.status === 'loading language traineddata' || m.status === 'loading tesseract core') onProgress('Готую розпізнавання… ' + Math.round((m.progress || 0) * 100) + '%'); }
  }));
  return workerP;
}

/* лишаємо тільки білий текст (назви й ціни білі, опис сірий, фото кольорові) і ділимо на дві колонки карток */
async function prepare(file: ImageBitmapSource): Promise<HTMLCanvasElement[]> {
  const bmp = await createImageBitmap(file);
  const src = document.createElement('canvas'); src.width = bmp.width; src.height = bmp.height;
  const sx = src.getContext('2d', { willReadFrequently: true })!; sx.drawImage(bmp, 0, 0);
  const img = sx.getImageData(0, 0, src.width, src.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
    const v = mn > 185 && mx - mn < 40 ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  sx.putImageData(img, 0, 0);
  const cols = src.width >= 700 ? 2 : 1, w = Math.floor(src.width / cols), k = Math.min(2, 2400 / w);
  return Array.from({ length: cols }, (_, c) => {
    const cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(src.height * k);
    const x = cv.getContext('2d')!; x.imageSmoothingQuality = 'high'; x.drawImage(src, c * w, 0, w, src.height, 0, 0, cv.width, cv.height);
    return cv;
  });
}

/* кадри відео: беремо кадр кожні півсекунди й пропускаємо ті, що майже не відрізняються від попереднього
   взятого (гравець не гортав) — порівнюємо зменшені до 48x27 сірі копії */
const STEP = 0.5, MAX_FRAMES = 40, SAME = 6;
async function videoFrames(file: Blob, onProgress: (p: string) => void): Promise<HTMLCanvasElement[]> {
  const url = URL.createObjectURL(file), v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  try {
    await new Promise<void>((ok, bad) => { v.onloadeddata = () => ok(); v.onerror = () => bad(new Error('браузер не відкрив це відео')); });
    const dur = v.duration;
    if (!isFinite(dur) || dur <= 0 || !v.videoWidth) throw new Error('браузер не відкрив це відео');
    const k = Math.min(1, 2560 / v.videoWidth), W = Math.round(v.videoWidth * k), H = Math.round(v.videoHeight * k);
    const tiny = document.createElement('canvas'); tiny.width = 48; tiny.height = 27;
    const tx = tiny.getContext('2d', { willReadFrequently: true })!;
    const out: HTMLCanvasElement[] = []; let prev: Uint8ClampedArray | null = null;
    for (let t = Math.min(0.1, dur / 2); t < dur && out.length < MAX_FRAMES; t += STEP) {
      onProgress(`Дивлюсь відео… ${Math.round((t / dur) * 100)}%`);
      await new Promise<void>(ok => { v.onseeked = () => ok(); v.currentTime = t; });
      tx.drawImage(v, 0, 0, 48, 27);
      const g = tx.getImageData(0, 0, 48, 27).data;
      if (prev) { let d = 0; for (let i = 0; i < g.length; i += 4) d += Math.abs(g[i] - prev[i]) + Math.abs(g[i + 1] - prev[i + 1]) + Math.abs(g[i + 2] - prev[i + 2]); if (d / (48 * 27 * 3) < SAME) continue; }
      prev = g;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.getContext('2d')!.drawImage(v, 0, 0, W, H); out.push(cv);
    }
    return out;
  } finally { v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); }
}

async function readLines(w: import('tesseract.js').Worker, src: ImageBitmapSource, onPart: (c: number, n: number) => void): Promise<OcrLine[]> {
  const parts = await prepare(src), lines: OcrLine[] = [];
  for (let c = 0; c < parts.length; c++) {
    onPart(c, parts.length);
    const { data } = await w.recognize(parts[c], {}, { blocks: true });
    for (const b of data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) lines.push({ text: l.text, y: l.bbox.y0, col: c });
  }
  return lines;
}

export default function ShotImport({ catalog, buyerName, onBuyer, onDone }: {
  catalog: ShotCatalog[]; buyerName: (id: string) => string; onBuyer: (id: string) => void; onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { pick, dialog: pickDialog } = useCharacterPick();
  const [busy, setBusy] = useState('');
  const [buyer, setBuyer] = useState('');
  const [rows, setRows] = useState<Draft[]>([]);
  const [msg, setMsg] = useState('');
  const box = useRef<HTMLDivElement>(null);

  async function handle(file: Blob) {
    setMsg(''); setRows([]);
    const video = file.type.startsWith('video/');
    try {
      setBusy('Готую розпізнавання…');
      const w = await ocrWorker(setBusy);
      let frames: OcrLine[][];
      if (video) {
        const shots = await videoFrames(file, setBusy);
        frames = [];
        for (let f = 0; f < shots.length; f++) frames.push(await readLines(w, shots[f], () => setBusy(`Читаю кадри відео… ${f + 1} з ${shots.length}`)));
      } else frames = [await readLines(w, file, (c, n) => setBusy(`Читаю скрін… ${c + 1} з ${n}`))];
      const b = detectBuyer(frames.flat(), catalog);
      if (!b) { setBusy(''); setMsg(video ? 'Не вдалося впізнати товари на відео. Запиши меню скупника на весь екран і гортай повільно.' : 'Не вдалося впізнати товари на скріні. Зроби скрін меню скупника цілком, без обрізання, і спробуй ще раз.'); return; }
      const mine = catalog.filter(i => i.buyer_id === b);
      setBuyer(b); onBuyer(b);
      const found = video ? mergeFrames(frames.map(l => parseShot(l, mine))) : parseShot(frames[0], mine);
      setRows(found.map((r, i) => ({ key: String(i), item_id: r.item?.id ?? '', price: r.price ? String(r.price) : '', read: r.read, on: !!(r.item && r.price) })));
      setBusy('');
    } catch (e) { setBusy(''); setMsg((video ? 'Не вдалося прочитати відео: ' : 'Не вдалося прочитати скрін: ') + (e instanceof Error ? e.message : String(e)) + (video ? '. Спробуй відео у форматі MP4 або скріншоти.' : '')); }
  }

  /* Ctrl+V зі скріном, поки панель відкрита */
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => { const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith('image/')); if (f) { e.preventDefault(); handle(f); } };
    window.addEventListener('paste', onPaste); return () => window.removeEventListener('paste', onPaste);
  });

  const items = catalog.filter(i => i.buyer_id === buyer);
  const set = (k: string, p: Partial<Draft>) => setRows(rs => rs.map(r => (r.key === k ? { ...r, ...p, status: undefined } : r)));
  const chosen = rows.filter(r => r.on && r.item_id && parseMoney(r.price) > 0);

  async function submit() {
    /* персонаж — один на весь скрін чи відео (specs/025): 2–3 — питаємо, скасував — нічого не внесено */
    const c = await pick();
    if (!c) return;
    if ('error' in c) { setMsg(c.error); return; }
    setBusy('Вношу ціни…'); let ok = 0;
    for (const r of chosen) {
      const { error } = await supabase!.from('price_reports').insert({ kind: 'buyer', buyer_id: buyer, item_id: r.item_id, price: parseMoney(r.price), character_id: c.id });
      const st = error ? (error.code === 'P0001' ? error.message : 'не вдалося зберегти') : 'ok';
      if (!error) ok++;
      setRows(rs => rs.map(x => (x.key === r.key ? { ...x, status: st, on: !!error } : x)));
    }
    setBusy(''); setMsg(`Внесено ${ok} з ${chosen.length}.` + (ok < chosen.length ? ' Решту дивись у таблиці.' : ''));
    if (ok) onDone();
  }

  if (!open) return <button type="button" className="btn sm" onClick={() => setOpen(true)}><Icon name="camera" />Внести скріном або відео</button>;
  return (
    <section className="card shot" ref={box} aria-label="Внесення цін скріном або відео">
      {pickDialog}
      <div className="row between"><h2 className="ih"><Icon name="camera" />Ціни зі скріна або відео</h2>
        <button type="button" className="btn sm ghost" onClick={() => { setOpen(false); setRows([]); setMsg(''); }}>Закрити</button></div>
      <label className="drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f && /^(image|video)\//.test(f.type)) handle(f); }}>
        <input type="file" accept="image/*,video/*" className="vh" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handle(f); }} />
        <Icon name="camera" size={22} />
        <span><b>Встав скрін (Ctrl+V)</b>, перетягни сюди скрін чи відео або натисни, щоб вибрати файл.</span>
        <small className="muted">Скрін меню скупника цілком або відео, де ти повільно гортаєш усе меню. Розпізнавання йде у твоєму браузері — файл нікуди не надсилається.</small>
      </label>
      {busy && <p className="muted" role="status">{busy}</p>}
      {msg && <p className={rows.length ? 'muted' : 'err'} role="status">{msg}</p>}
      {rows.length > 0 && <>
        <p className="muted note">Скупник: <b>{buyerName(buyer)}</b>. Перевір ціни — помилки розпізнавання трапляються. Невпізнане підсвічено, його можна вибрати вручну.</p>
        <div className="scroll"><table className="t shot-t"><thead><tr><th></th><th>Товар</th><th className="n">Ціна</th><th>Стан</th></tr></thead>
          <tbody>{rows.map(r => {
            const it = items.find(i => i.id === r.item_id), p = parseMoney(r.price);
            const out = it && p > 0 && it.min > 0 && it.max > it.min && (p < it.min * 0.9 || p > it.max * 1.1);
            const same = it && p === it.price;
            return <tr key={r.key} className={!r.item_id ? 'bad' : out ? 'warn' : ''}>
              <td><input type="checkbox" aria-label="Вносити цей рядок" checked={r.on} onChange={e => set(r.key, { on: e.target.checked })} /></td>
              <td className="shot-item"><Select className="sm" label="Товар" placeholder="— вибери товар —" value={r.item_id} onChange={v => set(r.key, { item_id: v, on: true })}
                options={items.map(i => ({ value: i.id, label: i.name }))} /></td>
              <td className="n"><input aria-label="Ціна" inputMode="numeric" value={r.price} onChange={e => set(r.key, { price: e.target.value })} /></td>
              <td><small>{r.status === 'ok' ? '✓ внесено' : r.status ? r.status : !r.item_id ? 'товар не впізнано' : !p ? 'немає ціни' : out ? `поза межами ${money(it!.min)}–${money(it!.max)}` : same ? 'така ж, як зараз' : 'готово'}</small></td>
            </tr>;
          })}</tbody></table></div>
        <div className="row"><button type="button" className="btn acc" disabled={!chosen.length || !!busy} onClick={submit}>Внести {chosen.length} {chosen.length === 1 ? 'ціну' : chosen.length >= 2 && chosen.length <= 4 ? 'ціни' : 'цін'}</button></div>
      </>}
    </section>
  );
}
