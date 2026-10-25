import { useEffect, useState } from 'react';
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
import { useRows } from '../../lib/useRows';
import { balances } from '../../lib/ledger';
import { money } from '../../lib/format';
import type { Character, Tx } from './types';

/* низ бічного меню програми: гроші завжди перед очима і один вхід для будь-якого запису — плашка Alt+Q */
function DeskFoot({ c }: { c: Character | null }) {
  const { rows } = useRows<Tx>('transactions', c?.id);
  const [key, setKey] = useState('Alt+Q');
  useEffect(() => { desktop?.hotkey?.().then(k => k && setKey(k)); }, []);
  const b = c ? balances(c, rows) : null;
  return (
    <div className="dfoot">
      {b && <div className="dwallet" aria-label="Гроші персонажа">
        <div><small>Готівка</small><b className="mono">{money(b.cash)}</b></div>
        <div><small>Картка</small><b className="mono">{money(b.card)}</b></div>
      </div>}
      <button className="btn acc dadd" onClick={() => desktop?.openBar?.()}><Icon name="spark" size={16} />Швидкий запис<kbd>{key}</kbd></button>
    </div>
  );
}

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

  /* програма: бічне меню, заголовок розділу, гроші й «Швидкий запис» унизу меню — як у Quant Hub */
  if (desktop) return (
    <div className="desk">
      <aside className="dside">
        <div className="dbrand"><img className="logo" src="/brand/q-hub-logo.svg" alt="" width={36} height={36} /><div><b>Q-Hub</b><small>{current?.name || name}{gameName ? ' · QuantRP' : ''}</small></div></div>
        <nav className="dnav" aria-label="Кабінет">{TABS.map(([p, l, , ico]) => (
          <NavLink key={p} to={'/kabinet' + (p ? '/' + p : '')} end><Icon name={ico} size={18} />{l}</NavLink>))}
        </nav>
        <DeskFoot c={current} />
      </aside>
      <div className="dmain">
        <header className="dhead">
          <div><h1>{tab[1]}</h1><small>{tab[2]}</small></div>
          <div className="row">{pick}
            <div className="me">{avatar ? <img src={avatar} alt="" width={36} height={36} /> : <span className="logo" aria-hidden="true">{(gameName || name || 'Q')[0]}</span>}
              <div><b>{gameName || current?.name || name}</b><small>{staticId ? '#' + staticId + ' · ' : ''}{name}</small></div></div>
            <button className="btn ghost sm" onClick={signOut}>Вийти</button></div>
        </header>
        {body}
      </div>
    </div>
  );

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
