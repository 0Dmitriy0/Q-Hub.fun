import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';

/* Історія — ліва колонка плашки Alt+Q (кнопка «Історія»): пошуки в правилах і питання до ШІ програма зберігає в себе
   (history.json). Клік по рядку показує його праворуч без нового запиту (ліміт ШІ не витрачається).
   Колонка лишається історією, поки її не закрили. Записів обліку тут більше немає (specs/040). */

type Kind = 'ai' | 'search';
interface Item { id: string; kind: Kind; q: string; reply: string; ts: string }
type Row = { id: string; kind: Kind; title: string; sub: string; ts: string; item: Item };
interface HistApi {
  histData(): Promise<{ items: Item[] } | null>;
  histDel(id: string): Promise<void>; histClear(): Promise<void>; onHistChanged(cb: () => void): void;
}
const api = (window as unknown as { qhub: HistApi }).qhub;
export type HistPick = { kind: Kind; q: string; reply: string };
/* слухач ipc — один на всю плашку: колонку відкривають і закривають багато разів, а ipcRenderer.on лише додає слухачів */
const subs = new Set<() => void>();
let hooked = false;
function onChanged(cb: () => void) {
  if (!hooked) { api.onHistChanged(() => subs.forEach(f => f())); hooked = true; }
  subs.add(cb); return () => { subs.delete(cb); };
}

const TABS: [Kind | 'all', string][] = [['all', 'Усе'], ['ai', 'ШІ'], ['search', 'Пошук']];
const ICO: Record<Kind, string> = { ai: 'spark', search: 'search' };
const KIND: Record<Kind, string> = { ai: 'ШІ', search: 'правила' };
const hm = (ts: string) => new Date(ts).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
/* «Сьогодні», «Вчора» або дата — заголовки груп */
function day(ts: string) {
  const d = new Date(ts), t = new Date(); t.setHours(0, 0, 0, 0);
  const n = Math.round((t.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 864e5);
  return n === 0 ? 'Сьогодні' : n === 1 ? 'Вчора' : d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
}

export default function History({ onPick, onClose }: { onPick: (it: HistPick) => void; onClose: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [tab, setTab] = useState<Kind | 'all'>('all');
  const [q, setQ] = useState('');
  const find = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const load = () => api.histData().then(d => d && setItems(d.items || []));
    load(); return onChanged(load);
  }, []);

  const rows = useMemo(() => {
    const all: Row[] = items.map(i => ({ id: i.id, kind: i.kind, title: i.q, sub: i.kind === 'ai' ? i.reply : '', ts: i.ts, item: i }))
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
    const t = q.trim().toLowerCase();
    return all.filter(r => (tab === 'all' || r.kind === tab) && (!t || (r.title + ' ' + r.sub).toLowerCase().includes(t)));
  }, [items, tab, q]);
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) { const k = day(r.ts); m.set(k, [...(m.get(k) || []), r]); }
    return [...m];
  }, [rows]);

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
                <div className="hrow" key={r.id}>
                  <button className="hpick" onClick={() => onPick({ kind: r.kind, q: r.item.q, reply: r.item.reply })}>
                    <span className={'bkico ' + (r.kind === 'ai' ? 'ai' : 'rules')}><Icon name={ICO[r.kind]} size={15} /></span>
                    <span><b>{r.title}</b><small>{hm(r.ts)} · {KIND[r.kind]}{r.sub ? ` · ${r.sub}` : ''}</small></span>
                  </button>
                  <button className="bico hdel" title="Прибрати з історії" aria-label="Прибрати з історії" onClick={() => api.histDel(r.id)}><Icon name="x" size={13} /></button>
                </div>))}
            </section>)) : <p className="muted hempty">{q || tab !== 'all' ? 'Нічого не знайшлося.' : 'Тут будуть твої пошуки й питання до ШІ.'}</p>}
        </div>
        {items.length > 0 && <button className="hclear" onClick={() => { if (confirm('Очистити всі пошуки й питання до ШІ з історії?')) api.histClear(); }}>Очистити історію</button>}
      </div>
    </div>
  );
}
