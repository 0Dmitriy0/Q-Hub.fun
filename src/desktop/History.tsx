import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';
import Select from '../components/Select';
import { money } from '../lib/format';
import { ACCOUNTS, TX_CATS, type Account } from '../lib/cats';
import { txFields, txForm, txPatch, type TxForm, type TxSet } from '../lib/txEdit';

/* Історія — ліва колонка плашки Alt+Q (кнопка «Історія»): пошуки в правилах і питання до ШІ програма зберігає в себе
   (history.json), записи обліку — з бази. Клік по рядку показує його праворуч: пошук і відповідь ШІ — без нового запиту
   (ліміт ШІ не витрачається), запис — облік. Колонка лишається історією, поки її не закрили. */

type Kind = 'ai' | 'search' | 'tx';
interface Item { id: string; kind: 'ai' | 'search'; q: string; reply: string; ts: string }
interface Tx { id: string; type: 'in' | 'out'; amount: number; category: string; note: string; ts: string; source: string; account?: 'cash' | 'card' }
/* tone — колір суми запису: прибуток зелений, витрата червона */
type Row = { id: string; kind: Kind; title: string; sub: string; ts: string; item: unknown; tone?: 'good' | 'bad'; tx?: Tx };
interface HistApi {
  histData(): Promise<{ items: Item[]; tx: Tx[] } | null>;
  histDel(id: string): Promise<void>; histClear(): Promise<void>; onHistChanged(cb: () => void): void;
  txEdit(id: string, set: TxSet): Promise<{ ok?: true; error?: string } | null>;
}
const api = (window as unknown as { qhub: HistApi }).qhub;
export type HistPick = { kind: 'ai' | 'search'; q: string; reply: string } | { kind: 'tx' };
/* слухач ipc — один на всю плашку: колонку відкривають і закривають багато разів, а ipcRenderer.on лише додає слухачів */
const subs = new Set<() => void>();
let hooked = false;
function onChanged(cb: () => void) {
  if (!hooked) { api.onHistChanged(() => subs.forEach(f => f())); hooked = true; }
  subs.add(cb); return () => { subs.delete(cb); };
}

