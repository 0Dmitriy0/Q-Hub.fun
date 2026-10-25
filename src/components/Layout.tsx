import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import ThemeToggle from './ThemeToggle';
import StaticGate from './StaticGate';
import Icon from './Icon';
import Backdrop from './Backdrop';
import AppOnline from './AppOnline';

const NAV: [string, string, string][] = [
  ['/', 'Головна', 'home'], ['/tsiny', 'Скупник', 'buyer'], ['/wiki', 'WIKI', 'book'],
  ['/mapa', 'Мапа', 'map'], ['/programa', 'Програма', 'download']
];

/* назва вкладки браузера для кожного розділу (у закладках і історії видно, що це за сторінка) */
const TITLES: Record<string, string> = {
  '/tsiny': 'Ціни скупників', '/wiki': 'WIKI', '/transport': 'Транспорт', '/roboty': 'Роботи', '/mapa': 'Мапа штату', '/programa': 'Програма поверх гри', '/kabinet': 'Кабінет',
};

export default function Layout() {
  const { session, name, avatar, signIn } = useAuth();
  const { pathname } = useLocation();
  /* меню на вузьких екранах: кнопка-«гамбургер» розгортає список розділів; закривається переходом або Esc */
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [pathname]);
  useEffect(() => {
    if (!menu) return;
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    addEventListener('keydown', f); return () => removeEventListener('keydown', f);
  }, [menu]);
  useEffect(() => {
    const key = '/' + (pathname.split('/')[1] || '');
    document.title = key === '/' ? 'Q-Hub — ціни, мапа й облік для QuantRP' : TITLES[key] ? `${TITLES[key]} · Q-Hub` : 'Сторінки немає · Q-Hub';
  }, [pathname]);
  return (
    <div className="app">
      <Backdrop />
      <header className={'top' + (menu ? ' menu-open' : '')}>
        <NavLink to="/" className="brand" aria-label="Q-Hub — головна"><img className="logo" src="/brand/q-hub-logo.svg" alt="" width={36} height={36} /><b>Q-Hub</b></NavLink>
        <nav className="nav" id="site-nav" aria-label="Розділи">
          {NAV.map(([to, label, ico]) => <NavLink key={to} to={to} end={to === '/'}><Icon name={ico} size={16} />{label}</NavLink>)}
        </nav>
        <button type="button" className="burger" aria-expanded={menu} aria-controls="site-nav" aria-label={menu ? 'Закрити меню' : 'Відкрити меню'} onClick={() => setMenu(v => !v)}>
          <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
        </button>
        <div className="who">
          <AppOnline />
          <ThemeToggle />
          {session
            ? <NavLink to="/kabinet" className="btn acc sm">{avatar && <img src={avatar} alt="" width={22} height={22} style={{ width: 22, height: 22 }} />}{name || 'Кабінет'}</NavLink>
            : <button className="btn acc sm" onClick={signIn}>Увійти через Discord</button>}
        </div>
      </header>
      <main><Outlet /></main>
      <StaticGate />
      <footer className="foot">
        <div className="foot-in">
          <div className="foot-top">
            <div className="foot-about">
              <Link to="/" className="brand" aria-label="Q-Hub — головна"><img className="logo" src="/brand/q-hub-logo.svg" alt="" width={32} height={32} /><b>Q-Hub</b></Link>
              <p>Q-Hub — фан-проєкт гравців, не пов'язаний з адміністрацією QuantRP. Ціни вносять гравці й перевіряють одне одного. Усі торгові марки й назви належать їхнім правовласникам.</p>
            </div>
            <Link className="btn ghost" to="/programa"><Icon name="download" />Програма поверх гри</Link>
          </div>
          <div className="foot-bot">
            <nav className="foot-nav" aria-label="Розділи сайту">{NAV.map(([to, label]) => <Link key={to} to={to}>{label}</Link>)}<Link to="/kabinet">Кабінет</Link></nav>
            <small className="mono">© {new Date().getFullYear()} Q-Hub</small>
          </div>
        </div>
      </footer>
    </div>
  );
}
