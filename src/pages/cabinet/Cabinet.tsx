import type { ReactNode } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { canEdit, desktop } from '../../lib/app';
import Dashboard from './Dashboard';
import LedgerPage from './LedgerPage';
import StockPage from './StockPage';
import DealsPage from './DealsPage';
import GaragePage from './GaragePage';
import Characters from './Characters';
import SettingsPage from './SettingsPage';
import Select from '../../components/Select';
import Icon from '../../components/Icon';

/* довідник сайту — у програмі відкривається в браузері: [шлях, назва, що там, іконка] */
const SITE: [string, string, string, string][] = [
  ['/mapa', 'Мапа', 'Зони, скупники, привиди', 'map'], ['/tsiny', 'Ціни', 'Скупники й історія цін', 'tag'],
  ['/wiki/transport', 'Транспорт', 'Авто, мото, човни', 'car'], ['/wiki/roboty', 'Роботи', 'Заробіток і маршрути', 'jobs'],
];

/* [шлях, назва, підзаголовок, іконка] — у програмі це бічне меню, як у Quant Hub; на сайті — вкладки */
const TABS: [string, string, string, string][] = [
  ['', 'Дашборд', 'Що вигідно зараз', 'home'],
  ['sklad', 'Склад', 'Що лежить і скільки коштує', 'box'], ['harazh', 'Гараж', 'Авто, тюнінг і фото', 'car'],
  ['oblik', 'Облік', 'Баланс, графік, підсумки', 'chart'], ['uhody', 'Угоди', 'Купив, нафармив, продав', 'coin'],
  ['nalashtuvannya', 'Налаштування', 'Персонажі, нік і статік', 'user'],
];

export default function Cabinet() {
  const { ready, session, signIn, signOut, characters, current, setCurrent, name, avatar, staticId, gameName } = useAuth();
  const { pathname } = useLocation();
  if (!supabase) return <div className="card empty">Кабінет запрацює після підключення Supabase (див. README).</div>;
  if (!ready) return <div className="card empty">Завантаження…</div>;
  if (!session) return (
    <div className="cab">
      <section className="wiki-hero">
        <div>
          <span className="h-pill"><span className="mdot" aria-hidden="true" />Особистий кабінет</span>
          <h1>Кабінет гравця</h1>
          <p className="muted">Облік, склад, гараж і угоди твого персонажа. Бачиш їх лише ти — це перевіряє сама база.</p>
          <div className="row"><button className="btn acc" onClick={signIn}><Icon name="user" />Увійти через Discord</button><Link className="btn ghost" to="/programa"><Icon name="download" />Програма для запису</Link></div>
        </div>
      </section>
      <div className="h-cards">{TABS.slice(1, 5).map(([, l, d, ico]) => <div key={l} className="card"><span className="ibub"><Icon name={ico} /></span><h3>{l}</h3><p className="muted">{d}</p></div>)}</div>
    </div>
  );

  const seg = pathname.split('/')[2] || '';
  const tab = TABS.find(t => t[0] === seg) ?? TABS[0];
  const who = <>{name}{staticId ? <> · <b>{gameName}</b> <b className="mono">#{staticId}</b></> : null}</>;
  const pick = characters.length > 1 && (
    <label className="fld" style={{ minWidth: 200 }}><span>Персонаж</span>
      <Select value={current?.id || ''} onChange={setCurrent} options={characters.map(c => ({ value: c.id, label: c.name, icon: 'user' }))} />
    </label>);
  const body = !current ? (canEdit ? <Characters first /> : <div className="card empty">Персонажів ще немає. Додай першого в програмі Q-Hub.</div>) : (
    /* на сайті всі поля й кнопки кабінету вимкнено, форми додавання сховано (.ro у styles.css) */
    <fieldset className={canEdit ? 'rw' : 'ro'} disabled={!canEdit}>
    <Routes>
      <Route index element={<Dashboard c={current} />} />
      {/* у програмі дашборд — окремою кнопкою плашки, головна лишається з плитками й довідником */}
      <Route path="dashbord" element={<Dashboard c={current} />} />
      <Route path="oblik" element={<LedgerPage c={current} />} />
      <Route path="uhody" element={<DealsPage c={current} />} />
      <Route path="sklad" element={<StockPage c={current} />} />
      <Route path="harazh" element={<GaragePage c={current} />} />
      <Route path="nalashtuvannya" element={<SettingsPage c={current} />} />
      <Route path="personazhi" element={<Navigate to="/kabinet/nalashtuvannya" replace />} />
      <Route path="import" element={<Navigate to="/kabinet/nalashtuvannya" replace />} />
    </Routes>
    </fieldset>
  );

  /* програма: кабінет — головна плашки Alt+Q (рядок пошуку, персонаж і кнопки — у самій плашці, src/desktop/Bar.tsx) */
  if (desktop) return <Deck tab={tab} home={seg === ''} body={body} />;

  /* сайт: шапка й вкладки в стилі WIKI (src/pages/Wiki.tsx), під ними — розділ кабінету */
  return (
    <div className="cab">
      <div className="wiki-top">
        <nav className="wiki-crumbs mono" aria-label="Де ти зараз"><Link to="/">Q-Hub</Link><span aria-hidden="true">/</span><Link to="/kabinet">Кабінет</Link><span aria-hidden="true">/</span><span aria-current="page">{tab[1]}</span></nav>
        <div className="row">{pick}<button className="btn ghost sm" onClick={signOut}>Вийти</button></div>
      </div>
      <section className="wiki-hero cab-hero">
        <div>
          <span className="h-pill"><span className="mdot good" aria-hidden="true" />{who}{staticId ? <> · <Link to="/kabinet/nalashtuvannya">змінити</Link></> : null}</span>
          <h1>{current ? current.name : 'Кабінет'}</h1>
          <p className="muted">{tab[2]}</p>
        </div>
        {avatar && <img className="cab-ava" src={avatar} alt="" width={72} height={72} />}
      </section>
      <nav className="wiki-tabs cab-tabs" aria-label="Кабінет">{TABS.map(([p, l, , ico]) => <NavLink key={p} to={'/kabinet' + (p ? '/' + p : '')} end><Icon name={ico} size={16} />{l}</NavLink>)}</nav>
      {!canEdit && (
        <p className="card note" role="note">Тут — лише перегляд статистики. Записувати угоди, облік, склад і гараж — у програмі Q-Hub для Windows.</p>
      )}
      {body}
    </div>
  );
}

/* кабінет у плашці: плитки розділів (відкритий — підсвічений), під ними розділ із заголовком; головна — лише плитки й довідник сайту */
function Deck({ tab, home, body }: { tab: [string, string, string, string]; home: boolean; body: ReactNode }) {
  return (
    <div className="deck">
      <nav className="dtiles" aria-label="Кабінет">{TABS.slice(1, 5).map(([p, l, d, ico]) => (
        <NavLink key={p} to={'/kabinet/' + p}><span className="dbub"><Icon name={ico} /></span><span><b>{l}</b><small>{d}</small></span><Icon name="chev" className="tr dgo" size={16} /></NavLink>))}
      </nav>
      {!home && <><div className="dtitle"><h1>{tab[1]}</h1><small>{tab[2]}</small></div>{body}</>}
      {home && <>
        <h2 className="dsect">Довідник на сайті</h2>
        <div className="dsite">{SITE.map(([p, l, d, ico]) => (
          <button key={p} onClick={() => desktop?.site?.(p)}><span className="dbub"><Icon name={ico} /></span><b>{l}</b><small>{d}</small></button>))}
        </div>
      </>}
    </div>
  );
}
