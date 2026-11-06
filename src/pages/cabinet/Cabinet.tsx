import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { canEdit, desktop } from '../../lib/app';
import Dashboard from './Dashboard';
import DocumentsPage from './DocumentsPage';
import Earnings from './Earnings';
import Characters from './Characters';
import SettingsPage from './SettingsPage';
import MyEdits, { unseenCount } from './MyEdits';
import { wikiReady } from '../../lib/jobsData';
import Select from '../../components/Select';
import Icon from '../../components/Icon';

/* довідник сайту — у програмі відкривається в браузері: [шлях, назва, що там, іконка] */
const SITE: [string, string, string, string][] = [
  ['/mapa', 'Мапа', 'Зони, скупники, привиди', 'map'], ['/tsiny', 'Ціни', 'Скупники й історія цін', 'tag'],
  ['/wiki/transport', 'Транспорт', 'Авто, мото, човни', 'car'], ['/wiki/roboty', 'Роботи', 'Заробіток і маршрути', 'jobs'],
];

/* [шлях, назва, підзаголовок, іконка] — у програмі це плитки, на сайті — вкладки. Облік, угоди, склад і гараж прибрано (specs/040) */
const TABS: [string, string, string, string][] = [
  ['', 'Дашборд', 'Документи, ціни й івенти', 'home'],
  ['dokumenty', 'Документи', 'Ліцензії й строки', 'book'],
  ['zarobitok', 'Заробіток', 'За годину й по днях', 'chart'],
  ['nalashtuvannya', 'Налаштування', 'Персонажі, нік і статік', 'user'],
  /* правки довідника (specs/043) — лише на сайті: програма в першій черзі не змінюється */
  ...(desktop ? [] : [['pravky', 'Мої правки', 'Пропозиції до довідника', 'tag'] as [string, string, string, string]]),
];

export default function Cabinet() {
  const { ready, session, signIn, signOut, characters, current, setCurrent, name, avatar, nick } = useAuth();
  const { pathname } = useLocation();
  /* значок нових рішень по своїх правках (FR-018) */
  const [unseen, setUnseen] = useState(0);
  const [wiki, setWiki] = useState(false);
  useEffect(() => { if (!desktop) wikiReady().then(setWiki); }, []);
  useEffect(() => { if (session && wiki) unseenCount().then(setUnseen); }, [session, wiki]);
  if (!supabase) return <div className="card empty">Кабінет запрацює після підключення Supabase (див. README).</div>;
  if (!ready) return <div className="card empty">Завантаження…</div>;
  if (!session) return (
    <div className="cab">
      <section className="wiki-hero">
        <div>
          <span className="h-pill"><span className="mdot" aria-hidden="true" />Особистий кабінет</span>
          <h1>Кабінет гравця</h1>
          <p className="muted">Документи з нагадуванням про строк, персонажі й нік у Q-Hub. Бачиш їх лише ти — це перевіряє сама база.</p>
          <div className="row"><button className="btn acc" onClick={signIn}><Icon name="user" />Увійти через Discord</button><Link className="btn ghost" to="/programa"><Icon name="download" />Програма Q-Hub</Link></div>
        </div>
      </section>
      <div className="h-cards">{TABS.slice(1).map(([, l, d, ico]) => <div key={l} className="card"><span className="ibub"><Icon name={ico} /></span><h3>{l}</h3><p className="muted">{d}</p></div>)}</div>
    </div>
  );

  const seg = pathname.split('/')[2] || '';
  const tab = TABS.find(t => t[0] === seg) ?? TABS[0];
  /* на сайті людину видно лише за ніком акаунта (specs/025 FR-011); поки ніка немає — ім'я Discord */
  const who = nick ? <b>{nick}</b> : <>{name}</>;
  const pick = characters.length > 1 && (
    <label className="fld" style={{ minWidth: 200 }}><span>Персонаж</span>
      <Select value={current?.id || ''} onChange={setCurrent} options={characters.map(c => ({ value: c.id, label: c.name, icon: 'user' }))} />
    </label>);
  /* персонажів можна створювати й видаляти й на сайті (рішення власника 2026-11-05); решта кабінету на сайті — лише перегляд */
  const body = seg === 'pravky' && !desktop ? <MyEdits onSeen={() => setUnseen(0)} /> : !current ? <Characters first /> : (<>
    {!canEdit && seg === 'nalashtuvannya' && <Characters />}
    {/* на сайті всі поля й кнопки кабінету вимкнено, форми додавання сховано (.ro у styles.css) */}
    <fieldset className={canEdit ? 'rw' : 'ro'} disabled={!canEdit}>
    <Routes>
      <Route index element={<Dashboard c={current} />} />
      {/* у програмі дашборд — окремою кнопкою плашки, головна лишається з плитками й довідником */}
      <Route path="dashbord" element={<Dashboard c={current} />} />
      {/* розділи, яких більше немає (specs/040), — на головну кабінету */}
      {['oblik', 'uhody', 'sklad', 'harazh'].map(p => <Route key={p} path={p} element={<Navigate to="/kabinet" replace />} />)}
      <Route path="dokumenty" element={<DocumentsPage c={current} />} />
      <Route path="zarobitok" element={<Earnings c={current} />} />
      <Route path="nalashtuvannya" element={<SettingsPage c={current} />} />
      <Route path="personazhi" element={<Navigate to="/kabinet/nalashtuvannya" replace />} />
    </Routes>
    </fieldset>
  </>);

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
          <span className="h-pill"><span className="mdot good" aria-hidden="true" />{who}{nick ? <> · <Link to="/kabinet/nalashtuvannya">змінити</Link></> : null}</span>
          <h1>{current ? current.name : 'Кабінет'}</h1>
          <p className="muted">{tab[2]}</p>
        </div>
        {avatar && <img className="cab-ava" src={avatar} alt="" width={72} height={72} />}
      </section>
      <nav className="wiki-tabs cab-tabs" aria-label="Кабінет">{TABS.filter(t => t[0] !== 'pravky' || wiki).map(([p, l, , ico]) => <NavLink key={p} to={'/kabinet' + (p ? '/' + p : '')} end><Icon name={ico} size={16} />{l}{p === 'pravky' && unseen > 0 && <span className="cnt" aria-label={`нових рішень: ${unseen}`}>{unseen}</span>}</NavLink>)}</nav>
      {!canEdit && (
        <p className="card note" role="note">Персонажів можна додавати й видаляти тут, у <Link to="/kabinet/nalashtuvannya">Налаштуваннях</Link>. Решта кабінету на сайті — лише для перегляду: документи змінюй у програмі Q-Hub для Windows.</p>
      )}
      {body}
    </div>
  );
}

/* кабінет у плашці: плитки розділів (відкритий — підсвічений), під ними розділ із заголовком; головна — лише плитки й довідник сайту */
function Deck({ tab, home, body }: { tab: [string, string, string, string]; home: boolean; body: ReactNode }) {
  return (
    <div className="deck">
      <nav className="dtiles" aria-label="Кабінет">{TABS.slice(1).map(([p, l, d, ico]) => (
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
