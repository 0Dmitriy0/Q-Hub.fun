import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { ROLES, ROLE_NAMES, adminError, day, when } from '../../lib/admin';
import AdminSection from './AdminSection';

/* Гравці й ролі (specs/039 US2): пошук за ніком чи Discord, персонажі (лише ім'я й статік), зміна ролі.
   Свою роль admin і роль останнього admin база зняти не дасть (0046 admin_set_role) */
type Account = { id: string; nick: string | null; name: string; avatar_url: string | null; role: string; created_at: string;
  last_seen: string | null; version: string | null; characters: { name: string; static_id: number | null }[] };

export default function AdminAccounts() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Account[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) { setRows(null); setErr(''); return; }
    setBusy(true);
    const t = setTimeout(() => {
      supabase!.rpc('admin_find_accounts', { q: s }).then(({ data, error }) => {
        setBusy(false);
        if (error) { setErr(adminError(error)); setRows(null); } else { setErr(''); setRows((data || []) as Account[]); }
      });
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <AdminSection title="Гравці й ролі" error={err}
      hint="Знайди акаунт за ніком у Q-Hub чи іменем у Discord. Особисті дані персонажів тут не показуються — лише хто це й яка роль.">
      <label className="fld adm-search">Нік чи Discord (від 2 символів)
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="наприклад, D_VYRX" autoFocus />
      </label>
      {busy && <p className="muted adm-loading">Шукаю…</p>}
      {!busy && rows && !rows.length && <p className="adm-empty">Нікого не знайдено за «{q.trim()}».</p>}
      {!busy && rows && rows.length > 0 && (
        <ul className="adm-cards">
          {rows.map(a => <AccountCard key={a.id} a={a} onRole={role => setRows(rs => rs!.map(x => (x.id === a.id ? { ...x, role } : x)))} />)}
        </ul>
      )}
      {!busy && rows?.length === 20 && <p className="muted">Показано перші 20 — уточни запит.</p>}
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
