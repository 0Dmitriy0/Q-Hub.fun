import { Link } from 'react-router-dom';
export default function NotFound() {
  return <div className="card empty"><h1>Сторінки немає</h1><p>Можливо, посилання застаріло.</p><p><Link to="/">На головну</Link></p></div>;
}
