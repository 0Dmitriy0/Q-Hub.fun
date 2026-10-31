import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { readGameTheme, saveGameTheme, type GameTheme } from '../lib/gameTheme';
import type { MapArea, MapCategory, MapMark } from '../lib/mapData';
import { BIG_CAT, MANY_PINS, packSummary } from '../lib/gamePreview';
import LABELS from '../data/mapLabels.json';
import ZONES from '../data/mapZones.json';
import GamePreview from './GamePreview';
import Icon from './Icon';

/* шари мапи (не мітки): у грі це готові файли назв і зон */
const LAYER_COUNT = { names: LABELS.length, zones: ZONES.length };
const isLayer = (id: string) => id in LAYER_COUNT;

/* це адмін хоче бачити на карті для гри одразу — галочки стоять, навіть якщо на сайті категорію чи шар сховано */
const PRESET = new Set(['names', 'zones', 'treasure-fields', 'hunting-fields', 'graffiti', 'ufo-land', 'oil']);

/* ці групи вже є на мапі самої гри (значки проєкту) — у карту для гри їх не додаємо, щоб не було двох значків на одному місці */
export const IN_GAME_GROUPS = new Set(['Магазини', 'Структури', 'Транспорт', 'Розваги', 'Заробіток']);
const inGame = (c: MapCategory) => IN_GAME_GROUPS.has(c.grp);
const SIZES = [5, 7, 12, 20];

/* «Карта для гри»: гравець галочками вибирає мітки, сайт збирає zip у форматі Hydra (вектор мінікарти + значки + 6 текстур).
   specs/026: зліва (на телефоні — зверху) перегляд того, що буде на мінікарті, справа вибір, кнопка «Скачати» з підсумком завжди видно */
export default function GameMapExport({ groups, marks, areas, catById, isOn, loading = false }: {
  groups: { grp: string; cats: MapCategory[] }[]; marks: MapMark[]; areas: MapArea[]; catById: Record<string, MapCategory>; isOn: (c: MapCategory) => boolean; loading?: boolean;
}) {
  /* поки галочку не чіпали — як у фільтрі мапи (категорії з бази приходять уже після відкриття сторінки) */
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const on = (c: MapCategory) => sel[c.id] ?? (PRESET.has(c.id) || isOn(c));
  const list = groups.filter(g => !IN_GAME_GROUPS.has(g.grp));
  const [iconM, setIconM] = useState(20);
  const [theme, setThemeState] = useState<GameTheme>(readGameTheme);
  const setTheme = (t: GameTheme) => { setThemeState(t); saveGameTheme(t); };
  const [shut, setShut] = useState<Record<string, boolean>>({});   // згорнуті групи
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const [done, setDone] = useState(false);   // архів завантажено — показати, як поставити (specs/023)
  const count: Record<string, number> = { names: LAYER_COUNT.names, zones: LAYER_COUNT.zones }; for (const m of [...marks, ...areas]) count[m.category] = (count[m.category] || 0) + 1;
  const all = list.flatMap(g => g.cats);
  const picked = marks.filter(m => catById[m.category] && !inGame(catById[m.category]) && on(catById[m.category]));
  /* зони з бази (поля скарбів): відтінок на текстурах і пунктирна межа у векторі мінікарти */
  const pickedAreas = areas.filter(a => catById[a.category] && !inGame(catById[a.category]) && on(catById[a.category]));
  const layers = (['names', 'zones'] as const).filter(id => catById[id] && on(catById[id]));
  const set = (ids: string[], v: boolean) => setSel(s => { const n = { ...s }; for (const id of ids) n[id] = v; return n; });
  const empty = !picked.length && !pickedAreas.length && !layers.length;
  const big = (c: MapCategory) => on(c) && (count[c.id] || 0) > BIG_CAT && !isLayer(c.id);

  /* перегляд бере той самий вибір, що й архів */
  const pins = useMemo(() => picked.map(m => { const c = catById[m.category]; return { x: m.x, y: m.y, icon: m.icon || c.icon, color: c.color }; }), [picked.map(m => m.id).join(), catById]);   // eslint-disable-line react-hooks/exhaustive-deps
  const shownAreas = useMemo(() => pickedAreas.map(a => ({ ring: a.ring, color: catById[a.category].color })), [pickedAreas.map(a => a.id).join(), catById]);   // eslint-disable-line react-hooks/exhaustive-deps

  async function go(withMarks = true) {
    setErr(''); setBusy('Готую…');
    try {
      const { buildGamePack } = await import('../lib/gameMap');
      const ps = withMarks ? pins : [];
      const blob = await buildGamePack(ps, { iconM, layers: withMarks ? layers : [], theme, areas: withMarks ? shownAreas : [] }, setBusy);
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'q-hub-minimap.zip';
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      setDone(true);
    } catch (e) { setErr('Не вдалося зібрати архів: ' + (e as Error).message); }
    setBusy('');
  }

  return (
    <div className="gx">
      <div className="gx-prev">
        <GamePreview theme={theme} names={layers.includes('names')} zones={layers.includes('zones')} pins={pins} areas={shownAreas} iconM={iconM} loading={loading} />
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
            <h3>Розмір значка</h3>
            <div className="mseg" role="radiogroup" aria-label="Розмір значка на мінікарті, метрів">
              {SIZES.map(v => <button key={v} type="button" role="radio" aria-checked={iconM === v} onClick={() => setIconM(v)}>{v} м</button>)}
            </div>
            <p className="muted gx-note">{iconM === 20 ? 'Рекомендовано: значки добре видно на мінікарті.' : 'Наблизь перегляд, щоб побачити, як значки виглядатимуть у місті.'}</p>
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
                        <label className="mcheck">
                          <input type="checkbox" checked={on(c)} onChange={e => set([c.id], e.target.checked)} />
                          <img src={c.icon} alt="" width={18} height={18} loading="lazy" />{c.name}<span className="cnt">{loading && !isLayer(c.id) ? '…' : count[c.id] || 0}</span>
                        </label>
                        {/* specs/017 FR-014: велика категорія (напр. 700+ гарбузів) закриє на мінікарті все інше */}
                        {big(c) && iconM > 12 && (
                          <p className="gx-warn">
                            <Icon name="alert" size={15} /><span>{count[c.id]} міток — на мінікарті вони закриють інші. Менший значок:</span>
                            <button type="button" className="gx-mini" onClick={() => setIconM(7)}>7 м</button>
                            <button type="button" className="gx-mini" onClick={() => setIconM(12)}>12 м</button>
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
              {!busy && !empty && <small>{packSummary({ marks: picked.length, areas: pickedAreas.length, names: layers.includes('names'), zones: layers.includes('zones'), theme, iconM })}</small>}</span>
          </button>
          {empty && !busy && <button type="button" className="btn ghost sm" onClick={() => go(false)}>Скачати лише мапу, без міток</button>}
        </div>
      </div>
    </div>
  );
}
