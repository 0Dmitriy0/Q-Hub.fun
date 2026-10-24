import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { dur, eventStatus, kyHM } from '../lib/events';
import { money, signed, when } from '../lib/format';
import { search, pos, type BarPrice, type Found } from './barSearch';
import { toAccelerator } from './hotkey';
import { matchCats } from './catMatch';
import { asset } from '../lib/app';

/* Плашка Alt+Q поверх гри: рядок як у помічників для RP-серверів, що розгортається в дві панелі.
   Режими: «ШІ» (записати чи спитати своїми словами) і «Ціни» (миттєвий пошук по скупниках, без ШІ).
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
type Rule = { kind?: 'transfer'; type?: 'in' | 'out'; amount: number; category?: string; account?: Acc; from?: Acc; to?: Acc } | null;
interface Prefs { pinned: boolean; position: 'top' | 'center' | 'bottom'; opacity: number; hotkey: string; mode: 'ai' | 'prices'; tab: boolean; autoLedger: boolean; autoPrices: boolean; shareShots: boolean; pinKey?: string }
interface Data { user: { name: string; avatar: string | null; gameName: string; staticId: number | null } | null; characters: { id: string; name: string }[]; character: string | null; prices: BarPrice[]; stock: Record<string, number>; prefs: Prefs; staff?: boolean }
interface Hist { id: string; type: 'in' | 'out'; amount: number; category: string; note: string; ts: string; source: string; account?: Acc }
interface Ask { q: string; reply: string; actions: Action[]; done: boolean; error?: string }
type Res = { ok?: boolean; error?: string; character?: string };
interface BarApi {
  barData(): Promise<Data>; barHistory(): Promise<Hist[]>; barCharacter(id: string): Promise<boolean>;
  barPrefs(p: Partial<Prefs>): Promise<{ prefs: Prefs; error?: string }>; barCabinet(): Promise<void>;
  quickParse(t: string): Promise<Rule>;
  quickAdd(t: string): Promise<Res>; quickAsk(t: string): Promise<{ reply: string; actions: Action[]; error?: string }>;
  quickRun(): Promise<Res>; quickDeal(op: Op, item: string, qty: number, price: number): Promise<Res>;
  quickSize(h: number): Promise<void>; quickHide(): Promise<void>; onQuickShow(cb: () => void): void;
  onPin(cb: (s: { text: string; bad?: boolean }) => void): void;
  onPinAsk(cb: (s: PinAskT) => void): void; pinDecide(send: boolean, hint?: PinHint): Promise<void>;
  onShot(cb: (s: Shot) => void): void; shotLabel(name: string, label: string, note: string, share: boolean): Promise<{ ok: boolean; shared?: boolean }>;
  shotsStats(): Promise<ShotStats>; shotsOpen(): Promise<void>; visionLogOpen(): Promise<void>;
}
interface Shot { name: string; preview: string; black: boolean }
interface PinAskT { reason: string; preview: string; cats: { id: string; name: string; grp: string }[] }
interface PinHint { category: string; note: string }
interface ShotStats { stats: Record<string, number>; labels: Record<string, string>; key: string }
const api = (window as unknown as { qhub: BarApi }).qhub;

const OPS: Record<Op, string> = { buy: 'Купив', farm: 'Нафармив', sell: 'Продав' };
const sum = (type: 'in' | 'out', n: number) => <b className={type === 'in' ? 'good' : 'bad'}>{type === 'in' ? '+' : '−'}{money(n)}</b>;
const tone = (p: number | null) => (p === null ? '' : p >= 80 ? 'good' : p >= 40 ? 'warn' : 'bad');

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
  const [view, setView] = useState<'main' | 'history' | 'settings' | 'shot' | 'pinask'>('main');
  const [pinQ, setPinQ] = useState<PinAskT | null>(null);
  const [shot, setShot] = useState<Shot | null>(null);
  const [sel, setSel] = useState(0);
  const [asks, setAsks] = useState<Ask[]>([]);
  const [rule, setRule] = useState<Rule>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [hist, setHist] = useState<Hist[]>([]);
  const [chars, setChars] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => { const x = await api.barData(); setD(x); if (x.prefs) setMode(x.prefs.mode); }, []);
  useEffect(() => {
    load();
    api.onQuickShow(() => { setQ(''); setView('main'); setSel(0); setNote(null); setChars(false); load(); setTimeout(() => input.current?.focus(), 0); });
    /* Alt+S у грі: знімок готовий — позначити, що на ньому */
    api.onShot(s => { setShot(s); setView('shot'); setNote(null); setChars(false); });
    /* F9 у грі: чернетку мітки збережено чи ні — коротко внизу плашки, вона сама сховається */
    api.onPin(s => { setView('main'); setChars(false); setNote(s); setPinQ(null); });
    /* F9 без точки: спитати, чи надсилати знімок */
    api.onPinAsk(s => { setPinQ(s); setView('pinask'); setChars(false); setNote(null); });
  }, [load]);
  /* вікно точно під вміст: згорнута плашка — низька, розгорнута — до 600 px */
  useLayoutEffect(() => {
    const el = root.current; if (!el) return;
    const ro = new ResizeObserver(() => api.quickSize(Math.ceil(el.getBoundingClientRect().height) + 28));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const found = useMemo(() => (d ? search(d.prices, q, d.stock) : []), [d, q]);
  const prefs = d?.prefs;
  const decidePin = (send: boolean, hint?: PinHint) => { setPinQ(null); setView('main'); api.pinDecide(send, hint); };
  const savePrefs = async (p: Partial<Prefs>) => { const r = await api.barPrefs(p); setD(x => (x ? { ...x, prefs: r.prefs } : x)); if (r.error) setNote({ text: r.error, bad: true }); };
  const switchMode = (m: 'ai' | 'prices') => { setMode(m); setView('main'); setSel(0); savePrefs({ mode: m }); input.current?.focus(); };

  /* «без ШІ» підказка під рядком: що запишеться за правилами по Shift+Enter */
  useEffect(() => {
    if (mode !== 'ai' || !q.trim()) { setRule(null); return; }
    let live = true; api.quickParse(q).then(r => live && setRule(r)); return () => { live = false; };
  }, [q, mode]);

  const latest = asks[0];
  async function ask() {
    const text = q.trim(); if (!text || busy) return;
    if (latest && !latest.done && latest.actions.length && latest.q === text) { // другий Enter — записати план
      setBusy(true); const r = await api.quickRun(); setBusy(false);
      if (r.error) { setNote({ text: r.error, bad: true }); return; }
      setAsks(a => [{ ...a[0], done: true }, ...a.slice(1)]); setNote({ text: `Записано · ${r.character}` }); setQ(''); load(); return;
    }
    setBusy(true); setNote(null);
    const r = await api.quickAsk(text);
    setBusy(false);
    setAsks(a => [{ q: text, reply: r.reply || '', actions: r.actions || [], done: !(r.actions || []).length, error: r.error }, ...a].slice(0, 30));
    setSel(0);
  }
  async function quickRule() {
    if (!rule) { setNote({ text: 'Без ШІ потрібна сума — наприклад, 450к', bad: true }); return; }
    setBusy(true); const r = await api.quickAdd(q); setBusy(false);
    setNote(r.error ? { text: r.error, bad: true } : { text: `Записано · ${r.character}` }); if (!r.error) { setQ(''); load(); }
  }
  async function openHistory() { setView(v => (v === 'history' ? 'main' : 'history')); setSel(0); setHist(await api.barHistory()); }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); if (chars) setChars(false); else if (view !== 'main' && view !== 'shot') setView('main'); else api.quickHide(); return; }
    if (e.key === 'Tab') { e.preventDefault(); switchMode(mode === 'ai' ? 'prices' : 'ai'); return; }
    if (e.target !== input.current) return;   // стрілки й Enter у полях форми — їхні
    const n = view === 'history' ? hist.length : mode === 'prices' ? found.length : asks.length;
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && n) { e.preventDefault(); setSel(s => (s + (e.key === 'ArrowDown' ? 1 : n - 1)) % n); return; }
    if (e.key === 'Enter' && view === 'main') {
      e.preventDefault();
      if (mode === 'prices') { qtyRef.current?.focus(); qtyRef.current?.select(); return; }
      if (e.shiftKey) quickRule(); else ask();
    }
  }

  const expanded = !!d && (view !== 'main' || (mode === 'prices' && (q.trim() !== '' || found.length > 0)) || (mode === 'ai' && (asks.length > 0 || busy)));
  const ch = d?.characters.find(c => c.id === d.character);

  return (
    <div className="bwrap" ref={root} onKeyDown={onKey}>
      {prefs?.tab !== false && <NextEvent />}
      <div className="bbox">
        <div className="bbar">
          <button className={'bico' + (prefs?.pinned ? ' on' : '')} title={prefs?.pinned ? 'Відкріпити: ховати, коли повертаюсь у гру' : 'Закріпити поверх гри'} onClick={() => savePrefs({ pinned: !prefs?.pinned })}><Icon name="pin" size={17} /></button>
          <input ref={input} value={q} autoFocus spellCheck={false} onChange={e => { setQ(e.target.value); setSel(0); setNote(null); }}
            placeholder={mode === 'ai' ? 'Що сталося або питання: «продав 10 гливи»' : 'Товар або скупник: глива, шкура, мотлох…'} aria-label="Запит" />
          {q && <button className="bico" title="Очистити" onClick={() => { setQ(''); input.current?.focus(); }}><Icon name="x" size={15} /></button>}
          <div className="bseg" role="group" aria-label="Режим">
            <button aria-pressed={mode === 'ai'} onClick={() => switchMode('ai')}><Icon name="spark" size={14} />ШІ</button>
            <button aria-pressed={mode === 'prices'} onClick={() => switchMode('prices')}><Icon name="tag" size={14} />Ціни</button>
          </div>
          <div className="bchar">
            <button className="bpill" onClick={() => setChars(c => !c)} aria-expanded={chars}>
              {d?.user?.avatar ? <img src={d.user.avatar} alt="" /> : <span className="bava">{(ch?.name || 'Q')[0]}</span>}
              <span>{ch?.name || 'Персонаж'}</span><Icon name="chev" size={14} />
            </button>
            {chars && d && <div className="bmenu" role="menu">{d.characters.map(c => (
              <button key={c.id} role="menuitemradio" aria-checked={c.id === d.character} onClick={async () => { setChars(false); await api.barCharacter(c.id); load(); }}>{c.name}</button>))}
              <button onClick={() => api.barCabinet()}>Відкрити кабінет…</button></div>}
          </div>
          <button className={'bico' + (view === 'history' ? ' on' : '')} title="Історія записів" onClick={openHistory}><Icon name="history" size={17} /></button>
          <button className={'bico' + (view === 'settings' ? ' on' : '')} title="Налаштування плашки" onClick={() => setView(v => (v === 'settings' ? 'main' : 'settings'))}><Icon name="gear" size={17} /></button>
        </div>

        {expanded && <div className="bpanes">
          {view === 'pinask' && pinQ ? <PinAsk ask={pinQ} decide={decidePin} /> :
           view === 'shot' && shot ? <ShotView shot={shot} share0={prefs?.shareShots !== false} done={t => { setNote({ text: t }); setTimeout(() => api.quickHide(), 900); }} /> :
           view === 'settings' && prefs ? <Settings prefs={prefs} staff={!!d?.staff} save={savePrefs} /> :
           view === 'history' ? <History rows={hist} sel={sel} setSel={setSel} /> :
           mode === 'prices' ? <Prices found={found} sel={Math.min(sel, Math.max(0, found.length - 1))} setSel={setSel} qtyRef={qtyRef} q={q}
             done={t => { setNote({ text: t }); load(); }} fail={t => setNote({ text: t, bad: true })} /> :
           <Ai asks={asks} sel={sel} setSel={setSel} busy={busy} run={ask} q={q} />}
        </div>}

        <div className="bhint">
          <span className={note?.bad ? 'bad' : note ? 'good' : ''}>{note?.text ?? (busy ? 'Думаю…' : mode === 'ai' && rule ? (rule.kind === 'transfer' ? <>Без ШІ: переказ {money(rule.amount)} · {ACC[rule.from!]} → {ACC[rule.to!]}</> : <>Без ШІ: {sum(rule.type!, rule.amount)} · {rule.category} · {ACC[rule.account ?? 'cash']}</>) : mode === 'ai' ? 'Пиши як другу — помічник розбереться' : 'Ціни скупників з сайту · ↑↓ вибір')}</span>
          <span><kbd>Enter</kbd> {mode === 'ai' ? 'спитати / записати' : 'кількість'} · {mode === 'ai' && <><kbd>Shift+Enter</kbd> без ШІ · </>}<kbd>Tab</kbd> режим · <kbd>Esc</kbd> сховати</span>
        </div>
      </div>
    </div>
  );
}

