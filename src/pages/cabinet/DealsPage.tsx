import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRows } from '../../lib/useRows';
import { ledger } from '../../lib/ledger';
import { money, parseMoney, qty as fq, signed, when } from '../../lib/format';
import { DEAL_CATS, OPS } from '../../lib/cats';
import type { Character, DealRow } from './types';

export default function DealsPage({ c }: { c: Character }) {
  const { rows, error, reload } = useRows<DealRow>('deals', c.id, 'ts', false);
  const [op, setOp] = useState<'buy' | 'farm' | 'sell'>('buy');
  const [item, setItem] = useState(''); const [q, setQ] = useState(''); const [price, setPrice] = useState(''); const [cat, setCat] = useState('');
  const [toLedger, setToLedger] = useState(true); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [sure, setSure] = useState('');
  const [catalog, setCatalog] = useState<string[]>([]);
  useEffect(() => { supabase?.from('items').select('name').order('name').limit(2000).then(({ data }) => setCatalog((data || []).map(r => r.name as string))); }, []);
  const names = useMemo(() => Array.from(new Set([...catalog, ...rows.map(r => r.item)])).sort((a, b) => a.localeCompare(b, 'uk')), [catalog, rows]);
  const L = useMemo(() => ledger(rows), [rows]);

  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    const n = Number(String(q).replace(',', '.')), p = op === 'farm' ? 0 : parseMoney(price);
    if (!item.trim()) { setMsg('Вкажи товар.'); return; }
    if (!(n > 0)) { setMsg('Вкажи кількість.'); return; }
    if (op !== 'farm' && !(p > 0)) { setMsg('Вкажи ціну за штуку.'); return; }
    setBusy(true);
    let txId: string | null = null;
    if (op !== 'farm' && toLedger) {
      const had = (L.items[item.trim()]?.boughtQty || 0) > 0;
      const { data, error } = await supabase!.from('transactions').insert({
        character_id: c.id, type: op === 'buy' ? 'out' : 'in', amount: Math.round(n * p), source: 'deal',
        category: op === 'buy' || had ? 'Перекуп' : 'Продаж фарму', note: `${OPS[op]}: ${item.trim()} × ${fq(n)} по ${money(p)}`
      }).select('id').single();
      if (error) { setBusy(false); setMsg('Не вдалося записати в облік.'); return; }
      txId = data.id;
    }
    const { error } = await supabase!.from('deals').insert({ character_id: c.id, op, item: item.trim(), qty: n, price: p, category: cat, tx_id: txId });
    setBusy(false);
    if (error) { if (txId) await supabase!.from('transactions').delete().eq('id', txId); setMsg('Не вдалося зберегти угоду.'); return; }
    setItem(''); setQ(''); setPrice(''); reload();
  }
  async function del(d: DealRow) {
    if (sure !== d.id) { setSure(d.id); setTimeout(() => setSure(s => (s === d.id ? '' : s)), 3000); return; }
    await supabase!.from('deals').delete().eq('id', d.id);
    if (d.tx_id && !rows.some(x => x.id !== d.id && x.tx_id === d.tx_id)) await supabase!.from('transactions').delete().eq('id', d.tx_id);
    setSure(''); reload();
  }

  return (
    <div className="grid side">
      <section className="card">
        <h2>Нова угода</h2>
        <div className="seg" role="group" aria-label="Що зробив">{(['buy', 'farm', 'sell'] as const).map(o => <button key={o} type="button" aria-pressed={op === o} onClick={() => setOp(o)}>{OPS[o]}</button>)}</div>
        <form className="form cols" onSubmit={add}>
          <label className="fld">Товар<input list="items" value={item} onChange={e => setItem(e.target.value)} placeholder="Stage 1, Глива…" maxLength={80} /></label>
          <datalist id="items">{names.map(n => <option key={n} value={n} />)}</datalist>
          <label className="fld">Кількість<input value={q} onChange={e => setQ(e.target.value)} inputMode="decimal" placeholder="1" /></label>
          {op !== 'farm' && <label className="fld">Ціна за шт, $<input value={price} onChange={e => setPrice(e.target.value)} inputMode="numeric" placeholder="150к" /></label>}
          <label className="fld">Категорія<select value={cat} onChange={e => setCat(e.target.value)}>{DEAL_CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          {op !== 'farm' && <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={toLedger} onChange={e => setToLedger(e.target.checked)} /> Записати в облік</label>}
          <button className="btn acc" disabled={busy}>{op === 'buy' ? 'Записати покупку' : op === 'sell' ? 'Записати продаж' : 'Додати на склад'}</button>
        </form>
        {msg && <p className="err">{msg}</p>}
      </section>
      <section className="card">
        <div className="row between"><h2>Угоди</h2><span className="muted">перекуп {signed(L.resale)}</span></div>
        {error && <p className="err">{error}</p>}
        {rows.length ? <div className="list">{rows.slice(0, 200).map(d => {
          const p = L.perDeal[d.id];
          return (
            <div className="li" key={d.id}>
              <div><span className={'pill ' + (d.op === 'sell' ? 'good' : d.op === 'buy' ? 'bad' : 'warn')}>{OPS[d.op]}</span> <b>{d.item} × {fq(d.qty)}</b>{d.receipt_id && <small> · чек</small>}<br />
                <small>{when(d.ts)}{d.op !== 'farm' ? ` · ${money(d.price)}/шт · ${money(d.qty * d.price)}` : ''}{p && p.fromBought ? ' · ' : ''}{p && p.fromBought ? <span className={p.profit >= 0 ? 'good' : 'bad'}>{signed(p.profit)}</span> : null}</small></div>
              <button className="btn sm ghost" onClick={() => del(d)}>{sure === d.id ? 'Так, видалити' : 'Видалити'}</button>
            </div>);
        })}</div> : <div className="empty">Угод ще немає. Запиши першу покупку ліворуч.</div>}
      </section>
    </div>
  );
}
