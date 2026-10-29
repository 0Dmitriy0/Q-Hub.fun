import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Hub from './Hub';
import { useAuth } from '../lib/auth';
import Icon from '../components/Icon';
import { dur, eventStatus, kyHM } from '../lib/events';
import { money, when } from '../lib/format';
import { buyers, pos, type BarPrice, type BuyerHit } from './barSearch';
import Settings, { CHANGES, unseenCount, type SetSec } from './Settings';
import { matchCats } from './catMatch';
import { searchRules, rulesExcerpt, type RuleHit, type RuleTopic } from './rulesSearch';
import RULES from '../data/rules.json';
import { asset } from '../lib/app';
import { isSellQuestion, sellAdvice, type Sell } from './sellAdvice';

/* Плашка Alt+Q поверх гри — уся програма: рядок як у помічників для RP-серверів; під ним головна з кабінетом (Hub),
   а щойно пишеш — дві панелі пошуку.
   Режими: «Пошук» (Enter — пошук у правилах сервера чи запис із сумою без ШІ, Shift+Enter — спитати ШІ-помічника)
   і «Ціни» (миттєвий пошук по скупниках, без ШІ).
   Даних із бази тут немає — усе дає головний процес програми через міст (desktop/src/preload.cjs). */

type Op = 'buy' | 'farm' | 'sell';
type Acc = 'cash' | 'card';
interface TxAct { kind: 'tx'; type: 'in' | 'out'; amount: number; category: string; note: string; account?: Acc }
interface MoveAct { kind: 'transfer'; from: Acc; to: Acc; amount: number }
interface DealAct { kind: 'deal'; op: Op; item: string; qty: number; price: number; tx: Omit<TxAct, 'kind'> | null }
interface Rec { type: 'in' | 'out'; amount: number; category: string; note: string; ts: string; account?: Acc; source: string }
interface EditAct { kind: 'edit'; id: string; rec: Rec; set: Partial<Pick<Rec, 'type' | 'amount' | 'category' | 'note' | 'account'>> }
interface DelAct { kind: 'delete'; id: string; rec: Rec }
type Action = TxAct | DealAct | MoveAct | EditAct | DelAct;
const ACC: Record<Acc, string> = { cash: 'готівка', card: 'картка' };
/* ширина плашки: згорнута — лише рядок, розгорнута — головна, дашборд чи дві панелі */
const BAR_NARROW = 820, BAR_WIDE = 1120;
type Rule = { kind?: 'transfer'; type?: 'in' | 'out'; amount: number; category?: string; account?: Acc; from?: Acc; to?: Acc }
  | { kind: 'deal'; op: Op; item: string; qty: number; unit: string; price: number | null } | null;
export interface Prefs { autostart?: boolean; pinned: boolean; position: 'top' | 'center' | 'bottom'; opacity: number; hotkey: string; mode: 'ai' | 'prices'; tab: boolean; autoLedger: boolean; autoPrices: boolean; shareShots: boolean; pinKey?: string; autoUpdate?: boolean; mapKey?: string }
interface Data { user: { name: string; avatar: string | null; gameName: string; staticId: number | null } | null; characters: { id: string; name: string }[]; character: string | null; prices: BarPrice[]; stock: Record<string, number>; prefs: Prefs; staff?: boolean; version?: string }
interface Ask { q: string; reply: string; actions: Action[]; done: boolean; error?: string; hits?: RuleHit[]; sells?: Sell[] }
type Res = { ok?: boolean; error?: string; character?: string };
interface BarApi {
  barData(): Promise<Data>; barCharacter(id: string): Promise<boolean>;
  histAdd(it: { kind: 'ai' | 'search'; q: string; reply?: string }): Promise<void>; histToggle(): Promise<boolean>; mapToggle(): Promise<boolean>;
  onHistPick(cb: (it: { kind: 'ai' | 'search' | 'tx'; q?: string; reply?: string }) => void): void;
  barPrefs(p: Partial<Prefs>): Promise<{ prefs: Prefs; error?: string }>;
  quickParse(t: string, buyer?: string | null): Promise<Rule>;
  quickAdd(t: string, buyer?: string | null): Promise<Res>; quickAsk(t: string, rules: string): Promise<{ reply: string; actions: Action[]; error?: string }>;
  quickRun(): Promise<Res>;
  quickSize(h: number, w: number): Promise<void>; quickHide(): Promise<void>; onQuickShow(cb: () => void): void;
  onPin(cb: (s: { text: string; bad?: boolean }) => void): void;
  onPinAsk(cb: (s: PinAskT) => void): void; pinDecide(send: boolean, hint?: PinHint): Promise<void>;
  onShot(cb: (s: Shot) => void): void; shotLabel(name: string, label: string, note: string, share: boolean): Promise<{ ok: boolean; shared?: boolean }>;
  shotsStats(): Promise<ShotStats>; shotsOpen(): Promise<void>; visionLogOpen(): Promise<void>;
}
interface Shot { name: string; preview: string; black: boolean }
interface PinAskT { reason: string; preview: string; cats: { id: string; name: string; grp: string }[]; point?: { x: number; y: number } | null }
interface PinHint { category: string; note: string }
interface ShotStats { stats: Record<string, number>; labels: Record<string, string>; key: string }
const api = (window as unknown as { qhub: BarApi }).qhub;
const TOPICS = (RULES as { topics: RuleTopic[] }).topics;