function Ai({ asks, sel, setSel, busy, run, q }: { asks: Ask[]; sel: number; setSel: (n: number) => void; busy: boolean; run: () => void; q: string }) {
  const a = asks[sel];
  return <>
    <div className="bleft">{busy && <div className="brow on"><b>Думаю…</b><small>зараз</small></div>}
      {asks.map((x, i) => <button key={i} className={'brow' + (i === sel ? ' on' : '')} onClick={() => setSel(i)}><b>{x.q}</b><small>{x.error ? 'помилка' : x.done && x.actions.length ? 'записано' : x.actions.length ? `${x.actions.length} дії — чекає Enter` : 'відповідь'}</small></button>)}</div>
    <div className="bright">{a ? <>
      <p className="bq">{a.q}</p>
      {a.error ? <p className="bad">{a.error}</p> : <p className="breply">{a.reply}</p>}
      {a.actions.length > 0 && <ul className="bacts">{a.actions.map((x, i) => <ActLine key={i} a={x} />)}</ul>}
      {sel === 0 && !a.done && a.actions.length > 0 && <button className="btn acc" onClick={run} disabled={busy || q.trim() !== a.q}>{q.trim() === a.q ? 'Записати (Enter)' : 'Текст змінено — Enter спитає знову'}</button>}
      {a.done && a.actions.length > 0 && <p className="good">Записано в облік.</p>}
    </> : <p className="muted">Напиши, що сталося в грі, або спитай про ціни й склад.</p>}</div>
  </>;
}

