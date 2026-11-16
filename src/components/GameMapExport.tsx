import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { readGameTheme, saveGameTheme, type GameTheme } from '../lib/gameTheme';
import type { MapArea, MapCategory, MapMark } from '../lib/mapData';
import type { MapLabel } from '../lib/mapLabel';
import { BIG_CAT, MANY_PINS, packSummary } from '../lib/gamePreview';
import ZONES from '../data/mapZones.json';
import GamePreview from './GamePreview';
import { ANIMAL_BY_ID, animalLayout } from '../lib/huntAnimals';
import Icon from './Icon';

/* шари мапи (не мітки): назви — написи адміна (specs/089), зелені зони — готовий файл */
const LAYER_COUNT = { names: 0, zones: ZONES.length };
const isLayer = (id: string) => id in LAYER_COUNT;

/* це адмін хоче бачити на карті для гри одразу — галочки стоять, навіть якщо на сайті категорію чи шар сховано */
const PRESET = new Set(['names', 'zones', 'treasure-fields', 'hunting-fields', 'graffiti', 'ufo-land', 'oil']);

/* ці групи вже є на мапі самої гри (значки проєкту) — у карту для гри їх не додаємо, щоб не було двох значків на одному місці */
export const IN_GAME_GROUPS = new Set(['Магазини', 'Структури', 'Транспорт', 'Розваги', 'Заробіток']);
const inGame = (c: MapCategory) => IN_GAME_GROUPS.has(c.grp);
const SIZES = [5, 7, 12, 20];

