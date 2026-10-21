import { useEffect, useRef, useState } from 'react';
import { when } from '../lib/format';

export interface Contributor { id: string; name: string; avatar_url: string | null; week: number; month?: number; year?: number; total: number; last_at: string; game_name?: string | null; static_id?: number | null }
type Period = 'week' | 'month' | 'year' | 'total';
const PERIODS: [Period, string][] = [['week', '7 днів'], ['month', 'Місяць'], ['year', 'Рік'], ['total', 'Весь час']];

/* рейтинг у вікні: кнопка в блоці оновлень, перемикач періоду, Esc або клік повз вікно закриває */
export default function Leaderboard({ list }: { list: Contributor[] }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [period, setPeriod] = useState<Period>('week');
  const [open, setOpen] = useState(false);
  useEffect(() => { if (open) dlg.current?.showModal(); else dlg.current?.close(); }, [open]);
  /* міграцію 0005 могли ще не запустити — тоді місяця й року в даних немає */
  const has = (p: Period) => list.length === 0 || list.some(c => c[p] !== undefined);
  const rows = list.map(c => ({ c, n: Number(c[period] ?? 0) })).filter(x => x.n > 0)
    .sort((a, b) => b.n - a.n || b.c.total - a.c.total).slice(0, 50);

  return (
    <>
      <button type="button" className="btn sm" onClick={() => setOpen(true)} aria-haspopup="dialog">🏆 Рейтинг</button>
      <dialog ref={dlg} className="modal" aria-labelledby="lb-title" onClose={() => setOpen(false)}
        onClick={e => { if (e.target === dlg.current) setOpen(false); }}>
        <div className="modal-box">
          <div className="row between"><h2 id="lb-title">Рейтинг тих, хто вносить ціни</h2>
            <button type="button" className="btn sm ghost" onClick={() => setOpen(false)} aria-label="Закрити рейтинг">✕</button></div>
          <div className="seg" role="group" aria-label="Період">
            {PERIODS.map(([p, label]) => <button key={p} type="button" aria-pressed={period === p} className={period === p ? 'on' : ''} disabled={!has(p)} onClick={() => setPeriod(p)}>{label}</button>)}
          </div>
          <p className="muted note">Бал — за кожне оновлення ціни. Виправлення впродовж 10 хв бала не додає, а ту саму свіжу ціну повторно внести не можна.</p>
          {rows.length
            ? <div className="scroll"><table className="t"><thead><tr><th>#</th><th>Гравець</th><th className="n">Оновлень</th><th>Останнє</th></tr></thead>
                <tbody>{rows.map(({ c, n }, i) => <tr key={c.id} className={i < 3 ? 'podium' : ''}><td className="mono">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td>
                  <td><span className="row who-cell">{c.avatar_url && <img src={c.avatar_url} alt="" width={22} height={22} className="ava" />}<b>{(c.game_name || '').trim() || c.name || 'гравець'}</b>{c.static_id ? <span className="muted mono">#{c.static_id}</span> : null}</span></td>
                  <td className="n">{n}</td><td>{when(c.last_at)}</td></tr>)}</tbody></table></div>
            : <div className="empty">{list.length ? 'За цей період ще ніхто не оновлював ціни.' : 'Рейтинг поки порожній. Перше оновлення ціни — і ти на першому місці.'}</div>}
        </div>
      </dialog>
    </>
  );
}
