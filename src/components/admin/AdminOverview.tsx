import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { fetchLatestRelease } from '../../lib/admin';
import AdminSection from './AdminSection';

/* «Огляд» адмінки (2026-11-06): перший екран — що чекає на власника і чи все працює. Кожен рядок веде туди, де це розбирають */
export interface AdminCounts {
  unknown: number; limits: number; pending: number; drafts: number; wiki: number; news: number;
  /* false — лічильники черг програми не прочитались (немає прав чи функції) */
  queuesOk: boolean;
}
type Tab = 'queues' | 'wiki' | 'news' | 'app' | 'discord';
type App = { online_3m: number; online_24h: number; versions: { version: string | null; n: number }[] };
type Bot = { last_ok_at: string | null; last_error: string | null; prices_on: boolean; news_on: boolean };

const ago = (s: string | null) => {
  if (!s) return 'ще не було';
  const m = Math.floor((Date.now() - new Date(s).getTime()) / 60_000);
  return m < 1 ? 'щойно' : m < 60 ? `${m} хв тому` : m < 1440 ? `${Math.floor(m / 60)} год тому` : `${Math.floor(m / 1440)} дн тому`;
};

export default function AdminOverview({ counts, onOpen, onReload }: { counts: AdminCounts | null; onOpen: (t: Tab) => void; onReload: () => void }) {
  const [app, setApp] = useState<App | null>(null);
  const [latest, setLatest] = useState<string | null>(null);
  const [bot, setBot] = useState<Bot | null | undefined>(undefined);
  useEffect(() => {
    supabase!.rpc('admin_app_stats').then(({ data }) => setApp((data as App) ?? null));
    fetchLatestRelease().then(setLatest);
    supabase!.from('discord_bot').select('last_ok_at,last_error,prices_on,news_on').maybeSingle().then(({ data }) => setBot((data as Bot) ?? null));
  }, []);

  const c = counts;
  const queues = c ? c.unknown + c.limits + c.pending + c.drafts : 0;
  const onLatest = latest && app ? app.versions.filter(v => v.version === latest).reduce((a, v) => a + v.n, 0) : null;
  const week = app ? app.versions.reduce((a, v) => a + v.n, 0) : 0;

  /* «Потребує уваги»: лише ненульове, у порядку важливості */
  const todo: { n: number; text: string; go: () => void; to?: string }[] = c ? [
    { n: c.wiki, text: 'пропозицій довідника від гравців', go: () => {}, to: '/panel/rozbir' },
    { n: c.unknown, text: 'невідомих товарів з вікна скупника', go: () => onOpen('queues') },
    { n: c.limits, text: 'цін поза межами скупника', go: () => onOpen('queues') },
    { n: c.pending, text: 'цін без другого підтвердження', go: () => onOpen('queues') },
    { n: c.drafts, text: 'чернеток міток від помічників', go: () => {}, to: '/mapa?tools=drafts' },
    { n: c.news, text: 'чернеток новин для Discord', go: () => onOpen('news') },
  ].filter(t => t.n > 0) : [];
  const botBad = bot ? Boolean(bot.last_error) : false;

  return (
    <>
      <AdminSection title="Потребує уваги" loading={!c} hint="Усе, що чекає твого рішення. Натисни рядок — відкриється місце, де це розбирають."
        actions={<button type="button" className="btn ghost sm" onClick={onReload}>Оновити</button>}>
        {c && (todo.length === 0 && !botBad ? <p className="adm-empty">Усе спокійно — нічого не чекає.</p> : (
          <ul className="pnl-wait">
            {botBad && <li className="warn-row"><button type="button" onClick={() => onOpen('discord')}><b className="num">!</b><span><b>Discord-бот повідомив про помилку</b><small className="muted">{bot?.last_error}</small></span></button></li>}
            {todo.map(t => (
              <li key={t.text}>{t.to
                ? <Link to={t.to}><b className="num">{t.n}</b><span><b>{t.text[0].toUpperCase() + t.text.slice(1)}</b></span></Link>
                : <button type="button" onClick={t.go}><b className="num">{t.n}</b><span><b>{t.text[0].toUpperCase() + t.text.slice(1)}</b></span></button>}</li>))}
          </ul>
        ))}
        {c && !c.queuesOk && <p className="err">Черги програми не прочитались — відкрий «Черги програми», там буде причина.</p>}
      </AdminSection>

      <AdminSection title="Стан" hint="Коротко про програму, бота й черги. Подробиці — у розділах зліва.">
        <div className="adm-grid">
          <button type="button" className="adm-tile adm-tile-go" onClick={() => onOpen('app')}>
            <span className="muted">У програмі зараз</span>
            <b>{app ? app.online_3m : '…'}</b>
            <small className="muted">{app ? `за добу: ${app.online_24h}` : ''}{onLatest !== null && week ? ` · на останній версії ${latest}: ${onLatest} з ${week}` : ''}</small>
          </button>
          <button type="button" className="adm-tile adm-tile-go" onClick={() => onOpen('discord')}>
            <span className="muted">Discord-бот</span>
            <b className={botBad ? 'bad' : 'good'}>{bot === undefined ? '…' : bot === null ? 'не налаштовано' : botBad ? 'помилка' : 'працює'}</b>
            <small className="muted">{bot ? `остання вдала дія: ${ago(bot.last_ok_at)}` : ''}</small>
          </button>
          <button type="button" className="adm-tile adm-tile-go" onClick={() => onOpen('queues')}>
            <span className="muted">Черги програми</span>
            <b>{c ? queues : '…'}</b>
            <small className="muted">{c ? (queues ? 'чекають розбору' : 'порожні') : ''}</small>
          </button>
          <Link className="adm-tile adm-tile-go" to="/panel/rozbir">
            <span className="muted">Довідник від гравців</span>
            <b>{c ? c.wiki : '…'}</b>
            <small className="muted">{c ? (c.wiki ? 'на розгляді — розбір у панелі' : 'черга порожня') : ''}</small>
          </Link>
        </div>
      </AdminSection>
    </>
  );
}
