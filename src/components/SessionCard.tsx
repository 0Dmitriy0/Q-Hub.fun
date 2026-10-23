import { useEffect, useState } from 'react';
import { useRows } from '../lib/useRows';
import { hm, live, played, type GameSession } from '../lib/sessions';
import { canEdit } from '../lib/app';

/* ігрова сесія на дашборді: програма сама бачить, коли гра запущена й закрита */
export default function SessionCard({ characterId }: { characterId: string }) {
  const { rows } = useRows<GameSession>('game_sessions', characterId, 'started_at', false);
  /* таймер лише перемальовує картку; «зараз» — справжнє на кожному малюванні (дані після закриття гри приходять раніше за таймер) */
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 30e3); return () => clearInterval(t); }, []);
  const now = Date.now();
  const cur = live(rows, now);
  return (
    <section className="card">
      <div className="row between"><h2>Ігрова сесія</h2>
        <span className={'pill ' + (cur ? 'good' : '')}>{cur ? '● гра йде' : 'гра не запущена'}</span></div>
      <div className="big" style={{ fontSize: 30 }}>{cur ? hm(now - Date.parse(cur.started_at)) : '—'}</div>
      <div className="trip tight">
        <div><small>Сьогодні</small><b className="mono">{hm(played(rows, 'today', now))}</b></div>
        <div><small>Вчора</small><b className="mono">{hm(played(rows, 'yesterday', now))}</b></div>
        <div><small>7 днів</small><b className="mono">{hm(played(rows, 'week', now))}</b></div>
      </div>
      <small className="muted">{canEdit ? 'Рахується сам: програма бачить, коли запущена гра.' : 'Рахує програма Q-Hub, коли запущена гра.'}</small>
    </section>
  );
}
