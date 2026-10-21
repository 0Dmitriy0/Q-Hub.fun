import { useRows } from '../../lib/useRows';
import { ledger, stock } from '../../lib/ledger';
import { money, qty } from '../../lib/format';
import type { Character, DealRow } from './types';

export default function StockPage({ c }: { c: Character }) {
  const { rows, loading } = useRows<DealRow>('deals', c.id, 'ts', true);
  const st = stock(ledger(rows));
  const cost = st.reduce((s, i) => s + i.boughtCost, 0);
  return (
    <>
      <section className="card hero"><span className="lbl">Склад · за собівартістю</span><div className="big">{money(cost)}</div><span className="muted">{st.length} позицій. Ринкова оцінка з'явиться разом із базою цін (етап 2).</span></section>
      <section className="card">
        {loading ? <div className="empty">Завантаження…</div> : st.length ? (
          <div className="scroll"><table className="t">
            <thead><tr><th>Товар</th><th>Кількість</th><th>Куплено</th><th>Собівартість</th><th>Разом</th></tr></thead>
            <tbody>{st.map(i => <tr key={i.name}><td>{i.name}</td><td className="n">{qty(i.qty)}</td><td className="n">{qty(i.boughtQty)}</td><td className="n">{i.boughtQty ? money(i.avg) : '—'}</td><td className="n">{money(i.boughtCost)}</td></tr>)}</tbody>
          </table></div>
        ) : <div className="empty">Склад порожній. Він складається з угод: «Купив» і «Отримав» додають, «Продав» списує.</div>}
      </section>
    </>
  );
}