function Prices({ found, sel, setSel, qtyRef, q, done, fail }: { found: Found[]; sel: number; setSel: (n: number) => void; qtyRef: React.RefObject<HTMLInputElement | null>; q: string; done: (t: string) => void; fail: (t: string) => void }) {
  const f = found[sel];
  const [op, setOp] = useState<Op>('sell');
  const [qty, setQty] = useState(''); const [price, setPrice] = useState('');
  useEffect(() => { setQty(f?.have ? String(f.have) : ''); setOp(f?.have ? 'sell' : 'buy'); }, [f?.item]);
  /* продаж — за ціною найкращого скупника; купівля в гравців — своя ціна, тож поле порожнє */
  useEffect(() => { setPrice(op === 'sell' && f?.best ? String(f.best.price) : ''); }, [op, f?.item]);
  if (!f) return <div className="bempty">{q.trim() ? `Скупники не беруть «${q.trim()}». Перевір назву.` : 'На складі порожньо — почни вводити товар.'}</div>;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = await api.quickDeal(op, f.item, Number(qty.replace(',', '.')), Number(price.replace(/\s/g, '')));
    if (r.error) fail(r.error); else done(`${OPS[op]} ${f.item} × ${qty} · ${r.character}`);
  }
  return <>
    <div className="bleft">{found.map((x, i) => { const p = x.best ? pos(x.best) : null; return (
      <button key={x.item} className={'brow item' + (i === sel ? ' on' : '')} onClick={() => setSel(i)}>
        {x.icon ? <img src={asset(x.icon)} alt="" /> : <span className="bava" />}
        <span><b>{x.item}</b><small>{x.best ? `${x.best.buyer} · ${money(x.best.price)}/${x.unit}` : 'ціни ще немає'}{x.have ? ` · у тебе ${x.have}` : ''}</small></span>
        {p !== null && <span className={'pill ' + tone(p)}>{p}%</span>}
      </button>); })}</div>
    <div className="bright">
      <div className="bhead">{f.icon ? <img src={asset(f.icon)} alt="" /> : null}<div><h3>{f.item}</h3><small className="muted">{f.have ? `на складі ${f.have} ${f.unit}${f.best ? ` · ≈ ${money(f.have * f.best.price)}` : ''}` : 'на складі немає'}</small></div></div>
      <div className="bbuyers">{f.buyers.map(b => { const p = pos(b); return (
        <div key={b.buyer} className="bbuy">
          {b.buyerIcon ? <img src={asset(b.buyerIcon)} alt="" /> : <span className="bava" />}
          <span><b>{b.buyer}</b><small>{b.max > b.min ? `межі ${money(b.min)}–${money(b.max)}` : 'межі не вписані'}{b.at ? ` · ${when(b.at)}` : ''}</small></span>
          {p !== null && <span className="brange" title={`${p}% діапазону`}><i style={{ left: p + '%' }} /></span>}
          <b className="mono">{b.price ? money(b.price) : '—'}</b>
        </div>); })}</div>
      <form className="bdeal" onSubmit={save}>
        <div className="bseg sm">{(['sell', 'buy', 'farm'] as Op[]).map(o => <button type="button" key={o} aria-pressed={op === o} onClick={() => setOp(o)}>{OPS[o]}</button>)}</div>
        <label>Кількість<input ref={qtyRef} value={qty} onChange={e => setQty(e.target.value)} inputMode="decimal" /></label>
        {op !== 'farm' && <label>Ціна за {f.unit}, $<input value={price} onChange={e => setPrice(e.target.value)} inputMode="numeric" /></label>}
        <button className="btn acc">Записати{op !== 'farm' && Number(qty) > 0 && Number(price) > 0 ? ` · ${signed((op === 'sell' ? 1 : -1) * Number(qty) * Number(price))}` : ''}</button>
      </form>
    </div>
  </>;
}

