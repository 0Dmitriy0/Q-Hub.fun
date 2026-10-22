import { Link, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import Dashboard from './Dashboard';
import LedgerPage from './LedgerPage';
import StockPage from './StockPage';
import DealsPage from './DealsPage';
import GaragePage from './GaragePage';
import Characters from './Characters';
import SettingsPage from './SettingsPage';
import Select from '../../components/Select';

const TABS: [string, string][] = [['', 'Дашборд'], ['oblik', 'Облік'], ['uhody', 'Угоди'], ['sklad', 'Склад'], ['harazh', 'Гараж'], ['nalashtuvannya', 'Налаштування']];

export default function Cabinet() {
  const { ready, session, signIn, signOut, characters, current, setCurrent, name, staticId, gameName } = useAuth();
  if (!supabase) return <div className="card empty">Кабінет запрацює після підключення Supabase (див. README).</div>;
  if (!ready) return <div className="card empty">Завантаження…</div>;
  if (!session) return (
    <section className="card hero">
      <h1>Кабінет</h1>
      <p className="muted">Облік, склад, гараж і угоди твого персонажа. Бачиш їх лише ти — це перевіряє сама база.</p>
      <div className="row"><button className="btn acc" onClick={signIn}>Увійти через Discord</button></div>
    </section>
  );
  return (
    <>
      <div className="row between">
        <div><span className="lbl">{name}{staticId ? <> · <b>{gameName}</b> <b className="mono">#{staticId}</b> <Link to="/kabinet/nalashtuvannya">змінити</Link></> : null}</span><h1>{current ? current.name : 'Кабінет'}</h1></div>
        <div className="row">
          {characters.length > 1 && (
            <label className="fld" style={{ minWidth: 200 }}><span>Персонаж</span>
              <Select value={current?.id || ''} onChange={setCurrent} options={characters.map(c => ({ value: c.id, label: c.name, icon: 'user' }))} />
            </label>)}
          <button className="btn ghost sm" onClick={signOut}>Вийти</button>
        </div>
      </div>
      <nav className="tabs" aria-label="Кабінет">{TABS.map(([p, l]) => <NavLink key={p} to={'/kabinet' + (p ? '/' + p : '')} end>{l}</NavLink>)}</nav>
      {!current ? <Characters first /> : (
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
      )}
    </>
  );
}
