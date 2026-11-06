import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { SECTION_NAME, SOURCES } from '../../lib/wiki';
import { age, asFilter, FILTERS, KIND_LABEL, KIND_ONE, matches, nextProposal, panelError, taskKind, type QueueFilter } from '../../lib/panel';
import AdminSection from '../admin/AdminSection';
import ProposalView, { authorName, type Outcome, type Proposal } from './ProposalView';

/* черга пропозицій довідника (specs/061 US1–US2): список ліворуч, відкрита пропозиція праворуч (на телефоні — по черзі).
   Після рішення відкривається наступна в тому самому фільтрі. В панелі фільтр і відкрита пропозиція — в адресі (?f=, ?id=),
   у вкладці «Довідник» адмінки — локально (там адресу займає ?tab=) */
const SHOW = 50;

export default function ReviewQueue({ inUrl = false, onBanned }: { inUrl?: boolean; onBanned?: () => void }) {
  const [params, setParams] = useSearchParams();
  const [lf, setLf] = useState<QueueFilter>('all'); const [lid, setLid] = useState('');
  const filter = inUrl ? asFilter(params.get('f')) : lf;
  const openId = inUrl ? params.get('id') || '' : lid;
  const go = (f: QueueFilter, id: string) => {
    if (!inUrl) { setLf(f); setLid(id); return; }
    const n: Record<string, string> = {};
    if (f !== 'all') n.f = f;
    if (id) n.id = id;
    setParams(n, { replace: true });
  };

  const [list, setList] = useState<Proposal[] | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState(''); const [good, setGood] = useState(true);

  async function load(): Promise<Proposal[] | null> {
    setErr('');
    const { data, error } = await supabase!.from('wiki_proposals')
      .select('*, who:profiles!wiki_proposals_author_fkey(name,nick)').in('status', ['pending', 'conflict']).order('created_at').limit(300);
    if (error) { setErr('Не вдалося завантажити чергу. ' + panelError(error)); return null; }
    const rows = data as unknown as Proposal[];
    setList(rows); return rows;
  }
  useEffect(() => { load(); }, []);

  async function decided(o: Outcome, text?: string) {
    const before = list ?? [];
    const next = nextProposal(before, openId, filter);
    const fresh = await load();
    const left = (fresh ?? before.filter(p => p.id !== openId)).filter(p => matches(filter, p)).length;
    const stillThere = next && (fresh ?? before).some(p => p.id === next.id) ? next.id : '';
    setGood(o !== 'gone');
    setMsg(o === 'gone' ? (text ?? '') : `${o === 'accepted' ? 'Опубліковано' : 'Відхилено'}. ${left ? `Залишилось: ${left}.` : 'Усе розібрано.'}`);
    go(filter, stillThere);
  }

  const all = list ?? [];
  const shown = all.filter(p => matches(filter, p));
  const open = shown.find(p => p.id === openId) ?? all.find(p => p.id === openId) ?? null;
  const count = (f: QueueFilter) => all.filter(p => matches(f, p)).length;
  const tabs = FILTERS.filter(f => f === 'all' || f === filter || count(f) > 0);

  return (
    <AdminSection title="Пропозиції від гравців" error={err} onRetry={load} loading={!list && !err}
      hint="Гравці пропонують правки до робіт, транспорту й міток мапи. Поки ти не опублікуєш, на сайті нічого не змінюється.">
      <div className={'rq' + (open ? ' has-open' : '')}>
        <div className="rq-list">
          <div className="rq-filt" role="tablist" aria-label="Що показати">
            {tabs.map(f => (
              <button key={f} type="button" role="tab" aria-selected={filter === f} className={'btn ghost sm' + (filter === f ? ' on' : '')} onClick={() => go(f, '')}>
                {f === 'all' ? 'Усі' : f === 'conflict' ? 'Конфлікти' : KIND_LABEL[f]} · {count(f)}
              </button>))}
          </div>
          {msg && !open && <p className={good ? 'good' : 'err'} role="status">{msg}</p>}
          {shown.length === 0 ? (
            <p className="adm-empty">{all.length === 0 ? 'Усе розібрано. Нових пропозицій немає.' : 'У цьому виді нічого немає.'}
              {inUrl && all.length === 0 && <> <Link to="/panel">На головну панелі</Link></>}</p>
          ) : (
            <ul className="adm-list">
              {shown.slice(0, SHOW).map(p => (
                <li key={p.id} className={'adm-row rq-row' + (p.id === openId ? ' on' : '')}>
                  <button type="button" className="rq-pick" aria-current={p.id === openId || undefined} onClick={() => { setMsg(''); go(filter, p.id); }}>
                    <b>{SECTION_NAME[p.section]} · {KIND_ONE[taskKind(p)]}{p.kind === 'new' && p.data.name ? ': ' + String(p.data.name) : ''}</b>
                    <span className="muted">{authorName(p)} · {age(p.created_at)} · {SOURCES.find(s => s[0] === p.source)?.[1]}{p.proof_path ? ' · є скрін' : ''}</span>
                    {p.status === 'conflict' && <span className="pill warn">Конфлікт</span>}
                  </button>
                </li>))}
            </ul>
          )}
          {shown.length > SHOW && <p className="muted">Ще {shown.length - SHOW} — з'являться, коли розбереш ці.</p>}
        </div>
        <div className="rq-open">
          {msg && open && <p className={good ? 'good' : 'err'} role="status">{msg}</p>}
          {open ? <ProposalView key={open.id} p={open} onDecided={decided} onBanned={onBanned} onClose={() => { setMsg(''); go(filter, ''); }} />
            : shown.length > 0 && <p className="muted rq-hint">Вибери пропозицію зі списку.</p>}
        </div>
      </div>
    </AdminSection>
  );
}
