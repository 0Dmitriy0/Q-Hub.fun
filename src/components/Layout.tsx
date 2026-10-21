import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import ThemeToggle from './ThemeToggle';
import StaticGate from './StaticGate';
import Icon from './Icon';
import Backdrop from './Backdrop';

const NAV: [string, string, string][] = [
  ['/', 'Головна', 'home'], ['/tsiny', 'Скупник', 'buyer'], ['/transport', 'Транспорт', 'car'],
  ['/roboty', 'Роботи', 'jobs'], ['/mapa', 'Мапа', 'map'], ['/programa', 'Програма', 'download']
];

export default function Layout() {
  const { session, name, avatar, signIn } = useAuth();
  return (
    <div className="app">
      <Backdrop />
      <header className="top">
        <NavLink to="/" className="brand" aria-label="Q-Hub — головна"><span className="logo" aria-hidden="true">Q</span><b>Q-Hub</b></NavLink>
        <nav className="nav" aria-label="Розділи">
          {NAV.map(([to, label, ico]) => <NavLink key={to} to={to} end={to === '/'}><Icon name={ico} size={16} />{label}</NavLink>)}
        </nav>
        <div className="who">
          <ThemeToggle />
          {session
            ? <NavLink to="/kabinet" className="btn acc sm">{avatar && <img src={avatar} alt="" width={22} height={22} style={{ width: 22, height: 22 }} />}{name || 'Кабінет'}</NavLink>
            : <button className="btn acc sm" onClick={signIn}>Увійти через Discord</button>}
        </div>
      </header>
      <main><Outlet /></main>
      <StaticGate />
      <footer className="foot">Q-Hub — фан-проєкт гравців, не пов'язаний з адміністрацією QuantRP. Ціни вносять гравці й перевіряють одне одного.</footer>
    </div>
  );
}