const OPS: Record<Op, string> = { buy: 'Купив', farm: 'Нафармив', sell: 'Продав' };
/* рядок починається з угоди («продав …», «нафармив …») — як DEAL_OPS у desktop/src/quick.cjs */
const DEAL = /^\s*((на)?фарм|зібра|накопа|налов|добу|нарубав|нарубала|назбира|купи|скупи|прикупи|прода|зда|збув)/i;
/* пошук у правилах сервера без ШІ — і для Enter, і для повтору з історії */
const rulesAsk = (text: string): Ask => { const hits = searchRules(TOPICS, text); return { q: text, reply: hits.length ? '' : 'У правилах сервера такого не знайшов. Спробуй інакше або Shift+Enter — спитати ШІ.', actions: [], done: true, hits }; };
const sum = (type: 'in' | 'out', n: number) => <b className={type === 'in' ? 'good' : 'bad'}>{type === 'in' ? '+' : '−'}{money(n)}</b>;

/* запис, який помічник пропонує змінити чи видалити */
const RecLine = ({ r }: { r: Rec }) => <>{sum(r.type, r.amount)} · {r.category} · {ACC[r.account ?? 'cash']}{r.note ? ` · «${r.note}»` : ''} <small className="muted">{when(r.ts)}</small></>;

function ActLine({ a }: { a: Action }) {
  if (a.kind === 'delete') return <li className="bdel">Видалити: <RecLine r={a.rec} />{a.rec.source === 'deal' && <small className="bad"> · разом з угодою (товар зникне зі складу)</small>}{a.rec.source === 'transfer' && <small> · обидві половини переказу</small>}</li>;
  if (a.kind === 'edit') { const n = { ...a.rec, ...a.set }; return <li>Змінити: <s className="muted"><RecLine r={a.rec} /></s><br />→ <RecLine r={n} /></li>; }
  if (a.kind === 'transfer') return <li>Переказ <b>{money(a.amount)}</b>: {ACC[a.from]} → {ACC[a.to]}</li>;
  if (a.kind === 'tx') return <li>{sum(a.type, a.amount)} · {a.category} · {ACC[a.account ?? 'cash']}{a.note ? ` · ${a.note}` : ''}</li>;
  return <li>{OPS[a.op]} <b>{a.item}</b> × {a.qty}{a.op !== 'farm' && <> по {money(a.price)}</>}{a.tx && <> → {sum(a.tx.type, a.tx.amount)} · {a.tx.category}</>}</li>;
}

/* найближчий івент — у вкладці над плашкою */
function NextEvent() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);
  const s = eventStatus(now).sort((a, b) => (a.now ? 0 : 1) - (b.now ? 0 : 1) || (a.next?.s ?? Infinity) - (b.next?.s ?? Infinity))[0];
  if (!s) return null;
  const soon = s.now || (s.next && s.next.s - now <= 15 * 60e3);
  return <div className={'btab' + (soon ? ' soon' : '')}><Icon name="clock" size={13} />{s.ev.name} · {s.now ? `іде, ще ${dur(s.now.e - now)}` : s.next ? `о ${kyHM(s.next.s)}, через ${dur(s.next.s - now)}` : '—'}</div>;
}

