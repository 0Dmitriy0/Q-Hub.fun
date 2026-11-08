import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { pageHref, SECTION_NAME } from '../../lib/wiki';
import { ACTION_LABEL, mergeDecisions, panelError, type Decision, type DecidedProposal, type MyVersion } from '../../lib/panel';
import AdminSection from '../admin/AdminSection';

/* «Мої рішення» (specs/061 US5): що я опублікував, відхилив, відкотив і повернув — з наявних пропозицій і версій */
const when = (s: string) => new Date(s).toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const href = (d: Decision) => (d.target_id ? pageHref(d.section, encodeURIComponent(d.target_id)) : '');

export default function MyDecisions() {
  const { session } = useAuth();
  const [list, setList] = useState<Decision[] | null>(null);
  const [err, setErr] = useState('');

  async function load() {
    const me = session?.user.id; if (!me) return;
    setErr('');
    const [p, v] = await Promise.all([
      supabase!.from('wiki_proposals').select('id,section,target_id,kind,status,reason,decided_at,version_id,data')
        .eq('decided_by', me).order('decided_at', { ascending: false }).limit(50),
      supabase!.from('wiki_versions').select('id,section,target_id,kind,note,created_at,data')
        .eq('decided_by', me).in('kind', ['revert', 'hide', 'unhide']).order('created_at', { ascending: false }).limit(50),
    ]);
    if (p.error || v.error) { setErr('Не вдалося завантажити. ' + panelError(p.error ?? v.error)); return; }
    type WithData = { data?: { name?: unknown } | null };
    const props = ((p.data ?? []) as (DecidedProposal & WithData)[]).map(r => ({ ...r, title: r.data?.name ? String(r.data.name) : '' }));
    const vers = ((v.data ?? []) as (MyVersion & WithData)[]).map(r => ({ ...r, title: r.data?.name ? String(r.data.name) : '' }));
    setList(mergeDecisions(props, vers));
  }
  useEffect(() => { load(); }, [session?.user.id]);

  return (
    <AdminSection title="Мої рішення" error={err} onRetry={load} loading={!list && !err}
      hint="Останні 50 твоїх рішень. Якщо помилився — відкрий картку й поверни потрібну версію в її історії.">
      {list && (list.length === 0 ? <p className="adm-empty">Ти ще нічого не розбирав.</p> : (
        <ul className="adm-list">{list.map((d, i) => (
          <li key={i} className="adm-row">
            <div className="adm-row-main">
              <b>{ACTION_LABEL[d.action]}{d.action === 'rejected' && d.reason ? ': ' + d.reason : ''}</b>
              <span className="muted">{when(d.at)} · {SECTION_NAME[d.section]}{d.title || d.target_id ? ' · ' : ''}
                {href(d) ? <a href={href(d)} target="_blank" rel="noopener noreferrer">{d.title || d.target_id}</a> : d.title || ''}
                {d.action !== 'rejected' && d.reason ? ' · ' + d.reason : ''}</span>
            </div>
          </li>))}
        </ul>
      ))}
    </AdminSection>
  );
}
