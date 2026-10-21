import { useEffect, useRef, useState } from 'react';
import { money, when } from '../lib/format';
import { DAY, GOOD, PERIOD, type Pt, type Range } from '../lib/pricestats';

/* ступінчаста лінія: ціна скупника тримається до наступної зміни */
function stepPath(pts: Pt[], x: (t: number) => number, y: (p: number) => number, end: number) {
  if (!pts.length) return '';
  let d = `M${x(pts[0].t).toFixed(1)},${y(pts[0].p).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += `H${x(pts[i].t).toFixed(1)}V${y(pts[i].p).toFixed(1)}`;
  return d + `H${x(end).toFixed(1)}`;
}

/* маленька лінія в рядку списку — лише форма руху ціни, без осей */
export function Spark({ pts, now }: { pts: Pt[]; now: number }) {
  if (pts.length < 2) return <span className="spark none" aria-hidden="true" />;
  const W = 72, H = 24, lo = Math.min(...pts.map(p => p.p)), hi = Math.max(...pts.map(p => p.p)), span = hi - lo || 1;
  const x = (t: number) => ((t - (now - PERIOD)) / PERIOD) * W, y = (p: number) => H - 3 - ((p - lo) / span) * (H - 6);
  return <svg className="spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true"><path d={stepPath(pts, x, y, now)} /></svg>;
}

export function RangeBar({ pos, range }: { pos: number | null; range: Range | null }) {
  if (pos === null || !range) return <span className="rbar-none">меж ще немає</span>;
  const good = pos >= GOOD;
  return (
    <span className={'rbar' + (good ? ' good' : '')} title={`${pos}% між мінімумом ${money(range.min)} і максимумом ${money(range.max)}`}>
      <span className="rtrack"><span className="rfill" style={{ width: pos + '%' }} /></span>
      <span className="rtxt mono">{good ? '▲ ' : ''}{pos}%{good ? ' вигідно' : ''}</span>
    </span>
  );
}

const day = new Intl.DateTimeFormat('uk-UA', { day: '2-digit', month: '2-digit' });

/* графік за 30 днів: межі мін/макс пунктиром, наведення показує ціну в будь-який момент */
export function PriceChart({ pts, range, now, name }: { pts: Pt[]; range: Range | null; now: number; name: string }) {
  const box = useRef<SVGSVGElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [hov, setHov] = useState<{ i: number; x: number } | null>(null);
  /* ширина в справжніх пікселях, щоб підписи осей не роздувались і не дрібніли разом з картинкою */
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const H = W < 480 ? 190 : 240, L = 52, R = 8, T = 12, B = 26;
  const vals = pts.map(p => p.p).concat(range ? [range.min, range.max] : []);
  if (!vals.length) return <div className="empty">Історії цін за 30 днів ще немає.</div>;
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo || hi || 1) * 0.12; lo = Math.max(0, lo - pad); hi += pad;
  const from = now - PERIOD;
  const x = (t: number) => L + ((t - from) / PERIOD) * (W - L - R), y = (p: number) => T + (1 - (p - lo) / (hi - lo)) * (H - T - B);
  const ticks = [0, 1, 2, 3].map(k => lo + ((hi - lo) * k) / 3);
  const days = [0, 10, 20, 30].map(k => from + k * DAY);

  function move(e: React.PointerEvent<SVGSVGElement>) {
    const r = box.current!.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W;
    if (px < L) { setHov(null); return; }
    const t = from + ((px - L) / (W - L - R)) * PERIOD;
    let i = -1; for (let k = 0; k < pts.length; k++) if (pts[k].t <= t) i = k;
    setHov(i < 0 ? null : { i, x: Math.min(px, W - R) });
  }
  const h = hov ? pts[hov.i] : null;

  return (
    <figure className="chart">
      <div className="chart-box" ref={wrap}>
        <svg ref={box} viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Ціна «${name}» за 30 днів`} onPointerMove={move} onPointerLeave={() => setHov(null)}>
          {ticks.map(v => <g key={v}><line className="grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text className="ax" x={L - 8} y={y(v) + 4} textAnchor="end">{Math.round(v).toLocaleString('uk-UA')}</text></g>)}
          {days.map(t => <text key={t} className="ax" x={x(t)} y={H - 8} textAnchor={t === from ? 'start' : t >= now ? 'end' : 'middle'}>{day.format(t)}</text>)}
          {range && <>
            <line className="lim" x1={L} x2={W - R} y1={y(range.max)} y2={y(range.max)} /><text className="ax lab" x={W - R - 4} y={y(range.max) - 5} textAnchor="end">макс {money(range.max)}</text>
            <line className="lim" x1={L} x2={W - R} y1={y(range.min)} y2={y(range.min)} /><text className="ax lab" x={W - R - 4} y={y(range.min) + 14} textAnchor="end">мін {money(range.min)}</text>
          </>}
          <path className="line" d={stepPath(pts, x, y, now)} />
          {pts.length === 1 && <circle className="dot" cx={x(pts[0].t)} cy={y(pts[0].p)} r={4} />}
          {h && <><line className="cross" x1={hov!.x} x2={hov!.x} y1={T} y2={H - B} /><circle className="dot" cx={hov!.x} cy={y(h.p)} r={4} /></>}
        </svg>
        {h && <div className="tip" style={{ left: `${Math.min(88, Math.max(12, (hov!.x / W) * 100))}%` }}><b className="mono">{money(h.p)}</b><small>з {when(h.t)}</small></div>}
      </div>
      <details className="chart-table"><summary>Усі зміни ціни таблицею</summary>
        <table className="t"><thead><tr><th>Коли</th><th className="n">Ціна</th></tr></thead>
          <tbody>{pts.filter(p => p.t > now - PERIOD).reverse().map(p => <tr key={p.t + ':' + p.p}><td>{when(p.t)}</td><td className="n">{money(p.p)}</td></tr>)}</tbody></table>
      </details>
    </figure>
  );
}