export default function Bar() {
  const [d, setD] = useState<Data | null>(null);
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'ai' | 'prices'>('ai');
  const [view, setView] = useState<'hub' | 'main' | 'settings' | 'shot' | 'pinask'>('main');
  const [pinQ, setPinQ] = useState<PinAskT | null>(null);
  const [shot, setShot] = useState<Shot | null>(null);
  const [sel, setSel] = useState(0);
  const [asks, setAsks] = useState<Ask[]>([]);
  const [rule, setRule] = useState<Rule>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [histOn, setHistOn] = useState(false);
  const [mapOn, setMapOn] = useState(false);
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
    api.onQuickShow(() => { setQ(''); setView('main'); setSel(0); setNote(null); setChars(false); setHistOn(false); setBuyer(null); load(); setTimeout(() => input.current?.focus(), 0); });
    /* Alt+S у грі: знімок готовий — позначити, що на ньому */
    api.onShot(s => { setShot(s); setView('shot'); setNote(null); setChars(false); });
    /* F9 у грі: чернетку мітки збережено чи ні — коротко внизу плашки, вона сама сховається */
    api.onPin(s => { setView('main'); setChars(false); setNote(s); setPinQ(null); });
    /* F9 без точки: спитати, чи надсилати знімок */
    api.onPinAsk(s => { setPinQ(s); setView('pinask'); setChars(false); setNote(null); });
    /* вибрали рядок в історії: пошук і відповідь ШІ — показати знову без нового запиту, запис — облік */
    api.onHistPick(it => {
      setChars(false); setNote(null); setSel(0);
      if (it.kind === 'tx' || !it.q) { nav('/kabinet/oblik'); setQ(''); setView('hub'); return; }
      const text = it.q;
      setQ(text); setMode('ai'); setView('main');
      setAsks(a => [it.kind === 'ai' ? { q: text, reply: it.reply || '', actions: [], done: true } : rulesAsk(text), ...a].slice(0, 30));
      setTimeout(() => input.current?.focus(), 0);
    });
  }, [load]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => setShift(e.shiftKey), off = () => setShift(false);
    window.addEventListener('keydown', k); window.addEventListener('keyup', k); window.addEventListener('blur', off);
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('keyup', k); window.removeEventListener('blur', off); };
  }, []);
  /* вікно точно під вміст: згорнута плашка — вузька й низька (лише рядок), розгорнута — широка, висота під вміст */
  const width = useRef(BAR_NARROW);
  const fit = useCallback(() => { const el = root.current; if (el) api.quickSize(Math.ceil(el.getBoundingClientRect().height) + 28, width.current); }, []);
  useLayoutEffect(() => {
    const el = root.current; if (!el) return;
    const ro = new ResizeObserver(fit);
    ro.observe(el); return () => ro.disconnect();
  }, [fit]);

  /* «Ціни»: назвав скупника чи товар — відкривається скупник; «продав …» у цьому режимі — угода за ціною відкритого скупника */
  const [buyer, setBuyer] = useState<string | null>(null);
  const dealish = mode === 'prices' && DEAL.test(q);
  const hits = useMemo(() => (d && mode === 'prices' && !dealish ? buyers(d.prices, q, d.stock) : []), [d, q, mode, dealish]);
  useEffect(() => { if (hits.length) setBuyer(hits[Math.min(sel, hits.length - 1)].buyer); }, [hits, sel]);
  const cur = useMemo(() => (d && buyer ? buyers(d.prices, buyer, d.stock).find(b => b.buyer === buyer) ?? null : null), [d, buyer]);
  /* розділ кабінету — у головній плашки; почав писати на головній — під рядком пошук, стер — знову головна */
  const nav = useNavigate();
  const { signOut } = useAuth();
  const go = (p: string) => { nav(p); setQ(''); setView('hub'); setChars(false); };
  const v = view === 'hub' && q.trim() ? 'main' : view;
  const dash = useLocation().pathname === '/kabinet/dashbord' && v === 'hub';
  const prefs = d?.prefs;
  const decidePin = (send: boolean, hint?: PinHint) => { setPinQ(null); setView('main'); api.pinDecide(send, hint); };
  const savePrefs = async (p: Partial<Prefs>) => { const r = await api.barPrefs(p); setD(x => (x ? { ...x, prefs: r.prefs } : x)); if (r.error) setNote({ text: r.error, bad: true }); };
  const switchMode = (m: 'ai' | 'prices') => { setMode(m); setView('main'); setSel(0); setBuyer(null); savePrefs({ mode: m }); input.current?.focus(); };

  /* «без ШІ» підказка під рядком: що запишеться по Enter (з питанням «?» — пошук у правилах) */
  useEffect(() => {
    if ((mode !== 'ai' && !dealish) || !q.trim()) { setRule(null); return; }
    let live = true; api.quickParse(q, mode === 'prices' ? buyer : null).then(r => live && setRule(r)); return () => { live = false; };
  }, [q, mode, dealish, buyer]);

  const latest = asks[0];
  async function ask() {
    const text = q.trim(); if (!text || busy) return;
    if (pending(text)) return runPlan();
    setBusy(true); setNote(null);
    /* помічнику — пункти правил, найближчі до питання: він відповідає з них, а не з пам'яті */
    const r = await api.quickAsk(text, rulesExcerpt(searchRules(TOPICS, text, 14)));
    setBusy(false);
    setAsks(a => [{ q: text, reply: r.reply || '', actions: r.actions || [], done: !(r.actions || []).length, error: r.error }, ...a].slice(0, 30));
    setSel(0);
    if (!r.error && r.reply) api.histAdd({ kind: 'ai', q: text, reply: r.reply });
  }
  const pending = (text: string) => !!latest && !latest.done && latest.actions.length > 0 && latest.q === text;
  async function runPlan() {   // Enter після відповіді помічника — записати його план
    setBusy(true); const r = await api.quickRun(); setBusy(false);
    if (r.error) { setNote({ text: r.error, bad: true }); return; }
    setAsks(a => [{ ...a[0], done: true }, ...a.slice(1)]); setNote({ text: `Записано · ${r.character}` }); setQ(''); load();
  }
  /* Enter без ШІ: план помічника чекає — записати; є сума — запис за правилами; інакше — пошук у правилах сервера */
  function plain() {
    const text = q.trim(); if (!text || busy) return;
    if (pending(text)) { runPlan(); return; }
    if (rule && !text.includes('?')) { quickRule(); return; }
    /* «що продати?» — відповідь зі складу й цін скупників, без ШІ */
    if (d && isSellQuestion(text)) {
      setAsks(a => [{ q: text, reply: '', actions: [], done: true, sells: sellAdvice(d.prices, d.stock) }, ...a].slice(0, 30));
      setSel(0); setNote(null); api.histAdd({ kind: 'search', q: text }); return;
    }
    setAsks(a => [rulesAsk(text), ...a].slice(0, 30));
    setSel(0); setNote(null); api.histAdd({ kind: 'search', q: text });
  }
  async function quickRule() {
    if (!rule) { setNote({ text: 'Без ШІ потрібна сума — наприклад, 450к', bad: true }); return; }
    setBusy(true); const r = await api.quickAdd(q, mode === 'prices' ? buyer : null); setBusy(false);
    setNote(r.error ? { text: r.error, bad: true } : { text: `Записано · ${r.character}` }); if (!r.error) { setQ(''); load(); }
  }
  /* історія — окрема плашка ліворуч (src/desktop/History.tsx) */
  async function toggleHistory() { setHistOn(await api.histToggle()); }
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
      if (mode === 'prices') { if (saves) quickRule(); return; }
      if (e.shiftKey) ask(); else plain();
    }
  }

  const expanded = !!d && (v !== 'main' || (mode === 'prices' && (q.trim() !== '' || !!cur)) || (mode === 'ai' && (asks.length > 0 || busy)));
  useLayoutEffect(() => { width.current = expanded ? BAR_WIDE : BAR_NARROW; fit(); }, [expanded, fit]);
  const ch = d?.characters.find(c => c.id === d.character);
  const aiNext = mode === 'ai' && shift;
  const saves = (mode === 'ai' && !aiNext && !!rule && !q.includes('?')) || (dealish && rule?.kind === 'deal');   // Enter запише, а не шукатиме

  return (
    <div className="bwrap" ref={root} onKeyDown={onKey}>
      {prefs?.tab !== false && <NextEvent />}
      <div className="bbox">
        <div className="bbar">
          <button className={'blogo' + (v === 'hub' ? ' on' : '')} onClick={() => (v === 'hub' ? setView('main') : go('/kabinet'))} title={v === 'hub' ? 'Згорнути' : 'Головна'} aria-label="Головна" aria-pressed={v === 'hub'}><img src={asset('/brand/q-hub-logo.svg')} alt="" width={30} height={30} /></button>
          {/* ‹ › — лише коли відкрита головна з кабінетом */}
          {v === 'hub' && <>
            <button className="bico" onClick={() => nav(-1)} title="Назад" aria-label="Назад"><Icon name="chev" size={16} className="tl" /></button>
            <button className="bico" onClick={() => nav(1)} title="Вперед" aria-label="Вперед"><Icon name="chev" size={16} className="tr" /></button>
          </>}
          {/* що зробить Enter: пошук, ШІ (з Shift) чи ціни */}
          <span className={'blead' + (aiNext ? ' ai' : saves ? ' save' : '')} aria-hidden="true"><Icon name={mode === 'prices' ? 'tag' : aiNext ? 'spark' : saves ? 'coin' : 'search'} size={18} /></span>
          <input ref={input} value={q} autoFocus spellCheck={false} onChange={e => { setQ(e.target.value); setSel(0); setNote(null); }}
            placeholder={mode === 'ai' ? (aiNext ? 'Спитай ШІ своїми словами…' : 'Правило сервера, сума для обліку або питання') : 'Скупник: шкури, риба, гриби… або «продав 20 …»'} aria-label="Запит" />
          {q && <button className="bico" title="Очистити" onClick={() => { setQ(''); input.current?.focus(); }}><Icon name="x" size={15} /></button>}
          <div className="bseg" role="group" aria-label="Режим">
            <button aria-pressed={mode === 'ai'} onClick={() => switchMode('ai')}><Icon name="search" size={14} />Пошук</button>
            <button aria-pressed={mode === 'prices'} onClick={() => switchMode('prices')}><Icon name="tag" size={14} />Ціни</button>
          </div>
          <div className="bchar">
            <button className="bpill" onClick={() => setChars(c => !c)} aria-expanded={chars}>
              {d?.user?.avatar ? <img src={d.user.avatar} alt="" /> : <span className="bava">{(ch?.name || 'Q')[0]}</span>}
              <span>{ch?.name || 'Персонаж'}</span><Icon name="chev" size={14} />
            </button>
            {chars && d && <div className="bmenu" role="menu">{d.characters.map(c => (
              <button key={c.id} role="menuitemradio" aria-checked={c.id === d.character} onClick={async () => { setChars(false); await api.barCharacter(c.id); load(); }}>{c.name}</button>))}
              <button onClick={() => go('/kabinet/nalashtuvannya')}>Персонажі й профіль…</button>
              <button onClick={() => { setChars(false); signOut(); }}>Вийти з акаунта</button></div>}
          </div>
          <span className="bsep" aria-hidden="true" />
          {/* дашборд — окремо від головної: відкрити й сховати однією кнопкою */}
          <button className={'bico' + (dash ? ' on' : '')} aria-pressed={dash} title={dash ? 'Сховати дашборд' : 'Дашборд'} onClick={() => (dash ? setView('main') : go('/kabinet/dashbord'))}><Icon name="chart" size={17} /></button>
          <button className={'bico' + (prefs?.pinned ? ' on' : '')} title={prefs?.pinned ? 'Відкріпити: ховати, коли повертаюсь у гру' : 'Закріпити поверх гри'} aria-pressed={!!prefs?.pinned} onClick={() => savePrefs({ pinned: !prefs?.pinned })}><Icon name="pin" size={17} /></button>
          <button className={'bico' + (histOn ? ' on' : '')} title="Історія: пошуки, питання до ШІ й записи" aria-pressed={histOn} onClick={toggleHistory}><Icon name="history" size={17} /></button>
          <button className={'bico' + (mapOn ? ' on' : '')} title={`Мапа Q-Hub · ${prefs?.mapKey || 'Alt+M'}`} aria-label="Мапа Q-Hub" aria-pressed={mapOn} onClick={toggleMap}><Icon name="map" size={17} /></button>
          <button className={'bico' + (view === 'settings' ? ' on' : '')} title="Налаштування плашки" onClick={() => { setSetStart('main'); setView(x => (x === 'settings' ? 'main' : 'settings')); }}><Icon name="gear" size={17} />{unseen > 0 && <i className="bdot" aria-hidden="true" />}</button>
        </div>

        {expanded && (v === 'hub' ? <Hub /> : v === 'settings' && prefs ? <Settings key={setStart} prefs={prefs} staff={!!d?.staff} save={savePrefs} user={d?.user ?? null} version={d?.version} start={setStart} unseen={unseen} onSeen={markSeen} /> : <div className="bpanes">
          {v === 'pinask' && pinQ ? <PinAsk ask={pinQ} decide={decidePin} /> :
           v === 'shot' && shot ? <ShotView shot={shot} share0={prefs?.shareShots !== false} done={t => { setNote({ text: t }); setTimeout(() => api.quickHide(), 900); }} /> :
           mode === 'prices' ? <Prices hits={hits} setSel={setSel} cur={cur} q={q}
             pick={t => { setQ(t); setTimeout(() => input.current?.focus(), 0); }} /> :
           <Ai asks={asks} sel={sel} setSel={setSel} busy={busy} run={ask} q={q} />}
        </div>)}

        <div className="bhint">
          {!note && !busy && !q && unseen > 0 && v === 'main' ? <button className="bnew" onClick={() => { setSetStart('changes'); setView('settings'); }}><Icon name="spark" size={14} />Програму оновлено — що нового</button> :
          <span className={note?.bad ? 'bad' : note ? 'good' : ''}>{note?.text ?? (busy ? 'ШІ думає…' : saves && rule ? (rule.kind === 'deal' ? <DealLine d={rule} /> : rule.kind === 'transfer' ? <>Enter запише: переказ {money(rule.amount)} · {ACC[rule.from!]} → {ACC[rule.to!]}</> : <>Enter запише: {sum(rule.type!, rule.amount)} · {rule.category} · {ACC[rule.account ?? 'cash']}</>) : mode === 'ai' ? (aiNext ? 'Enter зараз спитає ШІ' : 'Шукає в правилах сервера, без ШІ') : 'Назви скупника чи товар · «продав 20 …» — за ціною відкритого скупника')}</span>}
          <span className="bkeys">{mode === 'ai'
            ? <><span className={aiNext ? '' : 'on'}><kbd>Enter</kbd>{saves ? 'записати' : 'пошук'}</span><span className={aiNext ? 'on ai' : ''}><kbd>Shift</kbd><kbd>Enter</kbd>ШІ</span></>
            : <span className="on"><kbd>↑</kbd><kbd>↓</kbd>вибір</span>}
            <span><kbd>Tab</kbd>{mode === 'ai' ? 'ціни' : 'пошук'}</span><span><kbd>Esc</kbd>сховати</span></span>
        </div>
      </div>
    </div>
  );
}

