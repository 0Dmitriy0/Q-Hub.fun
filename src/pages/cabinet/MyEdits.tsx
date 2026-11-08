import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { dbError, SECTION_NAME, STATUS, type Section } from '../../lib/wiki';
import { makeHash } from '../../lib/mapGeo';

/* «Мої правки» (specs/043 FR-017, FR-018): свої пропозиції до довідника зі статусом і причиною; відкриття вкладки
   позначає рішення побаченими (wiki_seen) — значок у кабінеті зникає */
interface Mine {
  id: string; section: Section; target_id: string | null; kind: 'new' | 'edit' | 'hide'; data: Record<string, unknown>;
  status: string; reason: string; created_at: string; decided_at: string | null; seen_at: string | null;
}
const KIND = { new: 'Нова сторінка', edit: 'Правка', hide: 'Прибрати сторінку' };
const when = (s: string) => new Date(s).toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const link = (p: Mine) => (p.section === 'job' ? `/wiki/roboty${p.target_id ? '?job=' + p.target_id : ''}`
  : p.section === 'guide' ? `/wiki/gaidy${p.target_id ? '/' + p.target_id : p.status.startsWith('accepted') && typeof p.data?.id === 'string' ? '/' + p.data.id : ''}`
  : p.section === 'map_point' ? (typeof p.data?.x === 'number' && typeof p.data?.y === 'number' ? '/mapa' + makeHash(p.data.x, p.data.y, 6) : '/mapa') : '/wiki/transport');

/* скільки рішень автор ще не бачив — для значка біля «Мої правки» */
export async function unseenCount(): Promise<number> {
  if (!supabase) return 0;
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user.id; if (!uid) return 0;
  const { count } = await supabase.from('wiki_proposals').select('id', { count: 'exact', head: true })
    .eq('author', uid).not('decided_at', 'is', null).is('seen_at', null);
  return count ?? 0;
}

export default function MyEdits({ onSeen }: { onSeen?: () => void }) {
  const [list, setList] = useState<Mine[] | null>(null);
  const [err, setErr] = useState(''); const [msg, setMsg] = useState('');

  async function load() {
    if (!supabase) return;
    const { data: s } = await supabase.auth.getSession();
    const { data, error } = await supabase.from('wiki_proposals').select('id,section,target_id,kind,data,status,reason,created_at,decided_at,seen_at')
      .eq('author', s.session?.user.id ?? '').order('created_at', { ascending: false }).limit(200);
    if (error) { setErr('Не вдалося завантажити твої правки.'); return; }
    setList(data as Mine[]);
    if ((data as Mine[]).some(p => p.decided_at && !p.seen_at)) { await supabase.rpc('wiki_seen'); onSeen?.(); }
  }
  useEffect(() => { load(); }, []);

  async function withdraw(id: string) {
    const { error } = await supabase!.from('wiki_proposals').update({ status: 'withdrawn' }).eq('id', id);
    setMsg(error ? dbError(error) : 'Пропозицію відкликано.'); load();
  }

  if (err) return <p className="card err">{err}</p>;
  if (!list) return <p className="card empty">Завантаження…</p>;
  if (!list.length) return (
    <div className="card empty">
      <b>Ти ще нічого не пропонував</b>
      <span className="muted">Побачив помилку в роботі чи авто? Відкрий картку й натисни «Запропонувати правку» — модератор перевірить, і твоє ім'я з'явиться на картці.</span>
      <div className="row"><Link className="btn acc sm" to="/wiki/roboty">Роботи</Link><Link className="btn ghost sm" to="/wiki/transport">Транспорт</Link></div>
    </div>
  );
  return (
    <section className="card">
      {msg && <p className={msg.startsWith('Пропозицію') ? 'good' : 'err'} role="status">{msg}</p>}
      <ul className="adm-list">
        {list.map(p => {
          const [label, tone] = STATUS[p.status] ?? [p.status, ''];
          const fresh = p.decided_at && !p.seen_at;
          return (
            <li key={p.id} className="adm-row">
              <div className="adm-row-main">
                <b>{SECTION_NAME[p.section]} · {p.section === 'map_point' ? (p.kind === 'new' ? 'Нова мітка' : 'Точка застаріла') : KIND[p.kind]}{p.data?.name ? ': ' + String(p.data.name) : ''}{fresh && <span className="wtag new">нове рішення</span>}</b>
                <span className="muted">Надіслано {when(p.created_at)}{p.decided_at ? ' · рішення ' + when(p.decided_at) : ''}</span>
                {p.status === 'rejected' && p.reason && <small className="err">Причина: {p.reason}</small>}
                {p.status === 'accepted_edited' && <small className="muted">Модератор трохи підправив твою правку перед публікацією.</small>}
                {p.status === 'conflict' && <small className="muted">Картку змінили після твоєї пропозиції — модератор порівняє з новою версією.</small>}
              </div>
              <span className={'pill ' + tone}>{label}</span>
              <div className="adm-row-act">
                {p.status === 'pending' && <button type="button" className="btn ghost sm" onClick={() => withdraw(p.id)}>Відкликати</button>}
                {(p.target_id || p.status.startsWith('accepted')) && <Link className="btn ghost sm" to={link(p)}>{p.section === 'map_point' ? 'Показати на мапі' : 'Відкрити розділ'}</Link>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
