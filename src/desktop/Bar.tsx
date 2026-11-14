import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Hub from './Hub';
import { useAuth } from '../lib/auth';
import Icon from '../components/Icon';
import { dur, eventStatus, kyHM } from '../lib/events';
import { buyers, places, type BarPrice, type PlaceHit } from './barSearch';
import { loadMapData } from '../lib/mapMarks';
import Settings, { CHANGES, unseenCount, type SetSec } from './Settings';
import History, { type HistPick } from './History';
import { matchCats } from './catMatch';
import { searchRules, rulesExcerpt, type RuleHit, type RuleTopic } from './rulesSearch';
import RULES from '../data/rules.json';
import { asset } from '../lib/app';
import { CopyBtn, placesText, Prices, Rich, RuleCard, rulesText } from './barParts';
import { plainText } from './richText';
import { streamView } from './streamer';
import { pinStatus, type PinStatus } from './pinStatus';
import { pinPreview } from './pinPreview';
import { mapUrl } from '../lib/mapGeo';
import { freshAsks } from './barReset';
import { PROMO_QUIET, promoCommand, type SitePromo } from '../lib/alerts';

/* Плашка Alt+Q поверх гри — уся програма: рядок як у помічників для RP-серверів; під ним головна з кабінетом (Hub),
   а щойно пишеш — дві панелі пошуку.
   Режими: «Пошук» (Enter — пошук у правилах сервера й місцях мапи, Shift+Enter — спитати ШІ-помічника)
   і «Ціни» (миттєвий пошук по скупниках, без ШІ). Облік, угоди й склад прибрано (specs/040).
   Даних із бази тут немає — усе дає головний процес програми через міст (desktop/src/preload.cjs). */

/* ширина плашки: згорнута — лише рядок, розгорнута — головна, дашборд чи дві панелі */
/* плашка завжди однієї ширини — і порожня, і з результатами: не «стрибає», коли з'являються результати */
const BAR_WIDE = 1120;
export interface Prefs { autostart?: boolean; pinned: boolean; position: 'top' | 'center' | 'bottom'; opacity: number; hotkey: string; mode: 'ai' | 'prices'; tab: boolean; autoPrices: boolean; shareShots: boolean; pinKey?: string; autoUpdate?: boolean; mapKey?: string; timerKey?: string;
  /* сповіщення Windows (specs/075, 076): «час здавати» і нагадування про вибрані івенти */
  sellAlert?: boolean; eventAlert?: boolean; eventIds?: string[];
  /* режим стрімера: без ніка, персонажів і грошей у плашці (streamer.ts) */
  streamer?: boolean }
interface Data { /* товари, за якими стежу (specs/075), і промокод Q-Hub для вкладки над плашкою (specs/077; null — вимкнено адміном) */ watch?: (number | string)[]; promo?: SitePromo | null; user: { name: string; avatar: string | null; nick: string; nickChangedAt: string | null } | null; characters: { id: string; name: string; static: number | null }[]; character: string | null; prices: BarPrice[]; prefs: Prefs; staff?: boolean; version?: string; discord?: string; fullscreen?: boolean }
/* unseen — відповідь ШІ прийшла, поки плашку не бачили: при новому Alt+Q лишається лише вона (specs/082) */
interface Ask { q: string; reply: string; error?: string; hits?: RuleHit[]; places?: PlaceHit[]; unseen?: boolean }
interface BarApi {
  barData(): Promise<Data>; barCharacter(id: string): Promise<boolean>;
  rulesData(): Promise<{ fetched: string; topics: RuleTopic[] } | null>; onRulesChanged(cb: () => void): void;
  histAdd(it: { kind: 'ai' | 'search'; q: string; reply?: string }): Promise<void>; mapToggle(): Promise<boolean>; timerToggle(): Promise<void>;
  barPrefs(p: Partial<Prefs>): Promise<{ prefs: Prefs; error?: string }>;
  quickAsk(t: string, rules: string): Promise<{ reply: string; error?: string }>;
  quickSize(h: number, w: number): Promise<void>; quickHide(): Promise<void>; onQuickShow(cb: () => void): void; mapOpen(p: { id?: string; x: number; y: number }): Promise<void>;
  onPin(cb: (s: { text: string; bad?: boolean }) => void): void;
  onPinAsk(cb: (s: PinAskT) => void): void; onPinMiss?(cb: (s: PinMissT) => void): void; pinDecide(send: boolean, hint?: PinHint): Promise<void>;
  onShot(cb: (s: Shot) => void): void; onFullscreen(cb: (on: boolean) => void): void; shotLabel(name: string, label: string, note: string, share: boolean): Promise<{ ok: boolean; shared?: boolean }>;
  shotsStats(): Promise<ShotStats>; shotsOpen(): Promise<void>; visionLogOpen(): Promise<void>;
  watchToggle(id: number | string): Promise<(number | string)[] | null>; watchClear(): Promise<(number | string)[] | null>;
  ruleOpen?(h: Omit<RuleHit, 'score' | 'kind'> & { kind: RuleHit['kind'] | 'ai' }): Promise<boolean>;
}
interface Shot { name: string; preview: string; black: boolean }
/* player — звичайний гравець (specs/043 US5): пропозиція мітки в довідник, категорія й назва обов'язкові */
/* kind — код причини «не знайдено» для підказки (specs/080) */
interface PinAskT { reason: string; kind?: string | null; preview: string; cats: { id: string; name: string; grp: string }[]; point?: { x: number; y: number } | null; player?: boolean }
interface PinMissT { reason: string; kind?: string | null; preview: string; mapKey?: string }
interface PinHint { category: string; note: string; name?: string }
interface ShotStats { stats: Record<string, number>; labels: Record<string, string>; key: string }
const api = (window as unknown as { qhub: BarApi }).qhub;
/* правила й закони для пошуку: знімок rules-sync з програми (specs/010 US4), поки не прийшов — вбудована копія */
const BUILT = RULES as { fetched: string; topics: RuleTopic[] };
let TOPICS = BUILT.topics, RULES_AT = BUILT.fetched;
/* «станом на 29 жовтня» — коли зібрано правила, щоб гравець бачив, наскільки вони свіжі (FR-017) */
const rulesDay = () => new Date(RULES_AT.length === 10 ? RULES_AT + 'T12:00:00' : RULES_AT).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });

/* пошук у правилах сервера без ШІ — і для Enter, і для повтору з історії */
/* пошук без ШІ: правила сервера й місця на мапі (specs/014) */
const rulesAsk = (text: string, pl: PlaceHit[] = []): Ask => { const hits = searchRules(TOPICS, text); return { q: text, reply: hits.length || pl.length ? '' : 'У правилах, законах і на мапі такого не знайшов. Спробуй інакше або Shift+Enter — спитати ШІ.', hits, places: pl }; };
/* мітки мапи для пошуку місць — раз на 10 хв (FR-012), у ref: слухачі плашки створюються один раз */
const PLACES_TTL = 10 * 60e3;
/* вкладки над плашкою: найближчий івент, а поруч — промокод Q-Hub, але лише коли івент не йде й не почнеться
   за 15 хв (specs/077): перед івентом і під час нього промокод не заступає головне. Клік копіює команду для чату гри */
function Tabs({ promo }: { promo: SitePromo | null }) {
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState<'' | 'ok' | 'fail'>('');
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);
  const s = eventStatus(now).sort((a, b) => (a.now ? 0 : 1) - (b.now ? 0 : 1) || (a.next?.s ?? Infinity) - (b.next?.s ?? Infinity))[0];
  /* той самий поріг, що promoShown() у src/lib/alerts.ts: s — найближчий івент, тож досить його */
  const soon = !!s && (!!s.now || (!!s.next && s.next.s - now <= PROMO_QUIET));
  const copy = async () => {
    try { await navigator.clipboard.writeText(promoCommand(promo!.code)); setCopied('ok'); } catch { setCopied('fail'); }
    setTimeout(() => setCopied(''), 1600);
  };
  return <div className="btabs">
    {s && <div className={'btab' + (soon ? ' soon' : '')}><Icon name="clock" size={13} />{s.ev.name} · {s.now ? `іде, ще ${dur(s.now.e - now)}` : s.next ? `о ${kyHM(s.next.s)}, через ${dur(s.next.s - now)}` : '—'}</div>}
    {promo && !soon && <button type="button" className={'btab bpromo' + (copied ? ' ' + copied : '')} onClick={copy}
      title={`${promo.reward ? promo.reward.replace(/[.!]?$/, '. ') : ''}Клік — скопіювати команду ${promoCommand(promo.code)} для чату гри`}>
      <Icon name={copied === 'ok' ? 'check' : 'tag'} size={13} />
      <span aria-live="polite">{copied === 'ok' ? `Скопійовано ${promoCommand(promo.code)}` : copied === 'fail' ? `Не вийшло — введи ${promoCommand(promo.code)}` : <>Промокод Q-Hub: <b className="mono">{promo.code}</b></>}</span>
    </button>}
  </div>;
}