/* «Заборонено … | Деморган 60 хв. Примітка: …» — покарання окремо, щоб його було видно одразу; примітки й винятки — після нього */
function splitPenalty(t: string) {
  const i = t.search(/\s\|\s/);
  if (i < 0) return { body: t, pen: '', more: '' };
  const tail = t.slice(i).replace(/^\s*\|\s*/, '').replace(/\s*\|\s*/g, ' · ').trim();
  const j = tail.search(/\s(Примітк|Виняток|Винятки|Уточнення|Приклад)/);
  return { body: t.slice(0, i).trim(), pen: j < 0 ? tail : tail.slice(0, j).trim(), more: j < 0 ? '' : tail.slice(j).trim() };
}
function RuleCard({ h }: { h: RuleHit }) {
  const [open, setOpen] = useState(false);
  const { body, pen, more } = splitPenalty(h.s);
  const long = body.length > 260 || body.split('\n').length > 4;
  return <li className="brule">
    <div className="brule-top">
      {h.n && <span className="bpunkt">п. {h.n}</span>}
      <a href={h.url} target="_blank" rel="noreferrer" title="Відкрити тему на форумі">{h.topic}</a>
    </div>
    <p className={long && !open ? 'clamp' : ''}>{body}</p>
    {long && <button className="bmore" onClick={() => setOpen(o => !o)}>{open ? 'Згорнути' : 'Показати повністю'}</button>}
    {pen && <span className="bpen">{pen}</span>}
    {more && <p className="bextra">{more}</p>}
  </li>;
}
/* посилання на пункти у відповіді ШІ — «(Правила Зелених Зон, п. 1.3)» — помітні, щоб було видно, звідки відповідь */
const cites = (t: string) => t.split(/(\([^()]*п\.\s*\d[^()]*\))/g).map((p, i) => (i % 2 ? <mark key={i} className="bcite">{p.slice(1, -1)}</mark> : p));

