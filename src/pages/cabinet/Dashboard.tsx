import { Link } from 'react-router-dom';
import { useRows } from '../../lib/useRows';
import { money } from '../../lib/format';
import { topPaying } from '../../lib/advice';
import { usePrices } from '../../lib/usePrices';
import { kyHM } from '../../lib/events';
import EventList from '../../components/EventList';
import Icon from '../../components/Icon';
import { docState, sortDocs, stateText, type Doc } from '../../lib/documents';
import type { Character } from './types';

/* дашборд кабінету: документи, що закінчуються, хто з скупників платить найбільше, найближчі івенти.
   Облік, угоди, склад і гараж прибрано (specs/040) — гроші тут не показуються */
export default function Dashboard({ c }: { c: Character }) {
  const { prices } = usePrices();
  const top = prices ? topPaying(prices) : [];
  /* документи, що закінчились чи закінчуються за SOON днів, — нагадування згори */
  const docs = useRows<Doc>('documents', c.id, 'name', true);
  const due = sortDocs(docs.rows).filter(d => { const k = docState(d.expires).kind; return k === 'expired' || k === 'soon'; });
  return (
    <div className="dash">
      <div className="grid">
        {due.length > 0 && <Link to="/kabinet/dokumenty" className="card doc-due">
          <span className="ibub"><Icon name="alert" /></span>
          <div><b>Документи: продовж вчасно</b><br />{due.slice(0, 3).map((d, i) => <span key={d.id}>{i ? ' · ' : ''}{d.name} — <span className={docState(d.expires).kind === 'expired' ? 'bad' : 'warn'}>{stateText(d.expires)}</span></span>)}{due.length > 3 && <span className="muted"> · ще {due.length - 3}</span>}</div>
        </Link>}
        <h2 className="sect">Скупники платять найбільше</h2>
        {!prices ? <div className="card empty">Завантаження цін…</div> : top.length ? <div className="list cards">{top.map(t => (
          <div className="card" key={t.buyer + t.item}><div className="row between">
            <div><b>{t.item}</b><br /><small className="muted">{t.buyer}{t.stale && <> · <span className="warn">ціна застаріла</span></>}</small></div>
            <div className="row"><div style={{ textAlign: 'right' }}><b className="mono">{money(t.price)}</b><br /><small className="muted mono">макс. {money(t.max)}</small></div>
              <span className={'pill ' + (t.pos >= 80 ? 'good' : t.pos >= 40 ? 'warn' : 'bad')}>{t.pos}%</span></div>
          </div></div>))}</div> : <div className="card empty">Межі цін скупників ще не вписані.</div>}
      </div>
      <div className="grid">
        <section className="card">
          <div className="row between"><h2>Івенти</h2><span className="lbl mono">Київ {kyHM(Date.now())}</span></div>
          <EventList />
        </section>
      </div>
    </div>
  );
}
