import { useEffect, useState, type ReactNode } from 'react';
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
import AdminStats from '../components/admin/AdminStats';
import AdminNotifications from '../components/admin/AdminNotifications';
import AdminGlossary from '../components/admin/AdminGlossary';
import PanelHome from '../components/panel/PanelHome';
import ReviewQueue from '../components/panel/ReviewQueue';
import MyDecisions from '../components/panel/MyDecisions';
import { Bans, Hidden } from '../components/panel/HiddenAndBans';
import Icon from '../components/Icon';

/* Робоче місце команди — одна сторінка з бічним меню й оглядом (редизайн 2026-11-15, рішення власника):
   - /admin — «Адмінка» (лише admin): усе, зокрема розбір довідника вкладками тут же, без переходу в /panel;
   - /panel — «Модерація» (модератор) чи «Мої інструменти» (редактор): та сама сторінка, лише їхні розділи.
   Вкладка — у ?tab=, тож посилання й «Назад» працюють. Це лише показ: кожне читання й дію перевіряє база (конституція II) */
type Tab = 'overview' | 'review' | 'decisions' | 'hidden' | 'glossary' | 'queues' | 'news' | 'accounts' | 'stats' | 'notices' | 'app' | 'shots' | 'discord' | 'links';
type Group = { title: string; items: [Tab, string, string][] };
/* глосарій RP-термінів (specs/093) — у модерації: правлять admin і moderator (конституція 1.4.0) */
const MODERATION: Group = { title: 'Модерація', items: [['review', 'Розбір пропозицій', 'tag'], ['decisions', 'Мої рішення', 'check'], ['hidden', 'Прибрані й заборони', 'eyeoff'], ['glossary', 'Глосарій', 'book']] };
const ADMIN_GROUPS: Group[] = [
  { title: '', items: [['overview', 'Огляд', 'home']] },
  MODERATION,
  { title: 'Щодня', items: [['queues', 'Черги програми', 'layers'], ['news', 'Новини', 'edit']] },
  { title: 'Люди', items: [['accounts', 'Гравці й ролі', 'user'], ['stats', 'Статистика активності', 'chart'], ['notices', 'Сповіщення гравцям', 'bell']] },
  { title: 'Система', items: [['app', 'Програма', 'download'], ['shots', 'Навчальні знімки', 'camera'], ['discord', 'Discord-бот', 'bolt'], ['links', 'Налаштування', 'gear']] },
];
/* старі адреси: ?tab=wiki (колишній «Довідник») і /panel/rozbir… ведуть у відповідні вкладки */
const ALIAS: Record<string, Tab> = { wiki: 'review', rozbir: 'review', rishennia: 'decisions', prybrani: 'hidden' };