function Ai({ asks, sel, setSel, busy, run, q }: { asks: Ask[]; sel: number; setSel: (n: number) => void; busy: boolean; run: () => void; q: string }) {
  const a = asks[sel];
  const kind = (x: Ask) => (x.error ? 'err' : x.sells ? 'sell' : x.hits ? 'rules' : x.actions.length ? 'plan' : 'ai');
  const meta = (x: Ask) => x.error ? 'помилка' : x.sells ? (x.sells.length ? `склад · ${x.sells.length}` : 'на складі нічого продати') : x.hits ? (x.hits.length ? `правила · ${x.hits.length}` : 'нічого не знайдено') : x.done && x.actions.length ? 'записано' : x.actions.length ? `${x.actions.length} дії — чекає Enter` : 'відповідь ШІ';
  const ICO = { rules: 'search', ai: 'spark', plan: 'coin', err: 'x', sell: 'tag' } as const;
  return <>
    <div className="bleft">
      {busy && <div className="brow item on"><span className="bkico ai"><Icon name="spark" size={15} /></span><span><b>{q.trim()}</b><small>ШІ думає…</small></span></div>}
      {asks.map((x, i) => <button key={i} className={'brow item' + (!busy && i === sel ? ' on' : '')} onClick={() => setSel(i)}>
        <span className={'bkico ' + kind(x)}><Icon name={ICO[kind(x)]} size={15} /></span><span><b>{x.q}</b><small>{meta(x)}</small></span></button>)}
    </div>
    <div className="bright">{busy && sel === 0 ? <div className="bskel" aria-label="ШІ думає"><i /><i /><i /></div> : a ? <>
      {a.sells ? <SellList sells={a.sells} /> : a.hits ? <>
        <div className="bkind"><Icon name="search" size={14} />Правила сервера{a.hits.length ? ` · ${a.hits.length} збігів` : ''}</div>
        {a.reply && <p className="bnone">{a.reply}</p>}
        {a.hits.length > 0 && <ul className="brules">{a.hits.map((h, i) => <RuleCard key={a.q + i} h={h} />)}</ul>}
        <p className="btip"><Icon name="spark" size={14} />Не те? <kbd>Shift</kbd>+<kbd>Enter</kbd> — спитати ШІ своїми словами</p>
      </> : <>
        <div className="bkind ai"><Icon name="spark" size={14} />Відповідь ШІ</div>
        {a.error ? <p className="bad">{a.error}</p> : <div className="bans">{cites(a.reply)}</div>}
        {a.actions.length > 0 && <ul className="bacts">{a.actions.map((x, i) => <ActLine key={i} a={x} />)}</ul>}
        {sel === 0 && !a.done && a.actions.length > 0 && <button className="btn acc" onClick={run} disabled={busy || q.trim() !== a.q}>{q.trim() === a.q ? 'Записати (Enter)' : 'Текст змінено — Shift+Enter спитає знову'}</button>}
        {a.done && a.actions.length > 0 && <p className="good">Записано в облік.</p>}
        {!a.error && !a.actions.length && <p className="bfine">ШІ відповідає з правил сервера, але може помилятися — перевір пункт на форумі.</p>}
      </>}
    </> : null}</div>
  </>;
}