function History({ rows, sel, setSel }: { rows: Hist[]; sel: number; setSel: (n: number) => void }) {
  const t = rows[sel];
  return <>
    <div className="bleft">{rows.length ? rows.map((r, i) => (
      <button key={r.id} className={'brow' + (i === sel ? ' on' : '')} onClick={() => setSel(i)}>
        <b>{sum(r.type, r.amount)} · {r.category} · {ACC[r.account ?? 'cash']}</b><small>{when(r.ts)}{r.note ? ` · ${r.note}` : ''}</small></button>)) : <p className="muted">Записів ще немає.</p>}</div>
    <div className="bright">{t ? <>
      <h3>{sum(t.type, t.amount)}</h3>
      <div className="bkv"><span>Категорія</span><b>{t.category}</b><span>Рахунок</span><b>{ACC[t.account ?? 'cash']}</b><span>Коли</span><b>{when(t.ts)}</b><span>Звідки</span><b>{({ desktop: 'Alt+Q', deal: 'угода', reconcile: 'звірка', manual: 'кабінет', import: 'імпорт' } as Record<string, string>)[t.source] || t.source}</b></div>
      {t.note && <p>{t.note}</p>}
      <button className="btn" onClick={() => api.barCabinet()}>Відкрити облік у кабінеті</button>
    </> : null}</div>
  </>;
}

