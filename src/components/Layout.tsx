import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import PAGES from '../data/pages.json';
import { Link, NavLink, Outlet, useLocation, useNavigationType } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { FAMILY, familyLink, useLinks } from '../lib/brand';
import ThemeToggle from './ThemeToggle';
import NickGate from './NickGate';
import Icon from './Icon';
import DiscordMenu from './DiscordMenu';
import NotificationBell from './NotificationBell';
import { reducedMotion, useViewNav } from '../lib/viewNav';

const NAV: [string, string, string][] = [
  ['/', 'Головна', 'home'], ['/tsiny', 'Скупник', 'buyer'], ['/wiki', 'WIKI', 'book'],
  ['/mapa', 'Мапа', 'map'], ['/programa', 'Програма', 'download']
];

/* що проявляється під час прокрутки (рух сайту, 2026-11): блоки головної, картки довідника й цін, кроки, пункти словника.
   Кожен — раз, коли вперше заходить на екран; зі «зменшеним рухом» нічого не ховається (styles.css, html.rv-on) */
const REVEAL = '.h-sec, .band, .h-two, .ix > li, .vgrid > *, .jgrid > *, .gd-grid > *, .ev-grid > *, .team-grid > li, .p-feat, .p-req-i, .start-list > li, .bp-leaders > *, .bp-bottom > *, .recent, .gloss-item, .wiki-tiles > *';

/* назва вкладки браузера й опис для пошуку кожного розділу — src/data/pages.json (спільний зі статичними сторінками для
   Google, scripts/static-pages.mjs); опису немає — загальний з index.html */
const TITLES: Record<string, string> = PAGES.titles;
const DESCRIPTIONS: Record<string, string> = PAGES.descriptions;
const BASE_DESCRIPTION = typeof document !== 'undefined' ? document.querySelector('meta[name="description"]')?.getAttribute('content') || '' : '';

