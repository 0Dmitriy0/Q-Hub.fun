import { useEffect, useState } from 'react';
import type { GameTheme } from '../lib/gameTheme';

/* тема мапи для гри запам'ятовується окремо від теми сайту (specs/021 FR-002) */
const THEME_KEY = 'qhub:gamemap:theme';
const readTheme = (): GameTheme => { try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; } };
import { Link } from 'react-router-dom';
import type { MapArea, MapCategory, MapMark } from '../lib/mapData';
import LABELS from '../data/mapLabels.json';
import ZONES from '../data/mapZones.json';

/* шари мапи (не мітки): у грі це готові файли назв і зон */
const LAYER_COUNT = { names: LABELS.length, zones: ZONES.length };

/* це адмін хоче бачити на карті для гри одразу — галочки стоять, навіть якщо на сайті категорію чи шар сховано */
const PRESET = new Set(['names', 'zones', 'treasure-fields', 'hunting-fields', 'graffiti', 'ufo-land', 'oil']);

/* ці групи вже є на мапі самої гри (значки проєкту) — у карту для гри їх не додаємо, щоб не було двох значків на одному місці */
export const IN_GAME_GROUPS = new Set(['Магазини', 'Структури', 'Транспорт', 'Розваги', 'Заробіток']);
const inGame = (c: MapCategory) => IN_GAME_GROUPS.has(c.grp);

