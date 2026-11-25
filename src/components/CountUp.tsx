import { useEffect, useRef, useState } from 'react';
import { fmt } from '../lib/format';
import { reducedMotion } from '../lib/viewNav';

/* число, що «набігає» від нуля, коли вперше з'являється на екрані (0,5 с, сповільнення в кінці). Зі «зменшеним рухом»,
   без IntersectionObserver — одразу справжнє значення; скрінрідер завжди читає справжнє (прихований текст) */
export default function CountUp({ n, className }: { n: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(() => (reducedMotion() || typeof IntersectionObserver === 'undefined' ? n : 0));
  const done = useRef(false);
  useEffect(() => {
    if (done.current || reducedMotion() || typeof IntersectionObserver === 'undefined') { setShown(n); return; }
    const el = ref.current; if (!el) return;
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect(); done.current = true;
      const t0 = performance.now(), D = 500;
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / D), ease = 1 - (1 - k) ** 3;
        setShown(Math.round(n * ease));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [n]);
  return <span ref={ref} className={className}><span aria-hidden="true">{fmt(shown)}</span><span className="vh">{fmt(n)}</span></span>;
}