export default function Admin({ mode = 'admin' }: { mode?: 'admin' | 'team' }) {
  const { ready, role } = useAuth();
  const [params, setParams] = useSearchParams();
  const isAdmin = role === 'admin';
  const canReview = role === 'admin' || role === 'moderator';
  const groups: Group[] = mode === 'admin' ? ADMIN_GROUPS : [{ title: '', items: [['overview', 'Огляд', 'home']] }, ...(canReview ? [MODERATION] : [])];
  const all = groups.flatMap(g => g.items);
  const raw = params.get('tab') || '';
  const want = (ALIAS[raw] || raw) as Tab;
  const tab = (all.find(([k]) => k === want)?.[0] || 'overview') as Tab;
  /* зміна вкладки — без фільтрів розбору (f, id) з попередньої */
  const open = (k: Tab) => setParams(k === 'overview' ? {} : { tab: k });

  const [counts, setCounts] = useState<AdminCounts | null>(null);
  const [wikiWaiting, setWikiWaiting] = useState<number | null>(null);
  const loadCounts = () => {
    if (!supabase) return;
    const wiki = supabase.from('wiki_proposals').select('id', { count: 'exact', head: true }).in('status', ['pending', 'conflict']);
    if (!isAdmin) { if (canReview) wiki.then(w => setWikiWaiting(w.count ?? 0)); return; }
    Promise.all([
      supabase.rpc('admin_queue_counts'), wiki,
      supabase.from('news_drafts').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
    ]).then(([q, w, n]) => {
      const qc = (q.data ?? {}) as Record<string, number>;
      setWikiWaiting(w.count ?? 0);
      setCounts({
        unknown: Number(qc.unknown || 0), limits: Number(qc.limits || 0), pending: Number(qc.pending || 0), drafts: Number(qc.drafts || 0),
        wiki: w.count ?? 0, news: n.count ?? 0, queuesOk: !q.error,
      });
    });
  };
  useEffect(() => { if (ready) loadCounts(); }, [ready, role, mode]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return null;
  /* модератор чи редактор на /admin — у свою «Модерацію», на ту саму вкладку */
  if (mode === 'admin' && !isAdmin && (role === 'moderator' || role === 'editor')) return <Navigate to={'/panel' + (want ? '?tab=' + want : '')} replace />;
  if (mode === 'admin' ? !isAdmin : !(canReview || role === 'editor')) return <NotFound />;

  const badge = (k: Tab) => k === 'review' ? wikiWaiting ?? 0
    : !counts ? 0 : k === 'queues' ? counts.unknown + counts.limits + counts.pending + counts.drafts : k === 'news' ? counts.news : 0;
  const label = all.find(([k]) => k === tab)?.[1] ?? '';
  const title = mode === 'admin' ? 'Адмінка' : canReview ? 'Модерація' : 'Мої інструменти';
  const lead = mode === 'admin' ? 'Усе керування сайтом, довідником і програмою. «Огляд» показує, що чекає на тебе зараз.'
    : canReview ? 'Розбір пропозицій від гравців і твої інструменти. «Огляд» показує, що чекає зараз.' : 'Твої інструменти на сайті в одному місці.';

  const views: Record<Tab, ReactNode> = {
    overview: mode === 'admin'
      ? <><AdminOverview counts={counts} onOpen={k => open(k === 'wiki' ? 'review' : (k as Tab))} onReload={loadCounts} /><PanelHome canReview={false} /></>
      : <PanelHome canReview={canReview} />,
    review: <ReviewQueue inUrl onBanned={loadCounts} />,
    decisions: <MyDecisions />,
    hidden: <><Hidden /><Bans /></>,
    glossary: <AdminGlossary />,
    queues: <AdminQueues onChange={loadCounts} />,
    news: <AdminNews />,
    accounts: <><AdminAccounts /><WikiAuthors /></>,
    stats: <AdminStats />,
    notices: <AdminNotifications />,
    app: <AdminAppState />,
    shots: <AdminShots />,
    discord: <AdminDiscordBot />,
    links: <><AdminLinks /><AdminWiki /></>,
  };

  return (
    <div className="adm">
      <header className="adm-head">
        <div>
          <h1>{title}</h1>
          <p className="muted">{lead}</p>
        </div>
        {mode === 'admin' && <Link to="/panel" className="btn ghost sm" title="Ця ж сторінка такою, якою її бачать модератори">Як бачать модератори</Link>}
        {mode === 'team' && isAdmin && <Link to="/admin" className="btn ghost sm">До адмінки</Link>}
      </header>
      <div className="adm-shell">
        <nav className="adm-side" aria-label={'Розділи: ' + title}>
          {groups.map(g => (
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
          <span className="sr">Розділ</span>
          <select value={tab} onChange={e => open(e.target.value as Tab)}>
            {groups.map(g => g.title
              ? <optgroup key={g.title} label={g.title}>{g.items.map(([k, l]) => <option key={k} value={k}>{l}{badge(k) ? ` (${badge(k)})` : ''}</option>)}</optgroup>
              : g.items.map(([k, l]) => <option key={k} value={k}>{l}</option>))}
          </select>
        </label>
        <div className="adm-main" aria-label={label}>{views[tab]}</div>
      </div>
    </div>
  );
}
