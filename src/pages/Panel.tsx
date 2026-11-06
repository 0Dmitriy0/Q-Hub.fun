import type { ReactElement } from 'react';
import { Link, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import NotFound from './NotFound';
import PanelHome from '../components/panel/PanelHome';
import ReviewQueue from '../components/panel/ReviewQueue';
import MyDecisions from '../components/panel/MyDecisions';
import { Bans, Hidden } from '../components/panel/HiddenAndBans';

/* Панель помічників (specs/061): редактор — свої інструменти; модератор — ще й розбір пропозицій від гравців; власник — усе це.
   Гравцю й гостю — «Не знайдено». Це лише показ: кожне читання й дію перевіряє база */
export default function Panel() {
  const { ready, role } = useAuth();
  if (!ready) return null;
  if (role !== 'editor' && role !== 'moderator' && role !== 'admin') return <NotFound />;
  const canReview = role !== 'editor';
  const sub = (el: ReactElement) => (canReview ? el : <Navigate to="/panel" replace />);
  return (
    <div className="adm">
      <header className="pnl-head">
        <div>
          <h1>Панель</h1>
          <p className="muted">{canReview ? 'Розбір пропозицій від гравців і твої інструменти.' : 'Твої інструменти на сайті в одному місці.'}</p>
        </div>
        {role === 'admin' && <Link to="/admin" className="btn ghost sm">Адмінка</Link>}
      </header>
      {canReview && (
        <nav className="seg adm-tabs" aria-label="Розділи панелі">
          <NavLink to="/panel" end className={({ isActive }) => (isActive ? 'on' : '')}>Головна</NavLink>
          <NavLink to="/panel/rozbir" className={({ isActive }) => (isActive ? 'on' : '')}>Розбір</NavLink>
          <NavLink to="/panel/rishennia" className={({ isActive }) => (isActive ? 'on' : '')}>Мої рішення</NavLink>
          <NavLink to="/panel/prybrani" className={({ isActive }) => (isActive ? 'on' : '')}>Прибрані й заборони</NavLink>
        </nav>
      )}
      <Routes>
        <Route index element={<PanelHome canReview={canReview} />} />
        <Route path="rozbir" element={sub(<ReviewQueue inUrl />)} />
        <Route path="rishennia" element={sub(<MyDecisions />)} />
        <Route path="prybrani" element={sub(<><Hidden /><Bans /></>)} />
        <Route path="*" element={<Navigate to="/panel" replace />} />
      </Routes>
    </div>
  );
}
