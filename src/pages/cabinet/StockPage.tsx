import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRows } from '../../lib/useRows';
import { ledger, stock } from '../../lib/ledger';
import { money, qty } from '../../lib/format';
import { stockValue } from '../../lib/advice';
import { usePrices, type CatalogPrice } from '../../lib/usePrices';
import { STALE } from '../../lib/pricestats';
import { asset } from '../../lib/app';
import type { Character, DealRow } from './types';

const pos = (p: CatalogPrice) => (p.max > p.min && p.price > 0 ? Math.round(Math.min(100, Math.max(0, ((p.price - p.min) / (p.max - p.min)) * 100))) : null);

/* склад як у Quant Hub: ліворуч — що лежить і скільки коштує за цінами скупників, праворуч — каталог скупників */
export default function StockPage({ c }: { c: Character }) {
  const { rows, loading } = useRows<DealRow>('deals', c.id, 'ts', true);
  const { prices, error } = usePrices();
  const st = stock(ledger(rows));
  const held = new Map(st.map(i => [i.name.trim().toLowerCase(), i]));
  const val = prices ? stockValue(st, prices) : null;
  const cost = st.reduce((s, i) => s + i.boughtCost, 0);
  const [tab, setTab] = useState('held');
  const [q, setQ] = useState('');
  const buyers = useMemo(() => [...new Map((prices ?? []).map(p => [p.buyerId, p.buyer]))], [prices]);
  const list = (prices ?? [])
    .filter(p => (tab === 'held' ? held.has(p.item.trim().toLowerCase()) : tab === 'all' || p.buyerId === tab))
    .filter(p => !q.trim() || p.item.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.item.localeCompare(b.item, 'uk'));
  const now = Date.now();
  const iconOf = new Map((prices ?? []).map(p => [p.item.trim().toLowerCase(), p.icon]));
  const Ico = ({ name, big }: { name: string; big?: boolean }) => { const u = iconOf.get(name.trim().toLowerCase()); return u ? <img className={'ico-item' + (big ? ' big' : '')} src={asset(u)} alt="" loading="lazy" /> : <span className={'ico-item' + (big ? ' big' : '')} />; };

  return (
    <div className="stockg">
      <div className="grid">
        <section className="card hero">
          <span className="lbl">Склад · за цінами скупників</span>
          <div className="big">{val ? money(val.now) : '…'}</div>
          <div className="row"><span className="pill">{st.length} позицій</span><span className="pill">вкладено {money(cost)}</span></div>
          <div className="trip">
            <div><small>По мін</small><b className="mono">{val ? money(val.min) : '—'}</b></div>
            <div><small>Зараз</small><b className="mono">{val ? money(val.now) : '—'}</b></div>
            <div><small>По макс</small><b className="mono">{val ? money(val.max) : '—'}</b></div>
          </div>
        </section>
        <div className="qa edit-only">
          <Link className="btn acc" to="/kabinet/uhody?op=buy">Купив</Link>
          <Link className="btn" to="/kabinet/uhody?op=farm">Нафармив</Link>
          <Link className="btn" to="/kabinet/uhody?op=sell">Продав</Link>
        </div>
        <section className="card">
          <h2>На складі</h2>
          {loading ? <div className="empty">Завантаження…</div> : st.length ? (
            <div className="scroll"><table className="t">
              <thead><tr><th>Товар</th><th>Кількість</th><th>Собівартість</th><th>Разом</th></tr></thead>
              <tbody>{st.map(i => <tr key={i.name}><td><span className="titem"><Ico name={i.name} />{i.name}</span></td><td className="n">{qty(i.qty)}</td><td className="n">{i.boughtQty ? money(i.avg) : '—'}</td><td className="n">{money(i.boughtCost)}</td></tr>)}</tbody>
            </table></div>
          ) : <div className="empty">Склад порожній. Він складається з угод: «Купив» і «Нафармив» додають, «Продав» списує.</div>}
        </section>
      </div>
      <div className="grid">
        <input className="search" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Пошук товару" aria-label="Пошук товару" />
        <div className="tabs chips" role="group" aria-label="Скупники">
          {[['held', 'На складі'], ['all', 'Усі'], ...buyers].map(([k, l]) => <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        {error && <p className="err">{error}</p>}
        {!prices ? <div className="card empty">Завантаження цін…</div> : list.length ? <div className="list cards">{list.map(p => {
          const ps = pos(p), h = held.get(p.item.trim().toLowerCase()), stale = !p.at || now - new Date(p.at).getTime() > STALE;
          return (
            <div className="card citem" key={p.buyerId + p.item}>
              <div className="row between"><span className="titem"><Ico name={p.item} big /><b>{p.item}</b></span>{ps !== null && <span className={'pill ' + (ps >= 80 ? 'good' : ps >= 40 ? 'warn' : 'bad')}>{ps}%</span>}</div>
              <div className="row between">
                <small className="muted mono">{p.buyer} · {p.price ? `${money(p.price)}/${p.unit}` : 'ціни ще немає'}{p.max > p.min ? ` · межі ${money(p.min)}–${money(p.max)}` : ''}{stale && p.price ? <span className="warn"> · застаріла</span> : null}{h ? ` · у тебе ${qty(h.qty)}` : ''}</small>
                <Link className="btn sm edit-only" to={`/kabinet/uhody?op=buy&item=${encodeURIComponent(p.item)}`}>+ Додати</Link>
              </div>
            </div>);
        })}</div> : <div className="card empty">{tab === 'held' ? 'На складі немає товарів, які приймають скупники.' : 'Нічого не знайдено.'}</div>}
      </div>
    </div>
  );
}
