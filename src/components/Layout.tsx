import { Suspense, useEffect, useLayoutEffect, useState } from 'react';
import PAGES from '../data/pages.json';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { FAMILY, familyLink, useLinks } from '../lib/brand';
import ThemeToggle from './ThemeToggle';
import NickGate from './NickGate';
import Icon from './Icon';
import Backdrop from './Backdrop';
import DiscordMenu from './DiscordMenu';

const NAV: [string, string, string][] = [
  ['/', 'Головна', 'home'], ['/tsiny', 'Скупник', 'buyer'], ['/wiki', 'WIKI', 'book'],
  ['/mapa', 'Мапа', 'map'], ['/programa', 'Програма', 'download']
];

/* назва вкладки браузера й опис для пошуку кожного розділу — src/data/pages.json (спільний зі статичними сторінками для
   Google, scripts/static-pages.mjs); опису немає — загальний з index.html */
const TITLES: Record<string, string> = PAGES.titles;
const DESCRIPTIONS: Record<string, string> = PAGES.descriptions;
const BASE_DESCRIPTION = typeof document !== 'undefined' ? document.querySelector('meta[name="description"]')?.getAttribute('content') || '' : '';

export default function Layout() {
  const { session, name, avatar, signIn, role } = useAuth();
  const { pathname } = useLocation();
  /* меню на вузьких екранах: кнопка-«гамбургер» розгортає список розділів; закривається переходом або Esc */
  const [menu, setMenu] = useState(false);
  const [{ family_url }] = useLinks();
  const family = familyLink(family_url);   // «by CORE» — завжди на Discord сім'ї
  useEffect(() => setMenu(false), [pathname]);
  /* модератору — скільки пропозицій від гравців чекає (specs/061); оновлюється при переході між сторінками */
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    if (role !== 'moderator' || !supabase) { setWaiting(0); return; }
    supabase.from('wiki_proposals').select('id', { count: 'exact', head: true }).in('status', ['pending', 'conflict'])
      .then(({ count }) => setWaiting(count ?? 0));
  }, [role, pathname]);
  useEffect(() => {
    if (!menu) return;
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    addEventListener('keydown', f); return () => removeEventListener('keydown', f);
  }, [menu]);
  /* useLayoutEffect — раніше за звичайні ефекти сторінок: стаття (гайд, івент) ставить свою назву після цього, а не навпаки */
  useLayoutEffect(() => {
    const key = '/' + (pathname.split('/')[1] || '');
    document.title = key === '/' ? PAGES.home : (TITLES[pathname] || TITLES[key]) ? `${TITLES[pathname] || TITLES[key]} · Q-Hub` : 'Сторінки немає · Q-Hub';
    document.querySelector('meta[name="description"]')?.setAttribute('content', DESCRIPTIONS[pathname] || DESCRIPTIONS[key] || BASE_DESCRIPTION);
  }, [pathname]);
  return (
    <div className="app">
      <Backdrop />
      <header className={'top' + (menu ? ' menu-open' : '')}>
        <NavLink to="/" className="brand" aria-label="Q-Hub — головна"><img className="logo" src="/brand/q-hub-logo.svg?v=2" alt="" width={36} height={36} /><b>Q-Hub</b></NavLink>
        <nav className="nav" id="site-nav" aria-label="Розділи">
          {NAV.map(([to, label, ico]) => <NavLink key={to} to={to} end={to === '/'}><Icon name={ico} size={16} />{label}</NavLink>)}
        </nav>
        <button type="button" className="burger" aria-expanded={menu} aria-controls="site-nav" aria-label={menu ? 'Закрити меню' : 'Відкрити меню'} onClick={() => setMenu(v => !v)}>
          <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
        </button>
        <div className="who">
          <ThemeToggle />
          {role === 'admin' && <NavLink to="/admin" className="btn ghost sm" title="Адмін-панель для розробників"><Icon name="shield" size={16} />Адмінка</NavLink>}
          {(role === 'moderator' || role === 'editor') && <NavLink to="/panel" className="btn ghost sm" title="Панель помічника: розбір пропозицій і твої інструменти"><Icon name="shield" size={16} />Панель{waiting > 0 && <span className="nav-count" aria-label={`на розгляді: ${waiting}`}>{waiting}</span>}</NavLink>}
          {session
            ? <NavLink to="/kabinet" className="btn acc sm">{avatar && <img src={avatar} alt="" width={22} height={22} style={{ width: 22, height: 22 }} />}{name || 'Кабінет'}</NavLink>
            : <button className="btn acc sm" onClick={signIn}>Увійти через Discord</button>}
        </div>
      </header>
      {/* сторінки, крім головної, вантажаться окремими файлами (App.tsx) — поки вантажиться, місце під сторінку тримаємо, щоб підвал не стрибав */}
      <main><Suspense fallback={<div style={{ minHeight: "70vh" }} aria-busy="true" />}><Outlet /></Suspense></main>
      <NickGate />
      <footer className="foot">
        <div className="foot-in">
          <div className="foot-top">
            <div className="foot-about">
              <div className="foot-brand">
                <Link to="/" className="brand" aria-label="Q-Hub — головна"><img className="logo" src="/brand/q-hub-logo.svg?v=2" alt="" width={32} height={32} /><b>Q-Hub</b></Link>
                {/* підпис авторів (specs/033): веде на Discord сім'ї, якщо адмін його задав (0048), інакше — просто текст */}
                {family ? <a className="foot-by" href={family} target="_blank" rel="noreferrer" title={`Discord сім'ї ${FAMILY}`}>by {FAMILY}</a> : <span className="foot-by">by {FAMILY}</span>}
              </div>
              <p>Q-Hub — фан-проєкт гравців сім'ї {FAMILY} на QuantRP, не пов'язаний з адміністрацією сервера. Ціни вносять гравці й перевіряють одне одного. Усі торгові марки й назви належать їхнім правовласникам.</p>
            </div>
            <div className="foot-act">
              {/* три сервери Discord — одним меню (макет власника 2026-11-03) */}
              <DiscordMenu />
              <Link className="btn ghost" to="/programa"><Icon name="download" />Програма поверх гри</Link>
            </div>
          </div>
          <div className="foot-bot">
            <nav className="foot-nav" aria-label="Розділи сайту">{NAV.map(([to, label]) => <Link key={to} to={to}>{label}</Link>)}<Link to="/kabinet">Кабінет</Link></nav>
            <small className="mono">© {new Date().getFullYear()} Q-Hub · зроблено сім'єю {FAMILY}</small>
          </div>
        </div>
      </footer>
    </div>
  );
}
