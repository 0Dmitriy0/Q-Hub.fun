import { Link } from 'react-router-dom';
import { usePrices } from '../lib/usePrices';
import { advise, type Held } from '../lib/advice';
import { money, qty, signed } from '../lib/format';
import { asset } from '../lib/app';

/* «Що вигідно зараз»: склад гравця × поточні ціни скупників з сайту; видно лише TOP найвигідніших, решта — на складі */
const TOP = 5;
export default function Profitable({ held }: { held: Held[] }) {
  const { prices, error } = usePrices();
  const list = prices ? advise(held, prices) : [];
  const total = list.reduce((s, a) => s + a.value, 0);
  const iconOf = new Map((prices ?? []).map(p => [p.item.trim().toLowerCase(), p.icon]));
  return (
    <section className="card">
      <div className="row between"><h2>Що вигідно зараз</h2>{list.length > 0 && <span className="muted">склад за цінами скупників: <b className="mono">{money(total)}</b></span>}</div>
      {error && <p className="err">{error}</p>}
      {!prices ? <div className="empty">Завантаження цін…</div> : list.length ? (
        <><div className="list">{list.slice(0, TOP).map(a => (
          <div className="li" key={a.item}>
            <div className="titem">{iconOf.get(a.item.trim().toLowerCase()) ? <img className="ico-item big" src={asset(iconOf.get(a.item.trim().toLowerCase())!)} alt="" /> : null}<div><b>{a.item}</b> × {qty(a.qty)}<br /><small>{a.buyer} · {money(a.price)}/шт{a.pos !== null ? ` · ${a.pos}% діапазону` : ''}{a.stale ? ' · ціна може бути застаріла' : ''}</small></div></div>
            <div style={{ textAlign: 'right' }}>
              <b className="mono">{money(a.value)}</b><br />
              {a.sell ? <span className="pill good">Здавати зараз</span> : a.pos !== null ? <span className="pill warn">Краще почекати</span> : null}
              {a.profit !== null && <small className={a.profit >= 0 ? 'good' : 'bad'}> {signed(a.profit)}</small>}
            </div>
          </div>))}
        </div>
        {list.length > TOP && <Link className="muted" to="/kabinet/sklad">Ще {list.length - TOP} поз. — на складі</Link>}</>
      ) : <div className="empty">{held.length ? 'Для товарів зі складу скупники ще не мають цін.' : 'Склад порожній. Запиши, що купив чи нафармив, — і тут з’явиться, кому й коли вигідно здати.'}</div>}
    </section>
  );
}