export default function Bar() {
  const [d, setD] = useState<Data | null>(null);
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'ai' | 'prices'>('ai');
  const [view, setView] = useState<'hub' | 'main' | 'settings' | 'shot' | 'pinask' | 'pinmiss'>('main');
  const [pinQ, setPinQ] = useState<PinAskT | null>(null);
  const [pinMiss, setPinMiss] = useState<PinMissT | null>(null);
  const [shot, setShot] = useState<Shot | null>(null);
  const [sel, setSel] = useState(0);
  const [asks, setAsks] = useState<Ask[]>([]);
  const [, setRulesAt] = useState(RULES_AT);   // прийшов новий знімок правил — перемалювати «станом на …»
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [histOn, setHistOn] = useState(false);
  const [mapOn, setMapOn] = useState(false);
  const placeData = useRef<{ at: number; marks: Parameters<typeof places>[1]; cats: Parameters<typeof places>[2] }>({ at: 0, marks: [], cats: [] });
  const loadPlaces = useCallback(() => {
    if (Date.now() - placeData.current.at < PLACES_TTL) return;
    loadMapData().then(m => { if (m) placeData.current = { at: Date.now(), marks: m.marks, cats: m.cats }; }).catch(() => { /* без мережі — без місць */ });
  }, []);
  const askRules = (text: string) => rulesAsk(text, places(text, placeData.current.marks, placeData.current.cats));
  /* журнал оновлень: що гравець уже бачив — у сховищі плашки; після оновлення внизу з'являється «що нового» */
  const [seenLog, setSeenLog] = useState<string | null>(() => { try { return localStorage.getItem('qhub.seenLog'); } catch { return null; } });
  const unseen = unseenCount(seenLog);
  const markSeen = useCallback(() => { const top = CHANGES[0]?.id ?? null; setSeenLog(top); try { if (top) localStorage.setItem('qhub.seenLog', top); } catch { /* не страшно: покаже ще раз */ } }, []);
  const [setStart, setSetStart] = useState<SetSec>('main');
  const [chars, setChars] = useState(false);
  const [shift, setShift] = useState(false);   // затиснутий Shift — Enter піде до ШІ, показати це одразу
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => { const x = await api.barData(); setD(x); if (x.prefs) setMode(x.prefs.mode); }, []);
  useEffect(() => {
    load();
    /* нове відкриття — як перше за сесію: без минулих відповідей (вони в «Історії»), крім непрочитаної відповіді ШІ (specs/082) */
    api.onQuickShow(() => { setAsks(freshAsks); setPeek(false); setQ(''); setView('main'); setSel(0); setNote(null); setChars(false); setHistOn(false); setMapOn(false); setBuyer(null); load(); loadPlaces(); setTimeout(() => input.current?.focus(), 0); });
    /* Alt+S у грі: знімок готовий — позначити, що на ньому */
    api.onShot(s => { setShot(s); setView('shot'); setNote(null); setChars(false); });
    api.onFullscreen(on => setD(x => (x ? { ...x, fullscreen: on } : x)));
    /* F9 у грі: чернетку мітки збережено чи ні — коротко внизу плашки, вона сама сховається */
    api.onPin(s => { setView('main'); setChars(false); setNote(s); setPinQ(null); });
    /* F9 без точки: спитати, чи надсилати знімок */
    api.onPinAsk(s => { setPinQ(s); setView('pinask'); setChars(false); setNote(null); });
    /* F9 у гравця без точки: червоний блок без фокусу, сам ховається (specs/080) */
    api.onPinMiss?.(s => { setPinMiss(s); setPinQ(null); setView('pinmiss'); setChars(false); setNote(null); });
    loadPlaces();
    const pullRules =() => api.rulesData?.().then(s => { if (s?.topics?.length) { TOPICS = s.topics; RULES_AT = s.fetched; setRulesAt(s.fetched); } }).catch(() => {});
    pullRules(); api.onRulesChanged?.(pullRules);
  }, [load]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e: KeyboardEvent) => setShift(e.shiftKey), off = () => setShift(false);
    window.addEventListener('keydown', k); window.addEventListener('keyup', k); window.addEventListener('blur', off);
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('keyup', k); window.removeEventListener('blur', off); };
  }, []);
  /* вікно точно під вміст: згорнута плашка — вузька й низька (лише рядок), розгорнута — широка, висота під вміст */
  const width = useRef(BAR_WIDE);
  const fit = useCallback(() => { const el = root.current; if (el) api.quickSize(Math.ceil(el.getBoundingClientRect().height) + 28, width.current); }, []);
  useLayoutEffect(() => {
    const el = root.current; if (!el) return;
    const ro = new ResizeObserver(fit);
    ro.observe(el); return () => ro.disconnect();
  }, [fit]);

  /* «Ціни»: назвав скупника чи товар — відкривається скупник з цінами */
  const [buyer, setBuyer] = useState<string | null>(null);
  const hits = useMemo(() => (d && mode === 'prices' ? buyers(d.prices, q) : []), [d, q, mode]);
  useEffect(() => { if (hits.length) setBuyer(hits[Math.min(sel, hits.length - 1)].buyer); }, [hits, sel]);
  const cur = useMemo(() => (d && buyer ? buyers(d.prices, buyer).find(b => b.buyer === buyer) ?? null : null), [d, buyer]);
  /* розділ кабінету — у головній плашки; почав писати на головній — під рядком пошук, стер — знову головна */
  const nav = useNavigate();
  const { signOut } = useAuth();
  const go = (p: string) => { nav(p); setQ(''); setView('hub'); setChars(false); };
  const v = view === 'hub' && q.trim() ? 'main' : view;
  const prefs = d?.prefs;
  const decidePin = (send: boolean, hint?: PinHint) => { setPinQ(null); setView('main'); api.pinDecide(send, hint); };
  const savePrefs = async (p: Partial<Prefs>) => { const r = await api.barPrefs(p); setD(x => (x ? { ...x, prefs: r.prefs } : x)); if (r.error) setNote({ text: r.error, bad: true }); };
  /* дзвіночок біля товару й «Очистити список» у налаштуваннях (specs/075): список тримає головний процес */
  const setWatch = (w: (number | string)[] | null) => { if (w) setD(x => (x ? { ...x, watch: w } : x)); };
  const toggleWatch = (id: number | string) => { api.watchToggle(id).then(setWatch); };
  const switchMode = (m: 'ai' | 'prices') => { setMode(m); setView('main'); setSel(0); setBuyer(null); savePrefs({ mode: m }); input.current?.focus(); };


  async function ask() {
    const text = q.trim(); if (!text || busy) return;
    setBusy(true); setNote(null);
    /* помічнику — пункти правил, найближчі до питання: він відповідає з них, а не з пам'яті */
    const r = await api.quickAsk(text, rulesExcerpt(searchRules(TOPICS, text, 40), 24000));
    setBusy(false);
    setAsks(a => [{ q: text, reply: r.reply || '', error: r.error, unseen: !document.hasFocus() }, ...a].slice(0, 30));
    setSel(0);
    if (!r.error && r.reply) api.histAdd({ kind: 'ai', q: text, reply: r.reply });
  }
  /* Enter без ШІ: пошук у правилах, законах і місцях мапи. Будь-який запит, і з самих цифр («10.10») — у правилах:
     облік з плашки прибрано (з 0.6), тож числа більше не перехоплюються як записи */
  function plain() {
    const text = q.trim(); if (!text || busy) return;
    setAsks(a => [askRules(text), ...a].slice(0, 30));
    setSel(0); setNote(null); api.histAdd({ kind: 'search', q: text });
  }
  /* історія — окрема плашка ліворуч (src/desktop/History.tsx) */
  /* історія — ліва колонка плашки, поки її не закрили (specs: «показуй тут завжди історію») */
  function toggleHistory() { setHistOn(h => !h); setMode('ai'); setView('main'); setChars(false); }
  /* вибрали рядок в історії: пошук і відповідь ШІ — праворуч без нового запиту (ліміт ШІ не витрачається) */
  function pickHist(it: HistPick) {
    setChars(false); setNote(null); setSel(0);
    if (!it.q) return;
    const text = it.q;
    setQ(text); setView('main');
    setAsks(a => [it.kind === 'ai' ? { q: text, reply: it.reply || '' } : askRules(text), ...a].slice(0, 30));
  }
  /* мапа Q-Hub — окрема плашка під цією, праворуч від історії (map.html, specs/014) */
  async function toggleMap() { setMapOn(await api.mapToggle()); }

  function onKey(e: React.KeyboardEvent) {
    /* Esc: меню → рядок → головна → сховати */
    if (e.key === 'Escape') { e.preventDefault(); if (chars) setChars(false); else if (q) setQ(''); else if (mode === 'prices' && buyer && view === 'main') setBuyer(null); else if (view !== 'main' && view !== 'shot') setView('main'); else api.quickHide(); return; }
    if (e.key === 'Tab') { e.preventDefault(); switchMode(mode === 'ai' ? 'prices' : 'ai'); return; }
    if (e.target !== input.current) return;   // стрілки й Enter у полях форми — їхні
    const n = mode === 'prices' ? hits.length : asks.length;
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && n) { e.preventDefault(); setSel(s => (s + (e.key === 'ArrowDown' ? 1 : n - 1)) % n); return; }
    if (e.key === 'Enter' && v === 'main') {
      e.preventDefault();
      if (mode === 'prices') return;
      if (e.shiftKey) ask(); else plain();
    }
  }

  const expanded = !!d && (v !== 'main' || (mode === 'prices' && (q.trim() !== '' || !!cur)) || (mode === 'ai' && (asks.length > 0 || busy || histOn)));
  useLayoutEffect(() => { fit(); }, [expanded, fit]);
  /* режим стрімера: підписи без ніка, аватара, імен персонажів і статіків; кабінет — під заслінкою, доки не відкриють */
  const streamer = !!prefs?.streamer;
  const sv = streamView(d?.user ?? null, d?.characters ?? [], streamer);
  const [peek, setPeek] = useState(false);
  const ch = sv.characters.find(c => c.id === d?.character);
  const aiNext = mode === 'ai' && shift;

  return (
    <div className="bwrap" ref={root} onKeyDown={onKey} style={prefs && prefs.opacity < 1 ? { opacity: prefs.opacity } : undefined}>
      {prefs?.tab !== false && <Tabs promo={d?.promo ?? null} />}
      {/* гра в повноекранному режимі — «зір» не бачить гру (blackwatch.cjs): плашка, таймер і ціни не працюють */}
      {d?.fullscreen && <div className="bfull" role="alert"><Icon name="alert" size={16} /><span><b>Q-Hub не бачить гру — вона в повноекранному режимі.</b> Постав у GTA V: Налаштування → Графіка → Режим екрана → «Вікно без рамки».</span></div>}
      <div className="bbox">
        <div className="bbar">
          <button className={'blogo' + (v === 'hub' ? ' on' : '')} onClick={() => (v === 'hub' ? setView('main') : go('/kabinet'))} title={v === 'hub' ? 'Згорнути' : 'Головна'} aria-label="Головна" aria-pressed={v === 'hub'}><img src={asset('/brand/q-hub-logo.svg')} alt="" width={30} height={30} /></button>
          {/* ‹ › — лише коли відкрита головна з кабінетом */}
          {v === 'hub' && <>
            <button className="bico" onClick={() => nav(-1)} title="Назад" aria-label="Назад"><Icon name="chev" size={16} className="tl" /></button>
            <button className="bico" onClick={() => nav(1)} title="Вперед" aria-label="Вперед"><Icon name="chev" size={16} className="tr" /></button>
          </>}
          {/* що зробить Enter: пошук, ШІ (з Shift) чи ціни */}
          <span className={'blead' + (aiNext ? ' ai' : '')} aria-hidden="true"><Icon name={mode === 'prices' ? 'tag' : aiNext ? 'spark' : 'search'} size={18} /></span>
          <input ref={input} value={q} autoFocus spellCheck={false} onChange={e => { setQ(e.target.value); setSel(0); setNote(null); }}
            placeholder={mode === 'ai' ? (aiNext ? 'Спитай ШІ своїми словами…' : 'Правило сервера, закон штату або питання') : 'Скупник чи товар: шкури, риба, глива…'} aria-label="Запит" />
          {q && <button className="bico" title="Очистити" onClick={() => { setQ(''); input.current?.focus(); }}><Icon name="x" size={15} /></button>}
          <div className="bseg" role="group" aria-label="Режим">
            <button aria-pressed={mode === 'ai'} onClick={() => switchMode('ai')}><Icon name="search" size={14} />Пошук</button>
            <button aria-pressed={mode === 'prices'} onClick={() => switchMode('prices')}><Icon name="tag" size={14} />Ціни</button>
          </div>
          <div className="bchar">
            <button className="bpill" onClick={() => setChars(c => !c)} aria-expanded={chars}>
              {sv.user?.avatar ? <img src={sv.user.avatar} alt="" /> : <span className="bava">{streamer ? 'Q' : (sv.user?.nick || ch?.name || 'Q')[0]}</span>}
              {/* зверху нік акаунта, під ним — вибраний персонаж зі статіком (specs/025): «D_VYRX» / «Dmitriy_Core #171028» */}
              <span className="bwho"><b>{sv.user?.nick || sv.user?.name || 'Q-Hub'}</b><small>{ch ? ch.name + (ch.static ? ' #' + ch.static : '') : 'Персонаж'}</small></span><Icon name="chev" size={14} />
            </button>
            {chars && d && <div className="bmenu" role="menu">{sv.characters.map(c => (
              <button key={c.id} role="menuitemradio" aria-checked={c.id === d.character} onClick={async () => { setChars(false); await api.barCharacter(c.id); load(); }}>{c.name}{c.static ? <small className="mono"> #{c.static}</small> : null}</button>))}
              <button onClick={() => go('/kabinet/nalashtuvannya')}>Персонажі й профіль…</button>
              <button onClick={() => { setChars(false); signOut(); }}>Вийти з акаунта</button></div>}
          </div>
          <span className="bsep" aria-hidden="true" />
          <button className={'bico' + (prefs?.pinned ? ' on' : '')} title={prefs?.pinned ? 'Відкріпити: ховати, коли повертаюсь у гру' : 'Закріпити поверх гри'} aria-pressed={!!prefs?.pinned} onClick={() => savePrefs({ pinned: !prefs?.pinned })}><Icon name="pin" size={17} /></button>
          <button className="bico" title={`Таймер заробітку (${prefs?.timerKey || "Alt+T"})`} aria-label="Таймер заробітку" onClick={() => { api.timerToggle().catch(() => {}); }}><Icon name="clock" size={17} /></button>
          <button className={'bico' + (histOn ? ' on' : '')} title="Історія: пошуки й питання до ШІ" aria-pressed={histOn} onClick={toggleHistory}><Icon name="history" size={17} /></button>
          <button className={'bico' + (mapOn ? ' on' : '')} title={`Мапа Q-Hub · ${prefs?.mapKey || 'Alt+M'}`} aria-label="Мапа Q-Hub" aria-pressed={mapOn} onClick={toggleMap}><Icon name="map" size={17} /></button>
          {/* «?» — комбінації клавіш (Налаштування → Клавіші, список — src/lib/hotkeys.ts); повторний клік закриває */}
          <button className={'bico' + (view === 'settings' && setStart === 'keys' ? ' on' : '')} title="Комбінації клавіш" aria-label="Комбінації клавіш" onClick={() => { const open = view === 'settings' && setStart === 'keys'; setSetStart('keys'); setView(open ? 'main' : 'settings'); }}><Icon name="help" size={17} /></button>
          <button className={'bico' + (view === 'settings' && setStart !== 'keys' ? ' on' : '')} title="Налаштування плашки" onClick={() => { const open = view === 'settings' && setStart !== 'keys'; setSetStart('main'); setView(open ? 'main' : 'settings'); }}><Icon name="gear" size={17} />{unseen > 0 && <i className="bdot" aria-hidden="true" />}</button>
        </div>

        {expanded && (v === 'hub' ? (streamer && !peek ? <div className="bveil"><Icon name="shield" size={22} /><b>Режим стрімера</b><p>У кабінеті — персонажі, документи й заробіток. Глядачам їх не видно, доки не відкриєш.</p><button className="btn sm" onClick={() => setPeek(true)}>Показати кабінет</button></div> : <Hub />) : v === 'settings' && prefs ? <Settings key={setStart} prefs={prefs} staff={!!d?.staff} save={savePrefs} user={sv.user} version={d?.version} discord={d?.discord} start={setStart} unseen={unseen} onSeen={markSeen} watching={d?.watch?.length ?? 0} onWatchClear={() => { api.watchClear().then(setWatch); }} /> : <div className="bpanes">
          {v === 'pinask' && pinQ ? <PinAsk ask={pinQ} decide={decidePin} /> :
           v === 'pinmiss' && pinMiss ? <PinMiss miss={pinMiss} /> :
           v === 'shot' && shot ? <ShotView shot={shot} share0={prefs?.shareShots !== false} done={t => { setNote({ text: t }); setTimeout(() => api.quickHide(), 900); }} /> :
           mode === 'prices' ? <Prices hits={hits} setSel={setSel} cur={cur} q={q} watch={d?.watch} onWatch={toggleWatch} /> :
           <Ai asks={asks} sel={sel} setSel={setSel} busy={busy} q={q} left={histOn ? <History onPick={pickHist} onClose={() => { setHistOn(false); input.current?.focus(); }} /> : null} />}
        </div>)}

        <div className="bhint">
          {!note && !busy && !q && unseen > 0 && v === 'main' ? <button className="bnew" onClick={() => { setSetStart('changes'); setView('settings'); }}><Icon name="spark" size={14} />Програму оновлено — що нового</button> :
          <span className={note?.bad ? 'bad' : note ? 'good' : ''}>{note?.text ?? (busy ? 'ШІ думає…' : mode === 'ai' ? (aiNext ? 'Enter зараз спитає ШІ' : 'Шукає в правилах сервера й законах штату, без ШІ') : 'Назви скупника чи товар — ціни, межі й коли їх оновили')}</span>}
          <span className="bkeys">{mode === 'ai'
            ? <><span className={aiNext ? '' : 'on'}><kbd>Enter</kbd>пошук</span><span className={aiNext ? 'on ai' : ''}><kbd>Shift</kbd><kbd>Enter</kbd>ШІ</span></>
            : <span className="on"><kbd>↑</kbd><kbd>↓</kbd>вибір</span>}
            <span><kbd>Tab</kbd>{mode === 'ai' ? 'ціни' : 'пошук'}</span><span><kbd>Esc</kbd>сховати</span></span>
        </div>
      </div>
    </div>
  );
}

/* left — історія замість списку запитів цієї сесії, коли натиснуто «Історія» */
function Ai({ asks, sel, setSel, busy, q, left }: { asks: Ask[]; sel: number; setSel: (n: number) => void; busy: boolean; q: string; left?: React.ReactNode }) {
  const a = asks[sel];
  const kind = (x: Ask) => (x.error ? 'err' : x.hits ? 'rules' : 'ai');
  const meta = (x: Ask) => x.error ? 'помилка' : x.hits ? (x.hits.length || x.places?.length ? [x.places?.length && `місця · ${x.places.length}`, x.hits.length && `правила · ${x.hits.length}`].filter(Boolean).join(' · ') : 'нічого не знайдено') : 'відповідь ШІ';
  const ICO = { rules: 'search', ai: 'spark', err: 'x' } as const;
  return <>
    <div className="bleft">{left ?? <>
      {busy && <div className="brow item on"><span className="bkico ai"><Icon name="spark" size={15} /></span><span><b>{q.trim()}</b><small>ШІ думає…</small></span></div>}
      {asks.map((x, i) => <button key={i} className={'brow item' + (!busy && i === sel ? ' on' : '')} onClick={() => setSel(i)}>
        <span className={'bkico ' + kind(x)}><Icon name={ICO[kind(x)]} size={15} /></span><span><b>{x.q}</b><small>{meta(x)}</small></span></button>)}
    </>}</div>
    <div className="bright">{busy && sel === 0 ? <div className="bskel" aria-label="ШІ думає"><i /><i /><i /></div> : a ? <>
      {a.hits ? <>
        {a.places && a.places.length > 0 && <>
          <div className="bkind brow-h"><Icon name="map" size={14} />Місця на мапі · клік — показати на мапі Q-Hub<CopyBtn text={placesText(a.places)} label="Копіювати місця з координатами" /></div>
          <ul className="bplaces">{a.places.map(h => <li key={h.id}><button className="brow item" onClick={() => api.mapOpen({ id: h.id, x: h.x, y: h.y })}>
            <img src={asset(h.icon)} alt="" width={22} height={22} /><span><b>{h.name}</b><small>{h.cat} · X {Math.round(h.x)} · Y {Math.round(h.y)}</small></span></button></li>)}</ul>
        </>}
        {(a.hits.length > 0 || !a.places?.length) && <div className="bkind brow-h"><Icon name="search" size={14} />Правила й закони{a.hits.length ? ` · ${a.hits.length} збігів` : ''} · станом на {rulesDay()}
          {a.hits.length > 1 && <CopyBtn text={rulesText(a.hits)} label="Копіювати всі знайдені пункти" short="Копіювати все" />}</div>}
        {a.reply && <p className="bnone">{a.reply}</p>}
        {a.hits.length > 0 && <ul className="brules">{a.hits.map((h, i) => <RuleCard key={a.q + i} h={h} onOpen={api.ruleOpen ? x => { api.ruleOpen!({ topic: x.topic, url: x.url, kind: x.kind, n: x.n, h: x.h, s: x.s }).catch(() => {}); } : undefined} />)}</ul>}
        <p className="btip"><Icon name="spark" size={14} />Не те? <kbd>Shift</kbd>+<kbd>Enter</kbd> — спитати ШІ своїми словами</p>
      </> : <>
        <div className="bkind ai brow-h"><Icon name="spark" size={14} />Відповідь ШІ
          {/* «Окремо» (specs/084): відповідь — вкладкою у вікні правил, як пункт правил */}
          {!a.error && api.ruleOpen && <button type="button" className="bcopy bopen" title="Відкрити окремо — вікно лишиться поверх гри, коли закриєш Alt+Q"
            onClick={() => { api.ruleOpen!({ topic: a.q, url: '', kind: 'ai', n: '', h: '', s: a.reply }).catch(() => {}); }}><Icon name="layers" size={14} /><span>Окремо</span></button>}</div>
        {a.error ? <p className="bad">{a.error}</p> : <div className="bans"><Rich text={a.reply} /><CopyBtn icon text={plainText(a.reply)} label="Копіювати відповідь" /></div>}
        {!a.error && <p className="bfine">ШІ відповідає з правил сервера, але може помилятися — перевір пункт на форумі.</p>}
      </>}
    </> : left ? <p className="bnone">Обери рядок в історії ліворуч — пошук чи відповідь ШІ з’явиться тут без нового запиту.</p> : null}</div>
  </>;
}


/* навчальний знімок: що на ньому — з таких прикладів програма вчиться бачити тригери в грі */
/* F9: показати знімок і дати одразу вибрати категорію й опис (підказка адміну).
   Точку знайдено — надіслати з точкою; не знайдено — надіслати без точки (поставить адмін) чи ні */
/* блок стану мітки (specs/080): зелений із галочкою — точку знайдено, червоний зі знаком уваги — ні; колір не єдиний сигнал */
function PinState({ st, point }: { st: PinStatus; point?: { x: number; y: number } | null }) {
  return (
    <div className={'bpinst ' + st.tone} role="status">
      <h3><Icon name={st.tone === 'ok' ? 'check' : 'alert'} size={18} />{st.title}</h3>
      <p className="bpinline">{point ? <>X <b className="mono">{point.x}</b> · Y <b className="mono">{point.y}</b></> : st.line}</p>
      <p className="muted">{st.help}</p>
    </div>
  );
}

/* шматок мапи Q-Hub навколо знайденої точки (specs/083 US2): гравець порівнює зі знімком, куди ляже мітка */
function PinMap({ x, y }: { x: number; y: number }) {
  const p = useMemo(() => pinPreview(x, y, 240), [x, y]);
  return (
    <figure className="bpinmap-w">
      <div className="bpinmap" aria-label="Мапа Q-Hub навколо точки мітки">
        {p.tiles.map(t => <img key={t.tx + '/' + t.ty} src={mapUrl(`/map/${t.z}/${t.tx}/${t.ty}.webp`)} alt="" style={{ left: t.left, top: t.top }} />)}
        <i className="bpinmap-x" style={{ left: p.pin.left, top: p.pin.top }} aria-hidden="true" />
      </div>
      <figcaption>Мапа Q-Hub · сюди ляже мітка</figcaption>
    </figure>
  );
}

/* гравцю точку не знайдено: лише показати, що й чому (форми немає — без точки мітку не надіслати); керування в грі */
function PinMiss({ miss }: { miss: PinMissT }) {
  const st = pinStatus({ point: null, player: true, kind: miss.kind, reason: miss.reason, mapKey: miss.mapKey });
  return <>
    <div className="bleft bshot bad"><img src={miss.preview} alt="Знімок, зроблений по F9" /></div>
    <div className="bright"><PinState st={st} /></div>
  </>;
}

function PinAsk({ ask, decide }: { ask: PinAskT; decide: (send: boolean, hint?: PinHint) => void }) {
  const [text, setText] = useState(''); const [pick, setPick] = useState(0); const [note, setNote] = useState('');
  const [name, setName] = useState(''); const [miss, setMiss] = useState('');
  const first = useRef<HTMLInputElement>(null), box = useRef<HTMLDivElement>(null);
  const found = useMemo(() => matchCats(ask.cats, text), [ask.cats, text]);
  const chosen = found[Math.min(pick, found.length - 1)];
  /* курсор — одразу в полі категорії: і коли форма з'явилась, і коли вікно отримало фокус пізніше */
  useEffect(() => {
    const f = () => { if (!box.current?.contains(document.activeElement)) first.current?.focus(); };
    f(); window.addEventListener('focus', f); return () => window.removeEventListener('focus', f);
  }, []);
  const send = (yes: boolean) => {
    /* гравцю без категорії й назви — не надсилати, а сказати, чого бракує */
    if (yes && ask.player && (!chosen || !text.trim() || !name.trim())) { setMiss(!chosen || !text.trim() ? 'Вибери категорію зі списку.' : 'Напиши назву місця.'); return; }
    decide(yes, yes ? { category: chosen?.id || '', note, name } : undefined);
  };
  /* Enter — надіслати, Esc — не надсилати, ↑↓ — інша категорія зі збігів; не пускати ці клавіші далі в плашку */
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); send(e.key === 'Enter'); return; }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && found.length) { e.preventDefault(); e.stopPropagation(); setPick(p => (p + (e.key === 'ArrowDown' ? 1 : found.length - 1)) % found.length); }
  };
  const st = pinStatus(ask);
  return <>
    <div className={'bleft bshot ' + st.tone}><img src={ask.preview} alt="Знімок, зроблений по F9" />
      {ask.point && <PinMap x={ask.point.x} y={ask.point.y} />}</div>
    <div className="bright" ref={box} onKeyDown={onKey}>
      <PinState st={st} point={ask.point} />
      <label className="bnote">{ask.player ? 'Категорія' : 'Категорія (необов’язково)'}
        <input ref={first} value={text} onChange={e => { setText(e.target.value); setPick(0); }} placeholder="почни писати: бак, заправка, 24/7…"
          role="combobox" aria-expanded={found.length > 0} aria-controls="pin-cats" aria-activedescendant={chosen ? 'pin-cat-' + chosen.id : undefined} /></label>
      {text.trim() && <div className="bcats" id="pin-cats" role="listbox" aria-label="Категорії">
        {found.length ? found.map(c => (
          <button key={c.id} id={'pin-cat-' + c.id} role="option" aria-selected={c === chosen} className={c === chosen ? 'on' : ''} tabIndex={-1}
            onMouseDown={e => e.preventDefault()} onClick={() => setPick(found.indexOf(c))}>{c.name}<small>{c.grp}</small></button>))
          : <span className="muted">{ask.player ? 'Такої категорії немає — спробуй інше слово' : 'Такої категорії немає — адмін вибере сам'}</span>}
      </div>}
      {ask.player && <label className="bnote">Назва<input value={name} onChange={e => { setName(e.target.value); setMiss(''); }} maxLength={160} placeholder="напр. Бак біля 24/7 на Гроув-стріт" /></label>}
      <label className="bnote">Опис (необов’язково)<input value={note} onChange={e => setNote(e.target.value)} maxLength={600} placeholder="напр. бак за магазином 24/7, біля входу" /></label>
      <div className="row">
        <button className="btn acc" onClick={() => send(true)}>{ask.player ? 'Надіслати мітку' : ask.point ? 'Надіслати точку' : 'Надіслати без точки'}</button>
        <button className="btn" onClick={() => send(false)}>Не надсилати</button>
      </div>
      {miss && <small className="err" role="alert">{miss}</small>}
      <small className="muted"><kbd>↑↓</kbd> інша категорія · <kbd>Tab</kbd> далі · <kbd>Enter</kbd> надіслати · <kbd>Esc</kbd> не надсилати</small>
    </div>
  </>;
}

