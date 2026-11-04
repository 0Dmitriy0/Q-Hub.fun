import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { ROLES, ROLE_NAMES, adminError, day, when } from '../../lib/admin';
import AdminSection from './AdminSection';

/* Гравці й ролі (specs/039 US2): одразу всі акаунти сайту, новіші першими, порціями по 50 (0047 admin_accounts);
   рядок пошуку фільтрує за ніком чи Discord. Персонажі — лише ім'я й статік. Свою роль admin і роль останнього admin
   база зняти не дасть (0046 admin_set_role) */
type Account = { id: string; nick: string | null; name: string; avatar_url: string | null; role: string; created_at: string;
  last_seen: string | null; version: string | null; characters: { name: string; static_id: number | null }[]; total?: number };
const PAGE = 50;

export default function AdminAccounts() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Account[] | null>(null);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const page = async (s: string, offset: number) => {
    setBusy(true);
    const { data, error } = await supabase!.rpc('admin_accounts', { q: s, p_offset: offset, p_limit: PAGE });
    setBusy(false);
    if (error) { setErr(adminError(error)); return; }
    const got = (data || []) as Account[];
    setErr(''); setTotal(Number(got[0]?.total ?? (offset ? total : 0)));
    setRows(rs => (offset ? [...(rs || []), ...got] : got));
  };
  /* порожній рядок — одразу всі; пишеш — фільтр з паузою 300 мс */
  useEffect(() => {
    const s = q.trim();
    const t = setTimeout(() => { page(s, 0); }, s ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, tick]);   // eslint-disable-line react-hooks/exhaustive-deps

  const s = q.trim();
  return (
    <AdminSection title="Гравці й ролі" error={err} onRetry={() => setTick(t => t + 1)}
      actions={rows && <span className="pill">{s ? `Знайдено: ${total}` : `Усього акаунтів: ${total}`}</span>}
      hint="Усі, хто входив на сайт через Discord, — новіші першими. Особисті дані персонажів тут не показуються — лише хто це й яка роль.">
      <label className="fld adm-search">Фільтр: нік чи Discord
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="наприклад, D_VYRX" autoFocus />
      </label>
      {busy && !rows && <p className="muted adm-loading">Вантажу…</p>}
      {rows && !rows.length && !busy && <p className="adm-empty">{s ? `Нікого не знайдено за «${s}».` : 'Акаунтів ще немає.'}</p>}
      {rows && rows.length > 0 && (
        <ul className="adm-cards">
          {rows.map(a => <AccountCard key={a.id} a={a} onRole={role => setRows(rs => rs!.map(x => (x.id === a.id ? { ...x, role } : x)))} />)}
        </ul>
      )}
      {rows && rows.length < total && (
        <button type="button" className="btn ghost" disabled={busy} onClick={() => page(s, rows.length)}>
          {busy ? 'Вантажу…' : `Показати ще (${rows.length} з ${total})`}
        </button>
      )}
    </AdminSection>
  );
}

function AccountCard({ a, onRole }: { a: Account; onRole: (role: string) => void }) {
  const { session } = useAuth();
  const [role, setRole] = useState(a.role);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const who = a.nick || a.name;
  const me = session?.user.id === a.id;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (role === a.role) return;
    if (!window.confirm(`Видати ${who} роль «${ROLE_NAMES[role]}»?`)) return;
    setBusy(true); setMsg('');
    const { error } = await supabase!.rpc('admin_set_role', { p_user: a.id, p_role: role });
    setBusy(false);
    if (error) { setMsg(adminError(error)); setRole(a.role); return; }
    setMsg('Роль змінено.'); onRole(role);
  }
  return (
    <li className="adm-card">
      <div className="adm-who">
        {a.avatar_url ? <img src={a.avatar_url} alt="" width={40} height={40} /> : <span className="adm-ava" aria-hidden="true">{(who[0] || '?').toUpperCase()}</span>}
        <div>
          <b>{who}{me && <span className="muted"> · це ти</span>}</b>
          <span className="muted">Discord: {a.name || '—'} · з {day(a.created_at)}</span>
          <span className="muted">У програмі: {a.last_seen ? `${when(a.last_seen)}${a.version ? ' · v' + a.version : ' · стара версія'}` : 'ще не був'}</span>
        </div>
        <span className={'pill' + (a.role === 'admin' ? ' warn' : a.role === 'user' ? '' : ' good')}>{ROLE_NAMES[a.role] || a.role}</span>
      </div>
      {a.characters.length > 0
        ? <ul className="adm-chars">{a.characters.map(c => <li key={c.name}>{c.name}{c.static_id ? <span className="mono muted"> #{c.static_id}</span> : <span className="muted"> · без статіку</span>}</li>)}</ul>
        : <p className="muted">Персонажів ще немає.</p>}
      <form className="adm-form-row" onSubmit={save}>
        <label className="fld">Роль
          <select value={role} onChange={e => setRole(e.target.value)} disabled={busy}>
            {ROLES.map(r => <option key={r} value={r}>{ROLE_NAMES[r]}</option>)}
          </select>
        </label>
        <button className="btn acc sm" disabled={busy || role === a.role}>Видати роль</button>
      </form>
      {msg && <p className={msg === 'Роль змінено.' ? 'muted' : 'err'} role="status">{msg}</p>}
    </li>
  );
}
