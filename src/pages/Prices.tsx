import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { money, when } from '../lib/format';

interface Buyer { id: string; name: string; updated_at: string | null }
interface Row { buyer_id: string; min_price: number; max_price: number; items: { id: number; name: string; unit: string } | null }
interface Confirmed { item_id: number; buyer_id: string | null; kind: string; price: number; reporters: number; updated_at: string }

export default function Prices() {
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [conf, setConf] = useState<Confirmed[]>([]);
  const [tab, setTab] = useState('');
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!supabase) return;
    Promise.all([
      supabase.from('buyers').select('id,name,updated_at').order('sort'),
      supabase.from('buyer_items').select('buyer_id,min_price,max_price,items(id,name,unit)'),
      supabase.from('prices_confirmed').select('*').eq('kind', 'buyer')
    ]).then(([b, r, c]) => {
      if (b.error || r.error || c.error) { setErr('Не вдалося завантажити ціни. Спробуй оновити сторінку.'); return; }
      setBuyers(b.data as Buyer[]); setRows(r.data as unknown as Row[]); setConf(c.data as Confirmed[]);
      if (b.data?.length) setTab(t => t || (b.data[0] as Buyer).id);
    });
  }, []);

  const cur = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter(r => r.items && (ql ? r.items.name.toLowerCase().includes(ql) : r.buyer_id === tab))
      .map(r => ({ ...r, c: conf.find(c => c.item_id === r.items!.id && c.buyer_id === r.buyer_id) }))
      .sort((a, b) => a.items!.name.localeCompare(b.items!.name, 'uk'));
  }, [rows, conf, tab, q]);
  const buyer = buyers.find(b => b.id === tab);

  return (
    <>
      <div><h1>Ціни скупників</h1><p className="muted">Ціну вважаємо підтвердженою, коли її повідомили щонайменше 3 різні гравці за 48 годин. Явні помилки (удвічі дешевше чи дорожче за решту) відкидаються.</p></div>
      {!supabase && <div className="card empty">База ще не підключена. Ціни з'являться після налаштування Supabase.</div>}
      {err && <div className="card err">{err}</div>}
      {supabase && !err && !buyers.length && <div className="card empty">Каталог скупників наповнюється — це етап 2 плану.</div>}
      {buyers.length > 0 && (
        <>
          <div className="fld"><input type="search" placeholder="Пошук товару серед усіх скупників" value={q} onChange={e => setQ(e.target.value)} aria-label="Пошук товару" /></div>
          {!q && <div className="tabs" role="tablist">{buyers.map(b => <a key={b.id} href={'#' + b.id} role="tab" aria-selected={b.id === tab} className={b.id === tab ? 'active' : ''} onClick={e => { e.preventDefault(); setTab(b.id); }}>{b.name}</a>)}</div>}
          <section className="card">
            {!q && buyer && <div className="row between"><h2>{buyer.name}</h2><span className="muted">{buyer.updated_at ? 'оновлено ' + when(buyer.updated_at) : 'ще не оновлювали'}</span></div>}
            {cur.length ? (
              <div className="scroll"><table className="t">
                <thead><tr><th>Товар</th><th>Мін</th><th>Зараз</th><th>Макс</th></tr></thead>
                <tbody>{cur.map(r => (
                  <tr key={r.buyer_id + r.items!.id}>
                    <td>{r.items!.name}{q && <small className="muted"> · {buyers.find(b => b.id === r.buyer_id)?.name}</small>}</td>
                    <td className="n">{r.min_price ? money(r.min_price) : '—'}</td>
                    <td className="n">{r.c ? <b>{money(r.c.price)}</b> : <span className="muted">немає підтвердження</span>}</td>
                    <td className="n">{r.max_price ? money(r.max_price) : '—'}</td>
                  </tr>))}</tbody>
              </table></div>
            ) : <div className="empty">{q ? 'Нічого не знайдено.' : 'У цього скупника ще немає товарів.'}</div>}
          </section>
        </>
      )}
    </>
  );
}
