import { Navigate, useLocation } from 'react-router-dom';
import Admin from './Admin';

/* /panel — «Модерація» (specs/061, з 2026-11-15 — та сама сторінка, що й адмінка, з розділами модератора чи редактора).
   Старі адреси /panel/rozbir, /panel/rishennia, /panel/prybrani — у вкладки ?tab=… (фільтр f, id зберігаються) */
const OLD: Record<string, string> = { rozbir: 'review', rishennia: 'decisions', prybrani: 'hidden' };

export default function Panel() {
  const { pathname, search } = useLocation();
  const sub = pathname.replace(/^\/panel\/?/, '').split('/')[0];
  if (sub) {
    const p = new URLSearchParams(search);
    if (OLD[sub]) p.set('tab', OLD[sub]);
    const q = p.toString();
    return <Navigate to={'/panel' + (q ? '?' + q : '')} replace />;
  }
  return <Admin mode="team" />;
}
