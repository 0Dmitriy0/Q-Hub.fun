import { useCallback, useRef, useState } from 'react';
import { fmt, money } from '../lib/format';

/* Графіки «Обліку» без бібліотек. Кольори прибутку/витрат перевірено валідатором палітри (CVD, контраст) — .ch-in / .ch-out у styles.css */
const H = 180, PAD = { l: 8, r: 8, t: 10, b: 22 };
const short = (n: number) => (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + 'кк' : Math.abs(n) >= 1e3 ? Math.round(n / 1e3) + 'к' : fmt(n));
const date = (t: number) => new Date(t).toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit' });
/* графік малюється в справжню ширину картки — інакше підписи осей зменшуються разом із SVG */
function useWidth() {
  const [w, setW] = useState(600);
  const ro = useRef<ResizeObserver | null>(null);
  /* callback-ref: спостерігач переходить на новий елемент, коли «порожньо» змінюється графіком */
  const ref = useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect();
    if (!el) return;
    ro.current = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.current.observe(el);
  }, []);
  return [ref, w] as const;
}
const dateTime = (t: number) => new Date(t).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/* баланс у часі: одна лінія, перехрестя й підказка з найближчою точкою */
export function BalanceChart({ pts }: { pts: { t: number; b: number }[] }) {
  const [hi, setHi] = useState<number | null>(null);
  const [ref, W] = useWidth();
  if (pts.length < 2) return <div ref={ref} className="ch-empty">Графік з’явиться після двох записів.</div>;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1;
  const lo = Math.min(...pts.map(p => p.b)), hiB = Math.max(...pts.map(p => p.b)), span = hiB - lo || 1;
  const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0 || 1)) * (W - PAD.l - PAD.r);
  const y = (b: number) => PAD.t + (1 - (b - lo) / span) * (H - PAD.t - PAD.b);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.b).toFixed(1)}`).join('');
  const p = hi !== null ? pts[hi] : null;
  function move(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect(), mx = ((e.clientX - r.left) / r.width) * W;
    let best = 0; for (let i = 1; i < pts.length; i++) if (Math.abs(x(pts[i].t) - mx) < Math.abs(x(pts[best].t) - mx)) best = i;
    setHi(best);
  }
  return (
    <div ref={ref} className="ch">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Баланс від ${money(pts[0].b)} до ${money(pts[pts.length - 1].b)}`} onPointerMove={move} onPointerLeave={() => setHi(null)}>
        <line className="ch-grid" x1={PAD.l} x2={W - PAD.r} y1={y(hiB)} y2={y(hiB)} />
        <line className="ch-grid" x1={PAD.l} x2={W - PAD.r} y1={y(lo)} y2={y(lo)} />
        <path className="ch-area" d={`${d}L${x(t1)},${H - PAD.b}L${x(t0)},${H - PAD.b}Z`} />
        <path className="ch-line" d={d} />
        <text className="ch-ax" x={PAD.l} y={H - 6}>{date(t0)}</text>
        <text className="ch-ax" x={W - PAD.r} y={H - 6} textAnchor="end">{date(t1)}</text>
        <text className="ch-ax" x={W - PAD.r} y={y(hiB) - 3} textAnchor="end">{short(hiB)}</text>
        {p && <><line className="ch-cross" x1={x(p.t)} x2={x(p.t)} y1={PAD.t} y2={H - PAD.b} /><circle className="ch-dot" cx={x(p.t)} cy={y(p.b)} r={4.5} /></>}
      </svg>
      {p && <div className="ch-tip" style={{ left: `${(x(p.t) / W) * 100}%` }}><b>{money(p.b)}</b><small>{dateTime(p.t)}</small></div>}
    </div>
  );
}

/* останні дні: прибуток і витрати поруч, підказка на весь день */
export function DaysChart({ days }: { days: { d: number; in: number; out: number }[] }) {
  const [hi, setHi] = useState<number | null>(null);
  const [ref, W] = useWidth();
  const max = Math.max(1, ...days.flatMap(d => [d.in, d.out]));
  if (!days.some(d => d.in || d.out)) return <div ref={ref} className="ch-empty">За останні {days.length} днів записів немає.</div>;
  const cw = (W - PAD.l - PAD.r) / days.length, bw = Math.min(22, (cw - 10) / 2);
  const h = (v: number) => (v / max) * (H - PAD.t - PAD.b);
  /* стовпчик з заокругленим верхом 4px, основа — на осі */
  const bar = (x0: number, v: number) => { const hh = h(v), r = Math.min(4, hh, bw / 2), yb = H - PAD.b, yt = yb - hh;
    return hh <= 0 ? '' : `M${x0},${yb}V${yt + r}Q${x0},${yt} ${x0 + r},${yt}H${x0 + bw - r}Q${x0 + bw},${yt} ${x0 + bw},${yt + r}V${yb}Z`; };
  const d = hi !== null ? days[hi] : null;
  return (
    <div ref={ref} className="ch">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Прибуток і витрати за днями" onPointerLeave={() => setHi(null)}>
        <line className="ch-base" x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} />
        {days.map((x, i) => { const cx = PAD.l + i * cw + cw / 2; return (
          <g key={x.d} onPointerEnter={() => setHi(i)}>
            <rect className={'ch-hit' + (hi === i ? ' on' : '')} x={PAD.l + i * cw} y={PAD.t} width={cw} height={H - PAD.t - PAD.b} />
            <path className="ch-in" d={bar(cx - bw - 1, x.in)} />
            <path className="ch-out" d={bar(cx + 1, x.out)} />
            <text className="ch-ax" x={cx} y={H - 6} textAnchor="middle">{date(x.d)}</text>
          </g>); })}
      </svg>
      {d && <div className="ch-tip" style={{ left: `${((PAD.l + hi! * cw + cw / 2) / W) * 100}%` }}><small>{date(d.d)}</small><span><i className="sw in" />Прибуток <b>{money(d.in)}</b></span><span><i className="sw out" />Витрати <b>{money(d.out)}</b></span></div>}
    </div>
  );
}
