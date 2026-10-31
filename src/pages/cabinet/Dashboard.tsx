import { Link } from 'react-router-dom';
import { useRows } from '../../lib/useRows';
import { balances, ledger, stock } from '../../lib/ledger';
import { money, signed } from '../../lib/format';
import { topPaying } from '../../lib/advice';
import { usePrices } from '../../lib/usePrices';
import { kyHM } from '../../lib/events';
import EventList from '../../components/EventList';
import Profitable from '../../components/Profitable';
import SessionCard from '../../components/SessionCard';
import Icon from '../../components/Icon';
import { docState, sortDocs, stateText, type Doc } from '../../lib/documents';
import type { Character, DealRow, Tx } from './types';

/* дашборд як у Quant Hub: ліворуч баланс, дії й угоди, праворуч найближчі івенти й підсумки */
export default function Dashboard({ c }: { c: Character }) {
  const tx = useRows<Tx>('transactions', c.id);
  const deals = useRows<DealRow>('deals', c.id, 'ts', true);
  const { prices } = usePrices();
  const b = balances(c, tx.rows), bal = b.total;
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const today = tx.rows.filter(t => new Date(t.ts) >= d0).reduce((s, t) => s + (t.type === 'in' ? t.amount : -t.amount), 0);
  const L = ledger(deals.rows), st = stock(L), cost = st.reduce((s, i) => s + i.boughtCost, 0);
  const pct = c.goal ? Math.min(100, Math.max(0, bal / c.goal * 100)) : 0;
  const top = prices ? topPaying(prices) : [];
  /* документи, що закінчились чи закінчуються за SOON днів, — нагадування згори */
  const docs = useRows<Doc>('documents', c.id, 'name', true);
  const due = sortDocs(docs.rows).filter(d => { const k = docState(d.expires).kind; return k === 'expired' || k === 'soon'; });
  return (
    <div className="dash">
      <div className="grid">
        <section className="card hero solid">
          <span className="muted">Баланс</span>
          <div className="big">{money(bal)}</div>
          <div className="row"><span className="pill" style={{ background: 'rgba(20,7,0,.16)' }}>{signed(today)} сьогодні</span></div>
          <div className="row between hero-foot">
            <div className="accs on-acc"><div><small>Готівка</small><b className="mono">{money(b.cash)}</b></div><div><small>Картка</small><b className="mono">{money(b.card)}</b></div></div>
            <div className="hero-act edit-only">
              <Link to="/kabinet/uhody?op=buy">Купив</Link><Link to="/kabinet/uhody?op=farm">Нафармив</Link><Link to="/kabinet/uhody?op=sell">Продав</Link>
            </div>
          </div>
          {c.goal > 0 && <>
            <div className="row between"><b>{c.goal_name || 'Ціль'}</b><b className="mono">{pct.toFixed(1)}%</b></div>
            <div style={{ height: 10, borderRadius: 99, background: 'rgba(20,7,0,.2)' }}><div style={{ width: pct + '%', height: '100%', borderRadius: 99, background: '#140700' }} /></div>
            <span className="muted">Залишилось {money(Math.max(0, c.goal - bal))}</span>
          </>}
        </section>
        {due.length > 0 && <Link to="/kabinet/dokumenty" className="card doc-due">
          <span className="ibub"><Icon name="alert" /></span>
          <div><b>Документи: продовж вчасно</b><br />{due.slice(0, 3).map((d, i) => <span key={d.id}>{i ? ' · ' : ''}{d.name} — <span className={docState(d.expires).kind === 'expired' ? 'bad' : 'warn'}>{stateText(d.expires)}</span></span>)}{due.length > 3 && <span className="muted"> · ще {due.length - 3}</span>}</div>
        </Link>}
        <Profitable held={st} />
        <h2 className="sect">Скупники платять найбільше</h2>
        {!prices ? <div className="card empty">Завантаження цін…</div> : top.length ? <div className="list cards">{top.map(t => (
          <div className="card" key={t.buyer + t.item}><div className="row between">
            <div><b>{t.item}</b><br /><small className="muted">{t.buyer}{t.stale && <> · <span className="warn">ціна застаріла</span></>}</small></div>
            <div className="row"><div style={{ textAlign: 'right' }}><b className="mono">{money(t.price)}</b><br /><small className="muted mono">макс. {money(t.max)}</small></div>
              <span className={'pill ' + (t.pos >= 80 ? 'good' : t.pos >= 40 ? 'warn' : 'bad')}>{t.pos}%</span></div>
          </div></div>))}</div> : <div className="card empty">Межі цін скупників ще не вписані.</div>}
      </div>
      <div className="grid">
        <SessionCard characterId={c.id} />
        <section className="card">
          <div className="row between"><h2>Івенти</h2><span className="lbl mono">Київ {kyHM(Date.now())}</span></div>
          <EventList />
        </section>
        <div className="grid two">
          <section className="card"><span className="lbl">Прибуток з перекупу</span><div className="big" style={{ fontSize: 26 }}>{signed(L.resale)}</div><span className="muted">за всі угоди</span></section>
          <section className="card"><span className="lbl">На складі</span><div className="big" style={{ fontSize: 26 }}>{st.length} поз.</div><span className="muted">вкладено {money(cost)}</span></section>
        </div>
      </div>
    </div>
  );
}
