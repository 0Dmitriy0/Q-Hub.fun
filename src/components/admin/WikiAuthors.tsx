import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ROLES, ROLE_NAMES, adminError } from '../../lib/admin';
import AdminSection from './AdminSection';

/* автори довідника (specs/043 US4 AC3, FR-020): прийняті й відхилені правки по кожному, частка прийнятих —
   кандидати в editor чи moderator; роль змінюється тут же (admin_set_role, ті самі ролі конституції) */
type Row = { id: string; who: string; role: string; accepted: number; pages: number; rejected: number; pending: number };
type Raw = { author: string; status: string; kind: string; p: { name: string; nick: string | null; role: string } | null };

export function authorsOf(raw: Raw[]): Row[] {
  const m = new Map<string, Row>();
  for (const r of raw) {
    const a = m.get(r.author) ?? { id: r.author, who: r.p?.nick || r.p?.name || 'гравець', role: r.p?.role || 'user', accepted: 0, pages: 0, rejected: 0, pending: 0 };
    if (r.status === 'accepted' || r.status === 'accepted_edited') { if (r.kind === 'new') a.pages++; else a.accepted++; }
    else if (r.status === 'rejected') a.rejected++;
    else if (r.status === 'pending' || r.status === 'conflict') a.pending++;
    m.set(r.author, a);
  }
  return [...m.values()].sort((x, y) => (y.accepted + y.pages) - (x.accepted + x.pages) || share(y) - share(x));
}
export const share = (a: Row) => { const done = a.accepted + a.pages + a.rejected; return done ? Math.round((a.accepted + a.pages) * 100 / done) : 0; };

export default function WikiAuthors() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');
  async function load() {
    const { data, error } = await supabase!.from('wiki_proposals').select('author,status,kind,p:profiles!wiki_proposals_author_fkey(name,nick,role)').limit(5000);
    if (error) { setErr('Не вдалося завантажити авторів довідника — міграцію 0057 застосовано?'); return; }
    setErr(''); setRows(authorsOf(data as unknown as Raw[]));
  }
  useEffect(() => { load(); }, []);
  return (
    <AdminSection title="Автори довідника" error={err} onRetry={load} loading={!rows && !err}
      hint="Хто пропонує правки «Робіт» і «Транспорту»: більше прийнятих і мало відхилених — кандидат у модератори.">
      {rows && !rows.length && <p className="adm-empty">Пропозицій ще не було.</p>}
      {rows && rows.length > 0 && (
        <div className="scroll"><table className="t">
          <thead><tr><th>Гравець</th><th className="n">Прийнято правок</th><th className="n">Нових сторінок</th><th className="n">Відхилено</th><th className="n">Частка прийнятих</th><th className="n">Чекає</th><th>Роль</th></tr></thead>
          <tbody>{rows.map(a => <AuthorRow key={a.id} a={a} />)}</tbody>
        </table></div>
      )}
    </AdminSection>
  );
}

function AuthorRow({ a }: { a: Row }) {
  const [role, setRole] = useState(a.role);
  const [saved, setSaved] = useState(a.role);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  async function save() {
    if (role === saved || !window.confirm(`Видати ${a.who} роль «${ROLE_NAMES[role]}»?`)) { setRole(saved); return; }
    setBusy(true); setMsg('');
    const { error } = await supabase!.rpc('admin_set_role', { p_user: a.id, p_role: role });
    setBusy(false);
    if (error) { setMsg(adminError(error)); setRole(saved); return; }
    setSaved(role); setMsg('Роль змінено.');
  }
  return (
    <tr>
      <td><b>{a.who}</b></td>
      <td className="n">{a.accepted}</td><td className="n">{a.pages}</td><td className="n">{a.rejected}</td>
      <td className="n">{a.accepted + a.pages + a.rejected ? share(a) + '%' : '—'}</td><td className="n">{a.pending}</td>
      <td>
        <span className="row">
          <select aria-label={'Роль ' + a.who} value={role} disabled={busy} onChange={e => setRole(e.target.value)}>
            {ROLES.map(r => <option key={r} value={r}>{ROLE_NAMES[r]}</option>)}
          </select>
          {role !== saved && <button type="button" className="btn acc sm" disabled={busy} onClick={save}>Видати</button>}
        </span>
        {msg && <small className={msg === 'Роль змінено.' ? 'muted' : 'err'} role="status">{msg}</small>}
      </td>
    </tr>
  );
}