export default function Layout() {
  const { session, name, avatar, signIn, role } = useAuth();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const navType = useNavigationType();
  /* нова адреса — з початку сторінки (раніше лишалась прокрутка попередньої: клік у футері відкривав розділ знизу).
     «Назад» у браузері (POP) і посилання на якір (#…) — не чіпаємо */
  useEffect(() => {
    if (navType !== 'POP' && !location.hash) window.scrollTo(0, 0);
  }, [pathname]);
  const section = pathname.split('/')[1] || '';
  /* перехід між розділами: нова сторінка проявляється з легким підйомом (200 мс) — видно, що розділ змінився.
     Через Web Animations, а не key: сторінка не монтується заново, а вміст видно й без анімації. Перший показ — без руху */
  const firstSection = useRef(true);
  useEffect(() => {
    if (firstSection.current) { firstSection.current = false; return; }
    /* зсув (transform) на мить робить main опорою для position: fixed — повноекранну мапу лише проявляємо */
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || !!mainRef.current?.querySelector('.mapfull');
    mainRef.current?.animate(reduce ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
      { duration: reduce ? 120 : 220, easing: 'cubic-bezier(.16, 1, .3, 1)' });
  }, [section]);
  const [{ family_url }] = useLinks();
  const family = familyLink(family_url);   // «by CORE» — завжди на Discord сім'ї
  const vnav = useViewNav();
  /* поява під час прокрутки: один спостерігач на весь main; нові картки (фільтр, «Показати ще») підхоплює MutationObserver.
     Позначки — data-атрибути, а не класи: React перезаписує className (відкрив пункт словника — клас змінився), а чужих data-* не чіпає */
  useEffect(() => {
    const root = mainRef.current;
    if (!root || reducedMotion() || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(es => {
      for (const e of es) if (e.isIntersecting) { (e.target as HTMLElement).dataset.in = '1'; io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    let raf = 0;
    const scan = () => {
      raf = 0;
      root.querySelectorAll<HTMLElement>(REVEAL).forEach(el => { if (!el.dataset.rv) { el.dataset.rv = '1'; io.observe(el); } });
    };
    /* те, що вже на екрані при першому показі, вважається показаним — нічого не блимає; ховається лише нижче екрана */
    root.querySelectorAll<HTMLElement>(REVEAL).forEach(el => { if (el.getBoundingClientRect().top < innerHeight) { el.dataset.in = '1'; el.dataset.rv = '1'; } });
    document.documentElement.classList.add('rv-on');
    scan();
    const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(scan); });
    mo.observe(root, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); cancelAnimationFrame(raf); };
  }, []);
  /* модератору — скільки пропозицій від гравців чекає (specs/061); оновлюється при переході між сторінками */
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    if (role !== 'moderator' || !supabase) { setWaiting(0); return; }
    supabase.from('wiki_proposals').select('id', { count: 'exact', head: true }).in('status', ['pending', 'conflict'])
      .then(({ count }) => setWaiting(count ?? 0));
  }, [role, pathname]);
  /* useLayoutEffect — раніше за звичайні ефекти сторінок: стаття (гайд, івент) ставить свою назву після цього, а не навпаки */
  useLayoutEffect(() => {
    const key = '/' + (pathname.split('/')[1] || '');
    document.title = key === '/' ? PAGES.home : (TITLES[pathname] || TITLES[key]) ? `${TITLES[pathname] || TITLES[key]} · Q-Hub` : 'Сторінки немає · Q-Hub';
    document.querySelector('meta[name="description"]')?.setAttribute('content', DESCRIPTIONS[pathname] || DESCRIPTIONS[key] || BASE_DESCRIPTION);
  }, [pathname]);
  return (
    <div className="app">
      <a className="skip" href="#main">До вмісту сторінки</a>
      <header className="top">
        <NavLink to="/" className="brand" aria-label="Q-Hub — головна"><img className="logo" src="/brand/q-hub-logo.svg?v=2" alt="" width={32} height={32} /><b>Q-Hub</b></NavLink>
        <nav className="nav" aria-label="Розділи">
          {/* риска активного розділу — окремий елемент: View Transitions переносить її на нову вкладку (src/lib/viewNav.ts) */}
          {NAV.map(([to, label, ico]) => <NavLink key={to} to={to} end={to === '/'} onClick={vnav(to)}>{({ isActive }) => <><Icon name={ico} size={16} />{label}{isActive && <span className="nav-line" aria-hidden="true" />}</>}</NavLink>)}
        </nav>
        <div className="who">
          <ThemeToggle />
          {role === 'admin' && <NavLink to="/admin" className="btn ghost sm" title="Адмін-панель для розробників"><Icon name="shield" size={18} /><span className="wide-only">Адмінка</span></NavLink>}
          {(role === 'moderator' || role === 'editor') && <NavLink to="/panel" className="btn ghost sm" title="Розбір пропозицій від гравців і твої інструменти"><Icon name="shield" size={18} /><span className="wide-only">{role === 'moderator' ? 'Модерація' : 'Інструменти'}</span>{waiting > 0 && <span className="nav-count" aria-label={`на розгляді: ${waiting}`}>{waiting}</span>}</NavLink>}
          <NotificationBell />
          {session
            ? <NavLink to="/kabinet" className="btn sm who-me">{avatar && <img src={avatar} alt="" width={26} height={26} />}<span className="who-name">{name || 'Кабінет'}</span></NavLink>
            : <button className="btn acc sm" onClick={signIn}>Увійти<span className="wide-only"> через Discord</span></button>}
        </div>
      </header>
      {/* сторінки, крім головної, вантажаться окремими файлами (App.tsx) — поки вантажиться, місце під сторінку тримаємо, щоб підвал не стрибав */}
      <main ref={mainRef} id="main" tabIndex={-1}><Suspense fallback={<div style={{ minHeight: "70vh" }} aria-busy="true" />}><Outlet /></Suspense></main>
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
      {/* телефон: розділи — нижнім меню під великим пальцем (на ширших екранах — у шапці) */}
      <nav className="tabbar" aria-label="Розділи">
        {NAV.map(([to, label, ico]) => <NavLink key={to} to={to} end={to === '/'} onClick={vnav(to)}>{({ isActive }) => <><Icon name={ico} size={22} />{label}{isActive && <span className="tab-line" aria-hidden="true" />}</>}</NavLink>)}
      </nav>
    </div>
  );
}
