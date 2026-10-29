import { Link } from 'react-router-dom';
import { useAppOnline } from '../lib/useAppOnline';

/* «зараз у програмі» в шапці. Поки функції в базі немає або бази немає зовсім — нічого не показує */
export default function AppOnline() {
  const n = useAppOnline();
  if (n === null) return null;
  return (
    <Link to="/programa" className="online" title="Гравців із запущеною програмою Q-Hub зараз">
      <span className="online-dot" aria-hidden="true" /><b className="mono">{n}</b><span className="online-t">у програмі</span>
    </Link>
  );
}
