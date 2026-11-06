import { useEffect, useRef, useState } from 'react';
import { when } from '../lib/format';
import Icon from './Icon';
import { supabase } from '../lib/supabase';

/* рейтинг довідника (specs/043 US4, 0057/0058): прийняті правки й нові сторінки окремо від цін */
type WikiAuthor = { id: string; name: string; avatar_url: string | null; accepted_edits: number; accepted_pages: number; last_at: string | null };

export interface Contributor { id: string; name: string; avatar_url: string | null; week: number; month?: number; year?: number; total: number; last_at: string }
type Period = 'week' | 'month' | 'year' | 'total';
const PERIODS: [Period, string][] = [['week', '7 днів'], ['month', 'Місяць'], ['year', 'Рік'], ['total', 'Весь час']];

/* рейтинг на акаунт: name — нік у Q-Hub (зведення contributors, 0038), без статіку (specs/025) */
/* рейтинг у вікні: кнопка в блоці оновлень, перемикач періоду, Esc або клік повз вікно закриває */
/* list не передано — лише рейтинг довідника (кнопка на сторінках «Роботи» й «Транспорт») */
export default function Leaderboard({ list: given }: { list?: Contributor[] }) {
  const list = given ?? [];
  const dlg = useRef<HTMLDialogElement>(null);
  const [period, setPeriod] = useState<Period>('week');
  const [open, setOpen] = useState(false);
  const [what, setWhat] = useState<'prices' | 'wiki'>(given ? 'prices' : 'wiki');
  const [wiki, setWiki] = useState<WikiAuthor[] | null>(null);
  useEffect(() => {
    if (!open || what !== 'wiki' || wiki || !supabase) return;
    supabase.from('wiki_contributors').select('id,name,avatar_url,accepted_edits,accepted_pages,last_at').then(({ data, error }) =>
      setWiki(error ? [] : ((data ?? []) as WikiAuthor[]).map(w => ({ ...w, accepted_edits: Number(w.accepted_edits), accepted_pages: Number(w.accepted_pages) }))
        .sort((a, b) => b.accepted_pages + b.accepted_edits - (a.accepted_pages + a.accepted_edits) || b.accepted_pages - a.accepted_pages).slice(0, 50)));
  }, [open, what]);
  useEffect(() => { if (open) dlg.current?.showModal(); else dlg.current?.close(); }, [open]);
  /* міграцію 0005 могли ще не запустити — тоді місяця й року в даних немає */
  const has = (p: Period) => list.length === 0 || list.some(c => c[p] !== undefined);
  const rows = list.map(c => ({ c, n: Number(c[period] ?? 0) })).filter(x => x.n > 0)
    .sort((a, b) => b.n - a.n || b.c.total - a.c.total).slice(0, 50);

  return (
    <>
      <button type="button" className="btn sm" onClick={() => setOpen(true)} aria-haspopup="dialog"><Icon name="trophy" />Рейтинг</button>
      <dialog ref={dlg} className="modal" aria-labelledby="lb-title" onClose={() => setOpen(false)}
        onClick={e => { if (e.target === dlg.current) setOpen(false); }}>
        <div className="modal-box">
          <div className="row between"><h2 id="lb-title">{what === 'wiki' ? 'Рейтинг авторів довідника' : 'Рейтинг тих, хто вносить ціни'}</h2>
            <button type="button" className="btn sm ghost" onClick={() => setOpen(false)} aria-label="Закрити рейтинг">✕</button></div>
          {given && <div className="seg" role="tablist" aria-label="Рейтинг">
            <button type="button" role="tab" aria-selected={what === 'prices'} className={what === 'prices' ? 'on' : ''} onClick={() => setWhat('prices')}>Ціни</button>
            <button type="button" role="tab" aria-selected={what === 'wiki'} className={what === 'wiki' ? 'on' : ''} onClick={() => setWhat('wiki')}>Довідник</button>
          </div>}
          {what === 'wiki' ? <WikiTable list={wiki} /> : <>
          <div className="seg" role="group" aria-label="Період">
            {PERIODS.map(([p, label]) => <button key={p} type="button" aria-pressed={period === p} className={period === p ? 'on' : ''} disabled={!has(p)} onClick={() => setPeriod(p)}>{label}</button>)}
          </div>
          <p className="muted note">Бал — за кожне оновлення ціни. Виправлення впродовж 10 хв бала не додає, а ту саму свіжу ціну повторно внести не можна.</p>
          {rows.length
            ? <div className="scroll"><table className="t"><thead><tr><th>#</th><th>Гравець</th><th className="n">Оновлень</th><th>Останнє</th></tr></thead>
                <tbody>{rows.map(({ c, n }, i) => <tr key={c.id} className={i < 3 ? 'podium' : ''}><td className="mono">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td>
                  <td><span className="row who-cell">{c.avatar_url && <img src={c.avatar_url} alt="" width={22} height={22} className="ava" />}<b>{c.name || 'гравець'}</b></span></td>
                  <td className="n">{n}</td><td>{when(c.last_at)}</td></tr>)}</tbody></table></div>
            : <div className="empty">{list.length ? 'За цей період ще ніхто не оновлював ціни.' : 'Рейтинг поки порожній. Перше оновлення ціни — і ти на першому місці.'}</div>}
          </>}
        </div>
      </dialog>
    </>
  );
}

function WikiTable({ list }: { list: WikiAuthor[] | null }) {
  if (!list) return <p className="muted">Завантаження…</p>;
  return (<>
    <p className="muted note">Бал — за кожну прийняту модератором правку картки чи нову сторінку в «Роботах» і «Транспорті».</p>
    {list.length
      ? <div className="scroll"><table className="t"><thead><tr><th>#</th><th>Гравець</th><th className="n">Правок</th><th className="n">Нових сторінок</th><th>Останнє</th></tr></thead>
          <tbody>{list.map((c, i) => <tr key={c.id} className={i < 3 ? 'podium' : ''}><td className="mono">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td>
            <td><span className="row who-cell">{c.avatar_url && <img src={c.avatar_url} alt="" width={22} height={22} className="ava" />}<b>{c.name || 'гравець'}</b></span></td>
            <td className="n">{c.accepted_edits}</td><td className="n">{c.accepted_pages}</td><td>{c.last_at ? when(c.last_at) : '—'}</td></tr>)}</tbody></table></div>
      : <div className="empty">Поки нікого. Знайди помилку в роботі чи авто й натисни «Запропонувати правку» — після прийняття ти тут.</div>}
  </>);
}