/* навчальний знімок: що на ньому — з таких прикладів програма вчиться бачити тригери в грі */
/* F9 не знайшов точку на карті: показати, що знято, і спитати — надіслати без точки (поставить адмін) чи ні */
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
      <h3>Точку не знайдено</h3>
      <p className="muted">Причина: {ask.reason}. Можна надіслати знімок без точки — її поставить адмін на сайті. Якщо на знімку не карта гри (чат, Discord), не надсилайте.</p>
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
        <button className="btn acc" onClick={() => send(true)}>Надіслати без точки</button>
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

function Settings({ prefs, staff, save }: { prefs: Prefs; staff: boolean; save: (p: Partial<Prefs>) => void }) {
  const [rec, setRec] = useState(false);
  const [recPin, setRecPin] = useState(false);
  const [st, setSt] = useState<ShotStats | null>(null);
  useEffect(() => { api.shotsStats().then(setSt); }, []);
  return (
    <div className="bset">
      <h3>Налаштування плашки</h3>
      <div className="bkv wide">
        <span>Клавіша виклику</span>
        <button className={'btn' + (rec ? ' acc' : '')} onClick={() => setRec(true)}
          onKeyDown={e => { if (!rec) return; e.preventDefault(); e.stopPropagation(); if (e.key === 'Escape') { setRec(false); return; } const a = toAccelerator(e); if (a) { setRec(false); save({ hotkey: a }); } }}>
          {rec ? 'Натисни комбінацію… (Esc — скасувати)' : prefs.hotkey}</button>
        {staff && <>
          <span>Мітка з гри</span>
          <div className="grid" style={{ gap: 6 }}>
            <button className={'btn' + (recPin ? ' acc' : '')} onClick={() => setRecPin(true)}
              onKeyDown={e => { if (!recPin) return; e.preventDefault(); e.stopPropagation(); if (e.key === 'Escape') { setRecPin(false); return; } const a = toAccelerator(e); if (a) { setRecPin(false); save({ pinKey: a }); } }}>
              {recPin ? 'Натисни клавішу… (Esc — скасувати)' : prefs.pinKey || 'F9'}</button>
            <small className="muted">На великій карті в грі — знімок іде чернеткою на сайт, мітку публікує адмін. Поки клавіша тут, гра її не отримує.</small>
          </div>
        </>}
        <span>Де з’являється</span>
        <div className="bseg sm">{([['top', 'Зверху'], ['center', 'По центру'], ['bottom', 'Знизу']] as const).map(([k, l]) => <button key={k} aria-pressed={prefs.position === k} onClick={() => save({ position: k })}>{l}</button>)}</div>
        <span>Прозорість</span>
        <input type="range" min={60} max={100} value={Math.round(prefs.opacity * 100)} onChange={e => save({ opacity: Number(e.target.value) / 100 })} aria-label="Прозорість" />
        <span>Вкладка з івентом</span>
        <label className="bchk"><input type="checkbox" checked={prefs.tab} onChange={e => save({ tab: e.target.checked })} /> показувати найближчий івент над плашкою</label>
        <span>Шпилька</span>
        <label className="bchk"><input type="checkbox" checked={prefs.pinned} onChange={e => save({ pinned: e.target.checked })} /> не ховати, коли повертаюсь у гру</label>
        <span>Зір програми</span>
        <div className="grid" style={{ gap: 6 }}>
          <label className="bchk"><input type="checkbox" checked={prefs.autoLedger} onChange={e => save({ autoLedger: e.target.checked })} /> автооблік з екрана: гроші з HUD → записи з місцем (магазин, скупник…)</label>
          <label className="bchk"><input type="checkbox" checked={prefs.autoPrices} onChange={e => save({ autoPrices: e.target.checked })} /> надсилати ціни скупників на сайт від мого імені</label>
          <small className="muted">Працює, лише коли запущена гра. <button className="btn sm" onClick={() => api.visionLogOpen()}>Журнал зору</button></small>
        </div>
        <span>Навчальні знімки</span>
        <div className="row"><span><kbd>{st?.key ?? 'Alt+S'}</kbd> у грі · зібрано {st ? Object.values(st.stats).reduce((a, b) => a + b, 0) : 0}</span><button className="btn sm" onClick={() => api.shotsOpen()}>Відкрити папку</button></div>
      </div>
      <button className="btn" onClick={() => api.barCabinet()}>Відкрити кабінет</button>
    </div>
  );
}
