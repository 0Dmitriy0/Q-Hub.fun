import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import NotFound from './NotFound';
import AdminOverview, { type AdminCounts } from '../components/admin/AdminOverview';
import AdminQueues from '../components/admin/AdminQueues';
import AdminAccounts from '../components/admin/AdminAccounts';
import WikiAuthors from '../components/admin/WikiAuthors';
import AdminAppState from '../components/admin/AdminAppState';
import AdminShots from '../components/admin/AdminShots';
import AdminLinks from '../components/admin/AdminLinks';
import AdminDiscordBot from '../components/admin/AdminDiscordBot';
import AdminNews from '../components/admin/AdminNews';
import AdminWiki from '../components/admin/AdminWiki';
import Icon from '../components/Icon';

/* Адмін-панель для розробників (specs/039): лише роль admin — решта (і гість) бачить звичайне «Не знайдено» (FR-001).
   Модератор сюди не потрапляє — його переводить на свою панель /panel (specs/061).
   Навігація — бічне меню з групами й «Огляд» першим екраном (2026-11-06, рішення власника): що чекає, з посиланнями.
   Це лише показ: кожне читання й дію перевіряє база (0046, конституція II) */
type Tab = 'overview' | 'queues' | 'wiki' | 'news' | 'accounts' | 'app' | 'shots' | 'discord' | 'links';
const GROUPS: { title: string; items: [Tab, string, string][] }[] = [
  { title: '', items: [['overview', 'Огляд', 'home']] },
  { title: 'Щодня', items: [['queues', 'Черги програми', 'tag'], ['wiki', 'Довідник', 'book'], ['news', 'Новини', 'edit']] },
  { title: 'Люди', items: [['accounts', 'Гравці й ролі', 'user']] },
  { title: 'Система', items: [['app', 'Програма', 'download'], ['shots', 'Навчальні знімки', 'camera'], ['discord', 'Discord-бот', 'bolt'], ['links', 'Налаштування', 'gear']] },
];
const ALL = GROUPS.flatMap(g => g.items);
/* старі адреси: /admin без вкладки раніше відкривав черги — тепер огляд, звідки черги в один натиск */

export default function Admin() {
  const { ready, role } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (ALL.find(([k]) => k === params.get('tab'))?.[0] || 'overview') as Tab;
  const open = (k: Tab) => setParams(k === 'overview' ? {} : { tab: k }, { replace: true });

  const [counts, setCounts] = useState<AdminCounts | null>(null);
  const loadCounts = () => {
    if (!supabase) return;
    Promise.all([
      supabase.rpc('admin_queue_counts'),
      supabase.from('wiki_proposals').select('id', { count: 'exact', head: true }).in('status', ['pending', 'conflict']),
      supabase.from('news_drafts').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
    ]).then(([q, w, n]) => {
      const qc = (q.data ?? {}) as Record<string, number>;
      setCounts({
        unknown: Number(qc.unknown || 0), limits: Number(qc.limits || 0), pending: Number(qc.pending || 0), drafts: Number(qc.drafts || 0),
        wiki: w.count ?? 0, news: n.count ?? 0, queuesOk: !q.error,
      });
    });
  };
  useEffect(() => { if (role === 'admin') loadCounts(); }, [role]);

  /* модератор має свою панель (specs/061): стара закладка /admin?tab=wiki веде в розбір */
  if (ready && role === 'moderator') return <Navigate to={params.get('tab') === 'wiki' ? '/panel/rozbir' : '/panel'} replace />;
  if (!ready || role !== 'admin') return <NotFound />;

  const badge = (k: Tab) => !counts ? 0
    : k === 'queues' ? counts.unknown + counts.limits + counts.pending + counts.drafts
    : k === 'wiki' ? counts.wiki : k === 'news' ? counts.news : 0;
  const label = ALL.find(([k]) => k === tab)?.[1] ?? '';

  return (
    <div className="adm">
      <header className="adm-head">
        <div>
          <h1>Адмінка</h1>
          <p className="muted">Керування сайтом і програмою. Почни з «Огляду» — там усе, що чекає на тебе.</p>
        </div>
        <Link to="/panel" className="btn ghost sm">Панель модераторів</Link>
      </header>
      <div className="adm-shell">
        <nav className="adm-side" aria-label="Розділи адмінки">
          {GROUPS.map(g => (
            <div key={g.title || 'top'} className="adm-group">
              {g.title && <h2 className="adm-group-t">{g.title}</h2>}
              <ul>
                {g.items.map(([k, l, ico]) => (
                  <li key={k}>
                    <button type="button" className={'adm-link' + (tab === k ? ' on' : '')} aria-current={tab === k ? 'page' : undefined} onClick={() => open(k)}>
                      <Icon name={ico} size={17} /><span>{l}</span>{badge(k) > 0 && <span className="nav-count">{badge(k)}</span>}
                    </button>
                  </li>))}
              </ul>
            </div>))}
        </nav>
        {/* на телефоні меню — випадний список */}
        <label className="adm-pick">
          <span className="sr">Розділ адмінки</span>
          <select value={tab} onChange={e => open(e.target.value as Tab)}>
            {GROUPS.map(g => g.title
              ? <optgroup key={g.title} label={g.title}>{g.items.map(([k, l]) => <option key={k} value={k}>{l}{badge(k) ? ` (${badge(k)})` : ''}</option>)}</optgroup>
              : g.items.map(([k, l]) => <option key={k} value={k}>{l}</option>))}
          </select>
        </label>
        <div className="adm-main" aria-label={label}>
          {tab === 'overview' && <AdminOverview counts={counts} onOpen={open} onReload={loadCounts} />}
          {tab === 'queues' && <AdminQueues onChange={loadCounts} />}
          {tab === 'wiki' && <AdminWiki pending={counts?.wiki ?? null} />}
          {tab === 'news' && <AdminNews />}
          {tab === 'accounts' && <><AdminAccounts /><WikiAuthors /></>}
          {tab === 'app' && <AdminAppState />}
          {tab === 'shots' && <AdminShots />}
          {tab === 'discord' && <AdminDiscordBot />}
          {tab === 'links' && <AdminLinks />}
        </div>
      </div>
    </div>
  );
}