/* «що продати?»: найдорожче зі складу разом, кому здати і скільки дасть наступний скупник */
function SellList({ sells }: { sells: Sell[] }) {
  if (!sells.length) return <>
    <div className="bkind"><Icon name="tag" size={14} />Що продати зі складу</div>
    <p className="bnone">На складі немає товарів, які беруть скупники. Склад — це «Купив» і «Нафармив» у режимі «Ціни» (<kbd>Tab</kbd>) або в кабінеті.</p>
  </>;
  return <>
    <div className="bkind"><Icon name="tag" size={14} />Що продати зі складу · за цінами скупників</div>
    <ul className="bsells">{sells.map(x => <li key={x.item}>
      {x.icon ? <img src={asset(x.icon)} alt="" width={32} height={32} /> : <span className="bava">{x.item[0]}</span>}
      <span className="bsell-txt"><b>{x.item} × {x.qty}</b>
        <small>{x.buyer} · {money(x.price)} / {x.unit}{x.next && x.next.price < x.price ? ` · у «${x.next.buyer}» на ${money((x.price - x.next.price) * x.qty)} менше` : ''}</small></span>
      <b className="good mono">{money(x.total)}</b>
    </li>)}</ul>
    <p className="bfine">Ціни — останні, які внесли гравці; у грі вони могли змінитися. Продаж записується в режимі «Ціни» (<kbd>Tab</kbd>).</p>
  </>;
}

