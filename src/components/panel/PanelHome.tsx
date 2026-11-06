import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { age, draftCounts, KIND_LABEL, panelError, summarize, type DraftSummary, type QueueSummary, type TaskKind, type TaskRow } from '../../lib/panel';
import AdminSection from '../admin/AdminSection';
import Icon from '../Icon';

/* головна панелі (specs/061 US1, US3): «Чекає на тебе» — для тих, хто публікує довідник; «Мої інструменти» — для всіх помічників */
const ORDER: TaskKind[] = ['edit', 'new_page', 'hide_page', 'stale_point', 'new_point'];

export default function PanelHome({ canReview }: { canReview: boolean }) {
  return (
    <>
      {canReview && <Waiting />}
      <Tools />
    </>
  );
}

function Waiting() {
  const [s, setS] = useState<QueueSummary | null>(null);
  const [err, setErr] = useState('');
  const load = () => {
    setErr('');
    supabase!.from('wiki_proposals').select('section,kind,status,created_at').in('status', ['pending', 'conflict']).limit(1000)
      .then(({ data, error }) => { if (error) setErr('Не вдалося завантажити чергу. ' + panelError(error)); else setS(summarize((data ?? []) as TaskRow[])); });
  };
  useEffect(load, []);
  return (
    <AdminSection title="Чекає на тебе" error={err} onRetry={load} loading={!s && !err}
      hint="Пропозиції від гравців, які ще ніхто не розібрав. Натисни рядок — відкриється розбір саме цього виду.">
      {s && (s.total === 0 ? (
        <p className="adm-empty">Усе розібрано. Нових пропозицій немає. <Link to="/panel/rishennia">Мої рішення</Link> · <Link to="/panel/prybrani">Прибрані сторінки</Link></p>
      ) : (
        <ul className="pnl-wait">
          <li><Link to="/panel/rozbir"><b className="num">{s.total}</b><span><b>Усього на розгляді</b>{s.oldest_at && <small className="muted">найстаріша — {age(s.oldest_at)}</small>}</span></Link></li>
          {ORDER.filter(k => s.by[k]).map(k => (
            <li key={k}><Link to={'/panel/rozbir?f=' + k}><b className="num">{s.by[k]}</b><span><b>{KIND_LABEL[k]}</b></span></Link></li>))}
          {s.conflicts > 0 && (
            <li className="warn-row"><Link to="/panel/rozbir?f=conflict"><b className="num">{s.conflicts}</b><span><b>Конфлікти</b><small className="muted">Картку змінили, поки пропозиція чекала — перевір уважно.</small></span></Link></li>)}
        </ul>
      ))}
    </AdminSection>
  );
}

function Tools() {
  const { session } = useAuth();
  const [d, setD] = useState<DraftSummary | null>(null);
  useEffect(() => {
    const me = session?.user.id; if (!me) return;
    supabase!.from('map_drafts').select('status').eq('author', me).limit(1000)
      .then(({ data }) => setD(draftCounts((data ?? []) as { status: string }[])));
  }, [session?.user.id]);
  return (
    <AdminSection title="Мої інструменти" hint="Те, що ти робиш на інших сторінках сайту. Один натиск — і ти там.">
      <ul className="pnl-tools">
        <li><Link to="/mapa?tools=drafts"><Icon name="map" size={20} /><span><b>Мої чернетки міток</b>
          <small className="muted">{d ? `На розгляді: ${d.new} · Опубліковано: ${d.published} · Відхилено: ${d.rejected}` : '…'}</small>
          <small className="muted">Мітки, які ти поставив у грі клавішею F9. Публікує власник.</small></span></Link></li>
        <li><Link to="/tsiny"><Icon name="tag" size={20} /><span><b>Межі цін</b>
          <small className="muted">Відкрий товар у скупника — під графіком поля «Мінімум» і «Максимум».</small></span></Link></li>
        <li><Link to="/wiki/iventy"><Icon name="clock" size={20} /><span><b>Івенти</b>
          <small className="muted">Додати чи змінити івент або промокод.</small></span></Link></li>
      </ul>
    </AdminSection>
  );
}
