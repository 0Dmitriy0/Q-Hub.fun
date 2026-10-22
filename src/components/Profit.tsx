import Icon from './Icon';

/* прибутковість трьома монетами; 0 — ще не оцінена */
export default function Profit({ n }: { n: number }) {
  return (
    <span className="jprofit" title={n ? `Прибутковість ${n} з 3` : 'Прибутковість ще не оцінена'} aria-label={n ? `Прибутковість ${n} з 3` : 'Прибутковість не оцінена'}>
      {[1, 2, 3].map(i => <Icon key={i} name="coin" size={15} className={i <= n ? 'on' : ''} />)}
    </span>
  );
}
