import { Link } from 'react-router-dom';
import { useRows } from '../../lib/useRows';
import { balance, ledger, stock } from '../../lib/ledger';
import { money, signed } from '../../lib/format';
import EventList from '../../components/EventList';
import type { Character, DealRow, Tx } from './types';

export default function Dashboard({ c }: { c: Character }) {
  const tx = useRows<Tx>('transactions', c.id);
  const deals = useRows<DealRow>('deals', c.id, 'ts', true);
  const bal = balance(c.start_balance, tx.rows);
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const today = tx.rows.filter(t => new Date(t.ts) >= d0).reduce((s, t) => s + (t.type === 'in' ? t.amount : -t.amount), 0);
  const L = ledger(deals.rows), st = stock(L), cost = st.reduce((s, i) => s + i.boughtCost, 0);
  const pct = c.goal ? Math.min(100, Math.max(0, bal / c.goal * 100)) : 0;
  return (
    <div className="grid side">
      <div className="grid">
        <section className="card hero solid">
          <span className="muted">Баланс</span>
          <div className="big">{money(bal)}</div>
          <div className="row"><span className="pill" style={{ background: 'rgba(20,7,0,.16)' }}>{signed(today)} сьогодні</span></div>
          {c.goal > 0 && <>
            <div className="row between"><b>{c.goal_name || 'Ціль'}</b><b className="mono">{pct.toFixed(1)}%</b></div>
            <div style={{ height: 10, borderRadius: 99, background: 'rgba(20,7,0,.2)' }}><div style={{ width: pct + '%', height: '100%', borderRadius: 99, background: '#140700' }} /></div>
            <span className="muted">Залишилось {money(Math.max(0, c.goal - bal))}</span>
          </>}
        </section>
        <div className="grid two">
          <section className="card"><span className="lbl">Прибуток з перекупу</span><div className="big" style={{ fontSize: 26 }}>{signed(L.resale)}</div><span className="muted">за всі угоди</span></section>
          <section className="card"><span className="lbl">На складі</span><div className="big" style={{ fontSize: 26 }}>{st.length} поз.</div><span className="muted">вкладено {money(cost)}</span></section>
        </div>
        <div className="row"><Link className="btn acc" to="/kabinet/uhody">+ Угода</Link><Link className="btn" to="/kabinet/oblik">+ Запис в облік</Link><Link className="btn ghost" to="/kabinet/sklad">Склад</Link></div>
      </div>
      <section className="card"><h2>Найближче</h2><EventList compact /></section>
    </div>
  );
}