function ShotView({ shot, share0, done }: { shot: Shot; share0: boolean; done: (t: string) => void }) {
  const [st, setSt] = useState<ShotStats | null>(null);
  const [note, setNote] = useState('');
  const [share, setShare] = useState(share0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.shotsStats().then(setSt); setNote(''); }, [shot.name]);
  async function mark(label: string) {
    setBusy(true);
    const r = await api.shotLabel(shot.name, label, note, share);
    setBusy(false);
    if (!r.ok) return;
    const sent = share ? (r.shared ? ' і надіслано розробникам' : ' (надіслати не вдалося — лишився лише в тебе)') : '';
    done(`«${st?.labels[label]}» збережено${sent} — таких уже ${(st?.stats[label] ?? 0) + 1}`);
  }
  return <>
    <div className="bleft bshot">
      <img src={shot.preview} alt="Знімок екрана гри" />
      {shot.black && <p className="bad">Кадр чорний — гра, схоже, в повноекранному режимі. Перемкни її на «Без рамки» (Borderless), інакше програма не бачитиме гру.</p>}
      <small className="muted">{shot.name}.png</small>
    </div>
    <div className="bright">
      <h3>Що на знімку?</h3>
      <p className="muted">З цих прикладів програма вчиться сама помічати такі екрани в грі. Потрібно 5–10 кожного типу.</p>
      <div className="blabels">{st && Object.entries(st.labels).map(([k, l]) => (
        <button key={k} className="btn" disabled={busy} onClick={() => mark(k)}>{l}<small>{st.stats[k] || 0}</small></button>))}</div>
      <label className="bnote">Примітка (необов’язково)<input value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder="напр. скупник Гриби, вікно з цінами" /></label>
      <label className="bchk bshare"><input type="checkbox" checked={share} onChange={e => setShare(e.target.checked)} />
        <span>Поділитися з розробниками Q-Hub — так програма швидше вчиться бачити гру. Знімок бачить лише адмін; якщо на ньому чат чи чужі ніки, зніми прапорець.</span></label>
      <small className="muted"><kbd>Esc</kbd> — лишити без позначки</small>
    </div>
  </>;
}

