import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import NotFound from './NotFound';
import AdminQueues from '../components/admin/AdminQueues';
import AdminAccounts from '../components/admin/AdminAccounts';
import AdminAppState from '../components/admin/AdminAppState';
import AdminShots from '../components/admin/AdminShots';
import AdminLinks from '../components/admin/AdminLinks';
import AdminDiscordBot from '../components/admin/AdminDiscordBot';
import AdminNews from '../components/admin/AdminNews';
import AdminWiki from '../components/admin/AdminWiki';

/* Адмін-панель для розробників (specs/039): лише роль admin — решта (і гість) бачить звичайне «Не знайдено» (FR-001).
   Виняток — moderator: лише вкладка «Довідник» (specs/043, публікує правки гравців разом з admin).
   Це лише показ: кожне читання й дію перевіряє база (0046, конституція II) */
const TABS = [
  ['queues', 'Черги'], ['accounts', 'Гравці'], ['app', 'Програма'], ['shots', 'Знімки'], ['wiki', 'Довідник'], ['discord', 'Discord-бот'], ['news', 'Новини'], ['links', 'Налаштування'],
] as const;
type Tab = typeof TABS[number][0];

export default function Admin() {
  const { ready, role } = useAuth();
  const [params, setParams] = useSearchParams();
  const mod = role === 'moderator';
  const tabs = mod ? TABS.filter(([k]) => k === 'wiki') : TABS;
  const tab = (tabs.find(([k]) => k === params.get('tab'))?.[0] || tabs[0][0]) as Tab;
  const [total, setTotal] = useState<number | null>(null);
  const loadTotal = () => {
    supabase?.rpc('admin_queue_counts').then(({ data, error }) => {
      if (!error && data) setTotal(Object.values(data as Record<string, number>).reduce((a, b) => a + Number(b || 0), 0));
    });
  };
  useEffect(() => { if (role === 'admin') loadTotal(); }, [role]);

  if (!ready || (role !== 'admin' && !mod)) return <NotFound />;
  return (
    <div className="adm">
      <header className="adm-head">
        <div>
          <h1>Адмінка</h1>
          <p className="muted">Для розробників: черги від програми, ролі, стан програми, навчальні знімки й налаштування сайту.</p>
        </div>
        {total !== null && <span className={'pill ' + (total ? 'warn' : 'good')}>{total ? `Нерозібраного: ${total}` : 'Черги порожні'}</span>}
      </header>
      <div className="seg adm-tabs" role="tablist" aria-label="Розділи адмінки">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setParams(k === 'queues' ? {} : { tab: k }, { replace: true })}>
            {label}{k === 'queues' && total ? <span className="evdot">{total}</span> : null}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'queues' && <AdminQueues onChange={loadTotal} />}
        {tab === 'accounts' && <AdminAccounts />}
        {tab === 'app' && <AdminAppState />}
        {tab === 'shots' && <AdminShots />}
        {tab === 'discord' && <AdminDiscordBot />}
        {tab === 'news' && <AdminNews />}
        {tab === 'wiki' && <AdminWiki />}
        {tab === 'links' && <AdminLinks />}
      </div>
    </div>
  );
}