const TABS: [Kind | 'all', string][] = [['all', 'Усе'], ['ai', 'ШІ'], ['search', 'Пошук'], ['tx', 'Записи']];
const ICO: Record<Kind, string> = { ai: 'spark', search: 'search', tx: 'coin' };
const KIND: Record<Kind, string> = { ai: 'ШІ', search: 'правила', tx: 'запис' };
const hm = (ts: string) => new Date(ts).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
/* «Сьогодні», «Вчора» або дата — заголовки груп */
function day(ts: string) {
  const d = new Date(ts), t = new Date(); t.setHours(0, 0, 0, 0);
  const n = Math.round((t.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 864e5);
  return n === 0 ? 'Сьогодні' : n === 1 ? 'Вчора' : d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
}

export default function History({ onPick, onClose }: { onPick: (it: HistPick) => void; onClose: () => void }) {
  const [data, setData] = useState<{ items: Item[]; tx: Tx[] }>({ items: [], tx: [] });
  const [tab, setTab] = useState<Kind | 'all'>('all');
  const [q, setQ] = useState('');
  const find = useRef<HTMLInputElement>(null);
  /* олівець у записі: форма під рядком, одна за раз; зберігає main.cjs (editTx) */
  const [edit, setEdit] = useState<{ id: string; f: TxForm; err: string } | null>(null);
  useEffect(() => {
    const load = () => api.histData().then(d => d && setData(d));
    load(); return onChanged(load);
  }, []);

  const rows = useMemo(() => {
    const all: Row[] = [
      ...data.items.map(i => ({ id: i.id, kind: i.kind, title: i.q, sub: i.kind === 'ai' ? i.reply : '', ts: i.ts, item: i })),
      ...data.tx.map(t => ({ id: 'tx' + t.id, kind: 'tx' as const, title: `${t.type === 'in' ? '+' : '−'}${money(t.amount)} · ${t.category}`, sub: [t.account === 'card' ? 'картка' : 'готівка', t.note].filter(Boolean).join(' · '), ts: t.ts, item: { kind: 'tx' }, tone: t.type === 'in' ? 'good' as const : 'bad' as const, tx: t })),
    ].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
    const t = q.trim().toLowerCase();
    return all.filter(r => (tab === 'all' || r.kind === tab) && (!t || (r.title + ' ' + r.sub).toLowerCase().includes(t)));
  }, [data, tab, q]);
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) { const k = day(r.ts); m.set(k, [...(m.get(k) || []), r]); }
    return [...m];
  }, [rows]);

  async function save(e: React.FormEvent, t: Tx) {
    e.preventDefault(); if (!edit) return;
    const p = txPatch(t, edit.f);
    if ('error' in p) { setEdit({ ...edit, err: p.error }); return; }
    if (!Object.keys(p.set).length) { setEdit(null); return; }
    const r = await api.txEdit(t.id, p.set);
    if (!r || r.error) { setEdit({ ...edit, err: r?.error || 'Не вдалося змінити запис.' }); return; }
    setEdit(null);
  }
  function editForm(t: Tx) {
    if (!edit) return null;
    const f = edit.f, can = txFields(t.source), set = (v: Partial<TxForm>) => setEdit({ ...edit, f: { ...f, ...v }, err: '' });
    /* категорія не зі списку (коригування, угода, імпорт) лишається варіантом, щоб не підмінилась сама */
    const cats: string[] = [...TX_CATS[f.type]]; if (!cats.includes(f.category)) cats.unshift(f.category);
    return (
      <form className="form hedit" onSubmit={e => save(e, t)} onKeyDown={e => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); e.stopPropagation(); setEdit(null); } }}>
        {edit.err && <p className="err">{edit.err}</p>}
        {can.type && <div className="bseg sm" role="group" aria-label="Тип"><button type="button" aria-pressed={f.type === 'in'} onClick={() => set({ type: 'in' })}>Прибуток</button><button type="button" aria-pressed={f.type === 'out'} onClick={() => set({ type: 'out' })}>Витрата</button></div>}
        {can.amount ? <label className="fld">Сума, ${t.source === 'transfer' ? ' (обидва записи переказу)' : ''}<input autoFocus value={f.amount} onChange={e => set({ amount: e.target.value })} inputMode="numeric" /></label>
          : <small className="muted">Суму змінює угода: видали її в «Угодах» і запиши знову.</small>}
        {can.category && <label className="fld">Категорія<Select value={f.category} onChange={v => set({ category: v })} options={cats.map(x => ({ value: x, label: x }))} /></label>}
        {can.account && <div className="bseg sm" role="group" aria-label="Рахунок">{(Object.keys(ACCOUNTS) as Account[]).map(k => <button type="button" key={k} aria-pressed={f.account === k} onClick={() => set({ account: k })}>{ACCOUNTS[k]}</button>)}</div>}
        <label className="fld">Нотатка<input autoFocus={!can.amount} value={f.note} onChange={e => set({ note: e.target.value })} maxLength={200} /></label>
        <div className="row"><button className="btn acc sm">Зберегти</button><button type="button" className="btn ghost sm" onClick={() => setEdit(null)}>Скасувати</button></div>
      </form>
    );
  }

  return (
    <div className="hwrap hin" onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (q) setQ(''); else onClose(); } }}>
      <div className="hbox">
        <header className="hhead">
          <b>Історія</b>
          <button className="bico" title="Закрити історію · Esc" aria-label="Закрити історію" onClick={onClose}><Icon name="x" size={16} /></button>
        </header>
        <div className="hfind"><Icon name="search" size={16} /><input ref={find} value={q} onChange={e => setQ(e.target.value)} placeholder="Знайти в історії" aria-label="Знайти в історії" autoFocus /></div>
        <div className="bseg sm hseg" role="group" aria-label="Що показати">{TABS.map(([k, l]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
        <div className="hlist">
          {groups.length ? groups.map(([g, list]) => (
            <section key={g}>
              <h4>{g}</h4>
              {list.map(r => (
                <Fragment key={r.id}>
                <div className="hrow">
                  <button className="hpick" onClick={() => onPick(r.item as HistPick)}>
                    <span className={'bkico ' + (r.kind === 'ai' ? 'ai' : r.kind === 'tx' ? 'plan' : 'rules')}><Icon name={ICO[r.kind]} size={15} /></span>
                    <span><b className={r.tone}>{r.title}</b><small>{hm(r.ts)} · {KIND[r.kind]}{r.sub ? ` · ${r.sub}` : ''}</small></span>
                  </button>
                  {r.kind !== 'tx' && <button className="bico hdel" title="Прибрати з історії" aria-label="Прибрати з історії" onClick={() => api.histDel(r.id)}><Icon name="x" size={13} /></button>}
                  {r.tx && <button className={'bico hdel' + (edit?.id === r.tx.id ? ' on' : '')} title="Редагувати запис" aria-label="Редагувати запис" aria-expanded={edit?.id === r.tx.id} onClick={() => { const t = r.tx!; setEdit(edit?.id === t.id ? null : { id: t.id, f: txForm(t), err: '' }); }}><Icon name="edit" size={14} /></button>}
                </div>
                {r.tx && edit?.id === r.tx.id && editForm(r.tx)}
                </Fragment>))}
            </section>)) : <p className="muted hempty">{q || tab !== 'all' ? 'Нічого не знайшлося.' : 'Тут будуть твої пошуки, питання до ШІ й записи.'}</p>}
        </div>
        {data.items.length > 0 && <button className="hclear" onClick={() => { if (confirm('Очистити всі пошуки й питання до ШІ з історії? Записи обліку лишаться.')) api.histClear(); }}>Очистити пошуки й питання</button>}
      </div>
    </div>
  );
}
