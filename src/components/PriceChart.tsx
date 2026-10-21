import { useEffect, useRef, useState } from 'react';
import { money, when } from '../lib/format';
import { GOOD, PERIOD, chartWindow, seriesIn, type ChartPeriod, type Pt, type Range } from '../lib/pricestats';

/* маленька лінія в рядку списку — лише форма руху ціни, без осей */
export function Spark({ pts, now }: { pts: Pt[]; now: number }) {
  if (pts.length < 2) return <span className="spark none" aria-hidden="true" />;
  const W = 72, H = 24, lo = Math.min(...pts.map(p => p.p)), hi = Math.max(...pts.map(p => p.p)), span = hi - lo || 1;
  const x = (t: number) => ((t - (now - PERIOD)) / PERIOD) * W, y = (p: number) => H - 3 - ((p - lo) / span) * (H - 6);
  const xy: [number, number][] = pts.map(p => [x(p.t), y(p.p)]); xy.push([W, y(pts[pts.length - 1].p)]);
  return <svg className="spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true"><path d={smoothPath(xy)} /></svg>;
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

const fDay = new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit' });
const fHour = new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit' });
const fMonth = new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kyiv', month: 'short' });
const PERIODS: [ChartPeriod, string][] = [['today', 'Сьогодні'], ['yesterday', 'Вчора'], ['month', 'Місяць'], ['year', 'Рік']];

/* плавна лінія через точки без «перелітів» вище чи нижче сусідніх цін (монотонна кубічна, Fritsch–Carlson) */
function smoothPath(xy: [number, number][]) {
  const n = xy.length; if (!n) return '';
  if (n === 1) return `M${xy[0][0]},${xy[0][1]}`;
  const d: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((xy[i + 1][1] - xy[i][1]) / (xy[i + 1][0] - xy[i][0] || 1));
  m.push(d[0]); for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2); m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; } else {
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  let path = `M${xy[0][0].toFixed(1)},${xy[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = xy[i], [x1, y1] = xy[i + 1], dx = (x1 - x0) / 3;
    path += `C${(x0 + dx).toFixed(1)},${(y0 + m[i] * dx).toFixed(1)} ${(x1 - dx).toFixed(1)},${(y1 - m[i + 1] * dx).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return path;
}

/* графік ціни за вибраний період: плавна лінія з точками на кожній зміні, легка заливка під нею,
   межі мін/макс пунктиром; наведення підсвічує найближчу зміну ціни */
export function PriceChart({ raw, range, name }: { raw: Pt[]; range: Range | null; name: string }) {
  const box = useRef<SVGSVGElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [period, setPeriod] = useState<ChartPeriod>('month');
  const [hov, setHov] = useState<number | null>(null);
  /* ширина в справжніх пікселях, щоб підписи осей не роздувались і не дрібніли разом з картинкою */
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const { from, to } = chartWindow(period);
  const pts = seriesIn(raw, from, to);
  const changes = pts.filter(p => p.t > from);           // справжні зміни ціни (без точки «на початок вікна»)
  const H = W < 480 ? 200 : 250, L = 52, R = 14, T = 16, B = 28;
  const vals = pts.map(p => p.p).concat(range ? [range.min, range.max] : []);
  let lo = vals.length ? Math.min(...vals) : 0, hi = vals.length ? Math.max(...vals) : 1;
  const pad = (hi - lo || hi || 1) * 0.14; lo = Math.max(0, lo - pad); hi += pad;
  const span = to - from;
  const x = (t: number) => L + ((t - from) / span) * (W - L - R), y = (p: number) => T + (1 - (p - lo) / (hi - lo)) * (H - T - B);
  const ticks = [0, 1, 2, 3].map(k => lo + ((hi - lo) * k) / 3);
  /* на вузькому екрані підписів менше, щоб вони не налазили один на одного */
  const narrow = W < 520, step = narrow ? 6 : 3, parts = period === 'year' ? (narrow ? 3 : 6) : 3;
  const xt = period === 'today' || period === 'yesterday' ? Array.from({ length: 24 / step }, (_, k) => from + k * step * 36e5).filter(t => t <= to)
    : Array.from({ length: parts + 1 }, (_, k) => from + (span * k) / parts);
  const xl = (t: number) => (period === 'today' || period === 'yesterday' ? fHour.format(t) : period === 'month' ? fDay.format(t) : fMonth.format(t).replace('.', ''));
  const xy: [number, number][] = pts.map(p => [x(p.t), y(p.p)]);
  if (pts.length) xy.push([x(to), y(pts[pts.length - 1].p)]);     // ціна тримається до кінця вікна
  const line = smoothPath(xy);
  const area = xy.length ? `${line}L${xy[xy.length - 1][0].toFixed(1)},${H - B}L${xy[0][0].toFixed(1)},${H - B}Z` : '';

  function move(e: React.PointerEvent<SVGSVGElement>) {
    if (!changes.length) return;
    const r = box.current!.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W;
    let best = 0; changes.forEach((p, i) => { if (Math.abs(x(p.t) - px) < Math.abs(x(changes[best].t) - px)) best = i; });
    setHov(best);
  }
  const h = hov !== null ? changes[hov] : null;

  return (
    <figure className="chart">
      <div className="row between chart-head">
        <div className="seg chart-seg" role="group" aria-label="Період графіка">
          {PERIODS.map(([p, l]) => <button key={p} type="button" aria-pressed={period === p} className={period === p ? 'on' : ''} onClick={() => { setPeriod(p); setHov(null); }}>{l}</button>)}
        </div>
        <small className="muted">{changes.length ? `${changes.length} ${changes.length === 1 ? 'зміна' : changes.length < 5 ? 'зміни' : 'змін'} ціни` : 'змін ціни не було'}</small>
      </div>
      <div className="chart-box" ref={wrap}>
        {!pts.length ? <div className="empty">За цей період історії цін ще немає.</div> :
        <svg ref={box} viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Ціна «${name}»: ${PERIODS.find(p => p[0] === period)![1].toLowerCase()}`} onPointerMove={move} onPointerLeave={() => setHov(null)}>
          {ticks.map(v => <g key={v}><line className="grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text className="ax" x={L - 8} y={y(v) + 4} textAnchor="end">{Math.round(v).toLocaleString('uk-UA')}</text></g>)}
          {xt.map((t, i) => <g key={t}><line className="grid v" x1={x(t)} x2={x(t)} y1={T} y2={H - B} /><text className="ax" x={x(t)} y={H - 8} textAnchor={i === 0 ? 'start' : t >= to - 1 ? 'end' : 'middle'}>{xl(t)}</text></g>)}
          {range && <>
            <line className="lim" x1={L} x2={W - R} y1={y(range.max)} y2={y(range.max)} /><text className="ax lab" x={W - R - 4} y={y(range.max) - 6} textAnchor="end">макс {money(range.max)}</text>
            <line className="lim" x1={L} x2={W - R} y1={y(range.min)} y2={y(range.min)} /><text className="ax lab" x={W - R - 4} y={y(range.min) + 15} textAnchor="end">мін {money(range.min)}</text>
          </>}
          <path className="area" d={area} />
          <path className="line" d={line} />
          {h && <line className="cross" x1={x(h.t)} x2={x(h.t)} y1={T} y2={H - B} />}
          {changes.map((p, i) => <circle key={p.t} className={'pt' + (i === hov ? ' on' : '')} cx={x(p.t)} cy={y(p.p)} r={i === hov ? 7 : 5} />)}
        </svg>}
        {h && <div className="tip" style={{ left: `${Math.min(88, Math.max(12, (x(h.t) / W) * 100))}%` }}><b className="mono">{money(h.p)}</b><small>{when(h.t)}</small></div>}
      </div>
      <details className="chart-table"><summary>Зміни ціни таблицею</summary>
        <table className="t"><thead><tr><th>Коли</th><th className="n">Ціна</th></tr></thead>
          <tbody>{changes.slice().reverse().map(p => <tr key={p.t + ':' + p.p}><td>{when(p.t)}</td><td className="n">{money(p.p)}</td></tr>)}</tbody></table>
      </details>
    </figure>
  );
}