/* ціни: ліворуч скупники, що підійшли під запит, праворуч товари відкритого скупника з цінами.
   Клік по товару — рядок «продав <скільки є> <товар>»: Enter запише за ціною цього скупника */
function Prices({ hits, setSel, cur, q, pick }: { hits: BuyerHit[]; setSel: (n: number) => void; cur: BuyerHit | null; q: string; pick: (t: string) => void }) {
  if (!cur) return <div className="bempty">{q.trim() && !DEAL.test(q) ? `Скупника «${q.trim()}» не знайшов. Спробуй «шкури», «риба», «гриби».` : 'Спершу назви скупника — тоді «продав …» запишеться за його ціною.'}</div>;
  const left = hits.length ? hits : [cur];
  return <>
    <div className="bleft">{left.map((b, i) => (
      <button key={b.buyer} className={'brow item' + (b.buyer === cur.buyer ? ' on' : '')} onClick={() => hits.length && setSel(i)}>
        {b.icon ? <img src={asset(b.icon)} alt="" /> : <span className="bava" />}
        <span><b>{b.buyer}</b><small>{b.items.length} товар{b.items.length % 10 === 1 && b.items.length % 100 !== 11 ? '' : 'ів'}{b.items.some(x => x.have > 0) ? ' · є на складі' : ''}</small></span>
      </button>))}</div>
    <div className="bright">
      <div className="bhead">{cur.icon ? <img src={asset(cur.icon)} alt="" /> : null}<div><h3>{cur.buyer}</h3><small className="muted">«продав …» у цьому режимі — за цінами цього скупника</small></div></div>
      <div className="bbuyers">{cur.items.map(x => { const p = pos(x); return (
        <button key={x.item} className="bbuy" title="Підставити в рядок «продав …»" onClick={() => pick(`продав ${x.have > 0 ? (x.unit === 'кг' ? `${x.have} кг ` : `${x.have} `) : ''}${x.item.toLowerCase()}`)}>
          {x.icon ? <img src={asset(x.icon)} alt="" /> : <span className="bava" />}
          <span><b>{x.item}</b><small>{x.have > 0 ? `у тебе ${x.have} ${x.unit}` : x.max > x.min ? `межі ${money(x.min)}–${money(x.max)}` : 'межі не вписані'}{x.at ? ` · ${when(x.at)}` : ''}</small></span>
          {p !== null && <span className="brange" title={`${p}% діапазону`}><i style={{ left: p + '%' }} /></span>}
          <b className="mono">{x.price ? `${money(x.price)}/${x.unit}` : '—'}</b>
        </button>); })}</div>
    </div>
  </>;
}

/* підказка під рядком для угоди: що Enter запише на склад і в облік */
function DealLine({ d }: { d: { op: Op; item: string; qty: number; unit: string; price: number | null } }) {
  const n = d.unit === 'кг' ? `${d.qty} кг` : d.qty;   // риба: показати, у скільки кг перераховано штуки
  if (d.op === 'farm') return <>Enter запише: нафармив {d.item} × {n} — на склад</>;
  if (d.price === null) return <>Угода: {OPS[d.op].toLowerCase()} {d.item} × {n} — допиши ціну: «по 300» або «за 3000»</>;
  return <>Enter запише: {OPS[d.op].toLowerCase()} {d.item} × {n} по {money(d.price)}{d.unit === 'кг' ? '/кг' : ''} = {sum(d.op === 'buy' ? 'out' : 'in', Math.round(d.qty * d.price))} · {d.op === 'buy' ? 'на склад' : 'зі складу'}</>;
}