/* свій розмір значка для окремих категорій (id → метри) — у браузері гравця, щоб не виставляти знову при наступному скачуванні */
const SIZE_KEY = 'qhub-game-cat-sizes';
function readCatSizes(): Record<string, number> {
  try { const v = JSON.parse(localStorage.getItem(SIZE_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function saveCatSizes(v: Record<string, number>) { try { localStorage.setItem(SIZE_KEY, JSON.stringify(v)); } catch { /* без сховища — лише на цей раз */ } }

/* «Карта для гри»: гравець галочками вибирає мітки, сайт збирає zip у форматі Hydra (вектор мінікарти + значки + 6 текстур).
   specs/026: зліва (на телефоні — зверху) перегляд того, що буде на мінікарті, справа вибір, кнопка «Скачати» з підсумком завжди видно */
export default function GameMapExport({ groups, marks, areas, labels, catById, isOn, loading = false }: {
  groups: { grp: string; cats: MapCategory[] }[]; marks: MapMark[]; areas: MapArea[]; labels: MapLabel[]; catById: Record<string, MapCategory>; isOn: (c: MapCategory) => boolean; loading?: boolean;
}) {
  /* поки галочку не чіпали — як у фільтрі мапи (категорії з бази приходять уже після відкриття сторінки) */
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const on = (c: MapCategory) => sel[c.id] ?? (PRESET.has(c.id) || isOn(c));
  const list = groups.filter(g => !IN_GAME_GROUPS.has(g.grp));
  const [iconM, setIconM] = useState(20);
  const [catM, setCatMState] = useState<Record<string, number>>(readCatSizes);
  /* m — метри; 0 — як загальний розмір */
  const setCatM = (id: string, m: number) => setCatMState(s => { const n = { ...s }; if (m) n[id] = m; else delete n[id]; saveCatSizes(n); return n; });
  const sizeOf = (id: string) => catM[id] || iconM;
  const [theme, setThemeState] = useState<GameTheme>(readGameTheme);
  const setTheme = (t: GameTheme) => { setThemeState(t); saveGameTheme(t); };
  const [shut, setShut] = useState<Record<string, boolean>>({});   // згорнуті групи
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const [done, setDone] = useState(false);   // архів завантажено — показати, як поставити (specs/023)
  const count: Record<string, number> = { names: labels.length, zones: LAYER_COUNT.zones }; for (const m of [...marks, ...areas]) count[m.category] = (count[m.category] || 0) + 1;
  const all = list.flatMap(g => g.cats);
  const picked = marks.filter(m => catById[m.category] && !inGame(catById[m.category]) && on(catById[m.category]));
  /* зони з бази (поля скарбів): відтінок на текстурах і пунктирна межа у векторі мінікарти */
  const pickedAreas = areas.filter(a => catById[a.category] && !inGame(catById[a.category]) && on(catById[a.category]));
  const layers = (['names', 'zones'] as const).filter(id => catById[id] && on(catById[id]));
  const set = (ids: string[], v: boolean) => setSel(s => { const n = { ...s }; for (const id of ids) n[id] = v; return n; });
  const empty = !picked.length && !pickedAreas.length && !layers.length;
  const big = (c: MapCategory) => on(c) && (count[c.id] || 0) > BIG_CAT && !isLayer(c.id);

  /* перегляд бере той самий вибір, що й архів */
  /* звірі полів полювання (specs/088) — значками сіткою всередині поля, до трьох розмірів значка своєї категорії (animalLayout: на великому полі звичайний значок губився),
     крок трохи більший за значок; у підсумку «міток» їх не рахуємо (там лише picked) */
  const animalPins = useMemo(() => pickedAreas.flatMap(a => {
    const c = catById[a.category], base = catM[c.id] || iconM, { spots, k } = animalLayout(a.ring, a.animals.length, base);
    return a.animals.map((id, i) => ({ x: spots[i][0], y: spots[i][1], icon: ANIMAL_BY_ID[id].icon, color: c.color, s: base * k / iconM }));
  }), [pickedAreas.map(a => a.id + ':' + a.animals.join()).join(), catById, catM, iconM]);   // eslint-disable-line react-hooks/exhaustive-deps
  const pins = useMemo(() => [...picked.map(m => {
    const c = catById[m.category], own = catM[c.id];
    return { x: m.x, y: m.y, icon: m.icon || c.icon, color: c.color, ...(own && own !== iconM ? { s: own / iconM } : {}) };
  }), ...animalPins], [picked.map(m => m.id).join(), catById, catM, iconM, animalPins]);   // eslint-disable-line react-hooks/exhaustive-deps
  const mixed = picked.some(m => { const own = catM[m.category]; return !!own && own !== iconM; });
  const shownAreas = useMemo(() => pickedAreas.map(a => ({ ring: a.ring, color: catById[a.category].color })), [pickedAreas.map(a => a.id).join(), catById]);   // eslint-disable-line react-hooks/exhaustive-deps

  async function go(withMarks = true) {
    setErr(''); setBusy('Готую…');
    try {
      const { buildGamePack } = await import('../lib/gameMap');
      const ps = withMarks ? pins : [];
      const blob = await buildGamePack(ps, { iconM, layers: withMarks ? layers : [], theme, areas: withMarks ? shownAreas : [], labels }, setBusy);
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'q-hub-minimap.zip';
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      setDone(true);
    } catch (e) { setErr('Не вдалося зібрати архів: ' + (e as Error).message); }
    setBusy('');
  }

  return (
    <div className="gx">
      <div className="gx-prev">
        <GamePreview theme={theme} names={layers.includes('names')} zones={layers.includes('zones')} pins={pins} areas={shownAreas} labels={labels} iconM={iconM} loading={loading} />
      </div>
      <div className="gx-side">
        <div className="gx-scroll">
          <p className="muted gx-lead">Наша мапа замість мінікарти GTA V. Вибери, що на ній буде, — перегляд ліворуч покаже це одразу. <Link to="/mapa/v-gru">Як поставити в гру →</Link></p>

          <section className="gx-card">
            <h3>Тема</h3>
            <div className="mseg" role="radiogroup" aria-label="Тема мапи для гри">
              <button type="button" role="radio" aria-checked={theme === 'dark'} onClick={() => setTheme('dark')}>Темна</button>
              <button type="button" role="radio" aria-checked={theme === 'light'} onClick={() => setTheme('light')}>Світла</button>
            </div>
            {theme === 'light' && <p className="gx-warn"><Icon name="alert" size={15} /><span>Світлу мінікарту ще не перевірено в грі: білі позначки гри (стрілка, маршрут GPS) на світлому тлі можуть бути менш помітні.</span></p>}
          </section>

          <section className="gx-card">
            <h3>Розмір значка для всіх</h3>
            <div className="mseg" role="radiogroup" aria-label="Розмір значка на мінікарті для всіх категорій, метрів">
              {SIZES.map(v => <button key={v} type="button" role="radio" aria-checked={iconM === v} onClick={() => setIconM(v)}>{v} м</button>)}
            </div>
            <p className="muted gx-note">{iconM === 20 ? 'Рекомендовано: значки добре видно на мінікарті.' : 'Наблизь перегляд, щоб побачити, як значки виглядатимуть у місті.'} Окремій категорії можна дати свій розмір — у списку нижче, праворуч від неї.</p>
          </section>

          <div className="gx-all">
            <h3>Що показати</h3>
            <button type="button" className="btn ghost sm" onClick={() => set(all.map(c => c.id), true)}>Усі</button>
            <button type="button" className="btn ghost sm" onClick={() => set(all.map(c => c.id), false)}>Жодної</button>
          </div>
          {list.map(({ grp, cats }) => {
            const n = cats.filter(on).length, closed = !!shut[grp], id = 'gx-g-' + grp.replace(/\s+/g, '-');
            return (
              <section key={grp} className="gx-card gx-grp">
                <div className="gx-grp-h">
                  <button type="button" className="gx-grp-t" aria-expanded={!closed} aria-controls={id} onClick={() => setShut(s => ({ ...s, [grp]: !closed }))}>
                    <Icon name="chev" size={16} className={closed ? 'gx-rot' : ''} />{grp}<span className="cnt">{n} з {cats.length}</span>
                  </button>
                  <button type="button" className="gx-mini" onClick={() => set(cats.map(c => c.id), true)} aria-label={`Усі в групі «${grp}»`}>усі</button>
                  <button type="button" className="gx-mini" onClick={() => set(cats.map(c => c.id), false)} aria-label={`Жодної в групі «${grp}»`}>жодної</button>
                </div>
                {!closed && (
                  <div id={id} className="gx-cats">
                    {cats.map(c => (
                      <div key={c.id}>
                        <div className="gx-cat">
                          <label className="mcheck">
                            <input type="checkbox" checked={on(c)} onChange={e => set([c.id], e.target.checked)} />
                            <img src={c.icon} alt="" width={18} height={18} loading="lazy" />{c.name}<span className="cnt">{loading && !isLayer(c.id) ? '…' : count[c.id] || 0}</span>
                          </label>
                          {/* шари (назви, зони) — готові файли, розміру значка в них немає */}
                          {on(c) && !isLayer(c.id) && (
                            <select className={'gx-size' + (catM[c.id] ? ' own' : '')} value={catM[c.id] || 0} onChange={e => setCatM(c.id, Number(e.target.value))}
                              aria-label={`Розмір значка «${c.name}»`} title="Розмір значка цієї категорії">
                              <option value={0}>{iconM} м · як усі</option>
                              {SIZES.map(v => <option key={v} value={v}>{v} м</option>)}
                            </select>
                          )}
                        </div>
                        {/* specs/017 FR-014: велика категорія (напр. 700+ гарбузів) закриє на мінікарті все інше — зменшуємо саме її */}
                        {big(c) && sizeOf(c.id) > 12 && (
                          <p className="gx-warn">
                            <Icon name="alert" size={15} /><span>{count[c.id]} міток — на мінікарті вони закриють інші. Менший значок для цієї категорії:</span>
                            <button type="button" className="gx-mini" onClick={() => setCatM(c.id, 7)}>7 м</button>
                            <button type="button" className="gx-mini" onClick={() => setCatM(c.id, 12)}>12 м</button>
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
          <p className="muted gx-note">Магазинів, структур, транспорту, розваг і заробітку тут немає — їхні значки вже є на мапі самої гри.</p>
        </div>

        <div className="gx-foot">
          {picked.length > MANY_PINS && !busy && <p className="gx-warn"><Icon name="alert" size={15} /><span>Багато міток — значки на мінікарті злипатимуться, а архів буде великим.</span></p>}
          {done && !busy && <p className="mmsg" role="status">Архів завантажено. Тепер — <Link to="/mapa/v-gru">як поставити його в гру</Link>.</p>}
          {err && <p className="mmsg" role="alert">{err}</p>}
          <button type="button" className="btn acc gx-go" disabled={!!busy || empty} onClick={() => go()}>
            <Icon name="download" size={18} />
            <span><b>{busy || (empty ? 'Вибери хоча б щось' : 'Скачати мапу для гри')}</b>
              {!busy && !empty && <small>{packSummary({ marks: picked.length, areas: pickedAreas.length, names: layers.includes('names'), zones: layers.includes('zones'), theme, iconM, mixed })}</small>}</span>
          </button>
          {empty && !busy && <button type="button" className="btn ghost sm" onClick={() => go(false)}>Скачати лише мапу, без міток</button>}
        </div>
      </div>
    </div>
  );
}
