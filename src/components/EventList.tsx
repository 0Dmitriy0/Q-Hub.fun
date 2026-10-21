import { useEffect, useState } from 'react';
import { dur, eventStatus, kyHM } from '../lib/events';

export default function EventList({ compact }: { compact?: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);
  const list = eventStatus(now).sort((a, b) => (a.now ? 0 : 1) - (b.now ? 0 : 1) || (a.next?.s ?? Infinity) - (b.next?.s ?? Infinity));
  return (
    <div className="list" style={{ gap: 8 }}>
      {(compact ? list.slice(0, 4) : list).map(s => {
        const soon = !s.now && s.next && s.next.s - now <= 15 * 60000;
        return (
          <div key={s.ev.id} className={'ev' + (s.now ? ' on' : soon ? ' soon' : '')}>
            <b>{s.ev.name}</b>
            <small>{s.now ? `${kyHM(s.now.s)}–${kyHM(s.now.e)}` : s.ev.sched}</small>
            <span className="st">{s.now ? `зараз · ще ${dur(s.now.e - now)}` : s.next ? `о ${kyHM(s.next.s)} · через ${dur(s.next.s - now)}` : '—'}</span>
          </div>
        );
      })}
    </div>
  );
}