/* навчальний знімок: що на ньому — з таких прикладів програма вчиться бачити тригери в грі */
/* F9: показати знімок і дати одразу вибрати категорію й опис (підказка адміну).
   Точку знайдено — надіслати з точкою; не знайдено — надіслати без точки (поставить адмін) чи ні */
function PinAsk({ ask, decide }: { ask: PinAskT; decide: (send: boolean, hint?: PinHint) => void }) {
  const [text, setText] = useState(''); const [pick, setPick] = useState(0); const [note, setNote] = useState('');
  const first = useRef<HTMLInputElement>(null), box = useRef<HTMLDivElement>(null);
  const found = useMemo(() => matchCats(ask.cats, text), [ask.cats, text]);
  const chosen = found[Math.min(pick, found.length - 1)];
  /* курсор — одразу в полі категорії: і коли форма з'явилась, і коли вікно отримало фокус пізніше */
  useEffect(() => {
    const f = () => { if (!box.current?.contains(document.activeElement)) first.current?.focus(); };
    f(); window.addEventListener('focus', f); return () => window.removeEventListener('focus', f);
  }, []);
  const send = (yes: boolean) => decide(yes, yes ? { category: chosen?.id || '', note } : undefined);
  /* Enter — надіслати, Esc — не надсилати, ↑↓ — інша категорія зі збігів; не пускати ці клавіші далі в плашку */
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); send(e.key === 'Enter'); return; }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && found.length) { e.preventDefault(); e.stopPropagation(); setPick(p => (p + (e.key === 'ArrowDown' ? 1 : found.length - 1)) % found.length); }
  };
  return <>
    <div className="bleft bshot"><img src={ask.preview} alt="Знімок, зроблений по F9" /></div>
    <div className="bright" ref={box} onKeyDown={onKey}>
      {ask.point
        ? <><h3>Точку знайдено</h3>
            <p className="muted">X <b className="mono">{ask.point.x}</b> · Y <b className="mono">{ask.point.y}</b>. Вибери категорію — адміну буде простіше опублікувати мітку. Повернешся в гру, нічого не вибравши, — точка піде без категорії.</p></>
        : <><h3>Точку не знайдено</h3>
            <p className="muted">Причина: {ask.reason}. Можна надіслати знімок без точки — її поставить адмін на сайті. Якщо на знімку не карта гри (чат, Discord), не надсилайте.</p></>}
      <label className="bnote">Категорія (необов’язково)
        <input ref={first} value={text} onChange={e => { setText(e.target.value); setPick(0); }} placeholder="почни писати: бак, заправка, 24/7…"
          role="combobox" aria-expanded={found.length > 0} aria-controls="pin-cats" aria-activedescendant={chosen ? 'pin-cat-' + chosen.id : undefined} /></label>
      {text.trim() && <div className="bcats" id="pin-cats" role="listbox" aria-label="Категорії">
        {found.length ? found.map(c => (
          <button key={c.id} id={'pin-cat-' + c.id} role="option" aria-selected={c === chosen} className={c === chosen ? 'on' : ''} tabIndex={-1}
            onMouseDown={e => e.preventDefault()} onClick={() => setPick(found.indexOf(c))}>{c.name}<small>{c.grp}</small></button>))
          : <span className="muted">Такої категорії немає — адмін вибере сам</span>}
      </div>}
      <label className="bnote">Опис (необов’язково)<input value={note} onChange={e => setNote(e.target.value)} maxLength={600} placeholder="напр. бак за магазином 24/7, біля входу" /></label>
      <div className="row">
        <button className="btn acc" onClick={() => send(true)}>{ask.point ? 'Надіслати точку' : 'Надіслати без точки'}</button>
        <button className="btn" onClick={() => send(false)}>Не надсилати</button>
      </div>
      <small className="muted"><kbd>↑↓</kbd> інша категорія · <kbd>Tab</kbd> до опису · <kbd>Enter</kbd> надіслати · <kbd>Esc</kbd> не надсилати</small>
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
      <label className="bnote">Примітка (необов’язково)<input value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder="напр. скупник Гриби, продав 20 гливи" /></label>
      <label className="bchk bshare"><input type="checkbox" checked={share} onChange={e => setShare(e.target.checked)} />
        <span>Поділитися з розробниками Q-Hub — так програма швидше вчиться бачити гру. Знімок бачить лише адмін; якщо на ньому чат чи чужі ніки, зніми прапорець.</span></label>
      <small className="muted"><kbd>Esc</kbd> — лишити без позначки</small>
    </div>
  </>;
}