/* «Карта для гри»: гравець галочками вибирає мітки, сайт збирає zip у форматі Hydra (вектор мінікарти + значки + 6 текстур) */
export default function GameMapExport({ groups, marks, areas, catById, isOn }: {
  groups: { grp: string; cats: MapCategory[] }[]; marks: MapMark[]; areas: MapArea[]; catById: Record<string, MapCategory>; isOn: (c: MapCategory) => boolean;
}) {
  /* поки галочку не чіпали — як у фільтрі мапи (категорії з бази приходять уже після відкриття сторінки) */
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const on = (c: MapCategory) => sel[c.id] ?? (PRESET.has(c.id) || isOn(c));
  const list = groups.filter(g => !IN_GAME_GROUPS.has(g.grp));
  const [iconM, setIconM] = useState(20);
  const [theme, setThemeState] = useState<GameTheme>(readTheme);
  const setTheme = (t: GameTheme) => { setThemeState(t); try { localStorage.setItem(THEME_KEY, t); } catch { /* приватний режим */ } };
  /* попередній перегляд вибраної теми (FR-005) — уся мапа маленькою картинкою */
  const [preview, setPreview] = useState<Record<string, string>>({});
  useEffect(() => {
    if (preview[theme]) return;
    let alive = true;
    import('../lib/gameMap').then(m => m.previewMap(theme)).then(url => { if (alive) setPreview(p => ({ ...p, [theme]: url })); }).catch(() => { /* без перегляду — не страшно */ });
    return () => { alive = false; };
  }, [theme]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const [done, setDone] = useState(false);   // архів завантажено — показати, як поставити (specs/023)
  const count: Record<string, number> = { names: LAYER_COUNT.names, zones: LAYER_COUNT.zones }; for (const m of [...marks, ...areas]) count[m.category] = (count[m.category] || 0) + 1;
  const all = list.flatMap(g => g.cats);
  const picked = marks.filter(m => catById[m.category] && !inGame(catById[m.category]) && on(catById[m.category]));
  /* зони з бази (поля скарбів): відтінок на текстурах і пунктирна межа у векторі мінікарти */
  const pickedAreas = areas.filter(a => catById[a.category] && !inGame(catById[a.category]) && on(catById[a.category]));
  const set = (ids: string[], v: boolean) => setSel(s => { const n = { ...s }; for (const id of ids) n[id] = v; return n; });

  async function go() {
    setErr(''); setBusy('Готую…');
    try {
      const { buildGamePack } = await import('../lib/gameMap');
      const pins = picked.map(m => { const c = catById[m.category]; return { x: m.x, y: m.y, icon: m.icon || c.icon, color: c.color }; });
      const layers = (['names', 'zones'] as const).filter(id => catById[id] && on(catById[id]));
      const blob = await buildGamePack(pins, { iconM, layers, theme, areas: pickedAreas.map(a => ({ ring: a.ring, color: catById[a.category].color })) }, setBusy);
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'q-hub-minimap.zip';
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      setDone(true);
    } catch (e) { setErr('Не вдалося зібрати архів: ' + (e as Error).message); }
    setBusy('');
  }

  return (
    <details className="madmin mgame" open>
      <summary>Карта для гри</summary>
      <p className="muted">Наша мапа для заміни мінікарти в GTA V через OpenIV. Галочками вибери, що потрібно: назви місць, зелені зони, поля скарбів і мітки — вони стануть частиною мапи.</p>
      <Link className="h-more" to="/mapa/v-gru">Як поставити в гру →</Link>
      <div className="mgame-theme">
        <div className="mseg" role="radiogroup" aria-label="Тема мапи для гри">
          <button type="button" role="radio" aria-checked={theme === 'dark'} onClick={() => setTheme('dark')}>Темна</button>
          <button type="button" role="radio" aria-checked={theme === 'light'} onClick={() => setTheme('light')}>Світла</button>
        </div>
        {preview[theme] ? <img src={preview[theme]} alt={`Мапа для гри — ${theme === 'light' ? 'світла' : 'темна'} тема`} width={96} height={144} /> : <span className="mgame-prev" aria-hidden="true" />}
      </div>
      {theme === 'light' && <p className="muted">Світлу мінікарту ще не перевірено в грі: білі позначки гри (стрілка, маршрут GPS) на світлому тлі можуть бути менш помітні.</p>}
      <p className="muted">Магазинів, структур, транспорту, розваг і заробітку тут немає — їхні значки вже є на мапі самої гри.</p>
      <div className="mseg" role="group" aria-label="Усі мітки">
        <button type="button" onClick={() => set(all.map(c => c.id), true)}>Усі</button>
        <button type="button" onClick={() => set(all.map(c => c.id), false)}>Жодної</button>
      </div>
      {list.map(({ grp, cats }) => (
        <fieldset key={grp} className="mgame-grp">
          <legend>{grp}</legend>
          {cats.map(c => (
            <label key={c.id} className="mcheck">
              <input type="checkbox" checked={on(c)} onChange={e => set([c.id], e.target.checked)} />
              <img src={c.icon} alt="" width={18} height={18} loading="lazy" />{c.name}<span className="cnt">{count[c.id] || 0}</span>
            </label>
          ))}
        </fieldset>
      ))}
      <div className="mrow">
        <label className="mcheck">Значок, м <select className="min" value={iconM} onChange={e => setIconM(+e.target.value)}>{[5, 7, 12, 20].map(v => <option key={v} value={v}>{v}{v === 20 ? ' (рекомендовано)' : ''}</option>)}</select></label>
      </div>
      <button type="button" className="btn sm acc" disabled={!!busy} onClick={go}>{busy || `Скачати карту для гри · ${picked.length} міток${pickedAreas.length ? ` · ${pickedAreas.length} зон` : ''}`}</button>
      {picked.length > 1500 && !busy && <p className="muted">Багато міток — значки на мінікарті злипатимуться, а архів буде великим.</p>}
      {/* specs/017 FR-014: велика категорія (напр. 700+ гарбузів) закриє на мінікарті все інше */}
      {(() => { const big = all.filter(c => on(c) && (count[c.id] || 0) > 200 && !LAYER_COUNT[c.id as keyof typeof LAYER_COUNT]);
        return big.length > 0 && !busy && <p className="muted">Велика категорія: {big.map(c => `${c.name} (${count[c.id]})`).join(', ')} — на мінікарті вона закриє інші мітки. Радимо значок 7 м або 12 м.</p>; })()}
      {done && !busy && <p className="mmsg" role="status">Архів завантажено. Тепер — <Link to="/mapa/v-gru">як поставити його в гру</Link>.</p>}
      {err && <p className="mmsg" role="alert">{err}</p>}
    </details>
  );
}
