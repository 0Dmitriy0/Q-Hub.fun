import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import AdminSection from './AdminSection';

/* Discord-бот (specs/060 US3): стан, сервери бота, канали цін і новин, увімкнення публікацій, пробне повідомлення.
   Налаштування — таблиця discord_bot (лише admin, RLS 0055); стан і пробне — функція discord-bot (токен лише там). */
interface Bot {
  guild_id: string; prices_channel_id: string; news_channel_id: string; prices_on: boolean; news_on: boolean;
  window_min: number; crosspost_per_hour: number; last_ok_at: string | null; last_error: string;
}
type Ch = { id: string; name?: string; announcement?: boolean; error?: string } | null;
interface Status {
  online: boolean; bot: string; error: string; guilds: { id: string; name: string }[];
  channels: { prices: Ch; news: Ch }; queued: number;
  posts: { key: string; status: string; error: string; crossposted: boolean; created_at: string }[];
}

const ID = /^\d{17,20}$/;
const idErr = (v: string) => (v === '' || ID.test(v) ? '' : 'ID каналу — 17–20 цифр. ПКМ по каналу → «Копіювати ID каналу».');
const when = (s: string | null) => (s ? new Date(s).toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const KIND: Record<string, string> = { prices: 'Ціни', news: 'Новина', test: 'Пробне' };
const STATE: Record<string, [string, string]> = { sent: ['надіслано', 'good'], sending: ['надсилаю', 'warn'], failed: ['помилка', 'bad'] };

async function call<T>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase!.functions.invoke('discord-bot', { body: { action, ...extra } });
  if (error) {
    /* текст помилки функції — у тілі відповіді */
    let text = 'Функція discord-bot не відповіла — її задеплоєно?';
    try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) text = b.error; } catch { /* лишаємо загальний */ }
    throw new Error(text);
  }
  return data as T;
}

function ChannelNote({ c }: { c: Ch }) {
  if (!c) return null;
  if (c.error) return <small className="err">{c.error}</small>;
  return <small className="muted">#{c.name}{c.announcement ? ' · оголошення' : <span className="err"> · не оголошення — підписники не отримають</span>}</small>;
}

export default function AdminDiscordBot() {
  const [bot, setBot] = useState<Bot | null>(null);
  const [form, setForm] = useState<Bot | null>(null);
  const [st, setSt] = useState<Status | null>(null);
  const [stErr, setStErr] = useState('');
  const [loadErr, setLoadErr] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [testMsg, setTestMsg] = useState<Record<string, string>>({});

  async function load() {
    setLoadErr('');
    const { data, error } = await supabase!.from('discord_bot').select('*').maybeSingle();
    if (error || !data) { setLoadErr('Налаштувань бота немає — міграцію 0055_discord_bot.sql застосовано?'); return; }
    setBot(data as Bot); setForm(data as Bot);
  }
  async function loadStatus() {
    setStErr('');
    try { setSt(await call<Status>('status')); } catch (e) { setStErr((e as Error).message); }
  }
  useEffect(() => { load(); loadStatus(); }, []);

  const set = <K extends keyof Bot>(k: K, v: Bot[K]) => setForm(f => (f ? { ...f, [k]: v } : f));
  const errs = form ? { prices_channel_id: idErr(form.prices_channel_id), news_channel_id: idErr(form.news_channel_id) } : {};

  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!form) return; setMsg('');
    setTouched({ prices_channel_id: true, news_channel_id: true });
    if (Object.values(errs).some(Boolean)) return;
    if (form.prices_on && !form.prices_channel_id) { setMsg('Щоб публікувати ціни, впиши канал цін.'); return; }
    if (!(form.window_min >= 1 && form.window_min <= 60)) { setMsg('Вікно збирання — від 1 до 60 хв.'); return; }
    if (!(form.crosspost_per_hour >= 1 && form.crosspost_per_hour <= 50)) { setMsg('Пересилань на годину — від 1 до 50.'); return; }
    setBusy('save');
    const { guild_id, prices_channel_id, news_channel_id, prices_on, news_on, window_min, crosspost_per_hour } = form;
    const { error } = await supabase!.from('discord_bot')
      .update({ guild_id, prices_channel_id, news_channel_id, prices_on, news_on, window_min, crosspost_per_hour }).eq('id', true);
    setBusy('');
    if (error) { setMsg('Не вдалося зберегти — перевір, що в тебе роль admin.'); return; }
    setBot(form); setMsg('Збережено.'); loadStatus();
  }

  async function test(channel: 'prices' | 'news') {
    setBusy('test-' + channel); setTestMsg(m => ({ ...m, [channel]: '' }));
    try {
      const r = await call<{ ok: boolean; error?: string }>('test', { channel });
      setTestMsg(m => ({ ...m, [channel]: r.ok ? 'Надіслано — перевір канал.' : r.error || 'Не вдалося.' }));
    } catch (e) { setTestMsg(m => ({ ...m, [channel]: (e as Error).message })); }
    setBusy(''); loadStatus();
  }

  const dirty = JSON.stringify(bot) !== JSON.stringify(form);
  const field = (k: 'prices_channel_id' | 'news_channel_id', label: string, ch: 'prices' | 'news') => (
    <div className="fld">
      <label htmlFor={'dc-' + k}>{label}</label>
      <input id={'dc-' + k} className="mono" inputMode="numeric" autoComplete="off" value={form![k]}
        aria-invalid={touched[k] && !!errs[k] || undefined} aria-describedby={'dc-' + k + '-e'}
        onChange={e => set(k, e.target.value.trim())} onBlur={() => setTouched(t => ({ ...t, [k]: true }))} />
      <span id={'dc-' + k + '-e'}>
        {touched[k] && errs[k] ? <small className="err">{errs[k]}</small> : <ChannelNote c={st?.channels[ch] ?? null} />}
      </span>
      <div className="row">
        <button type="button" className="btn ghost sm" disabled={!bot?.[k] || dirty || busy !== ''} onClick={() => test(ch)}
          title={dirty ? 'Спершу збережи зміни' : undefined}>Надіслати пробне</button>
        {testMsg[ch] && <small className={testMsg[ch].startsWith('Надіслано') ? 'good' : 'err'} role="status">{testMsg[ch]}</small>}
      </div>
    </div>
  );

  return (
    <>
      <AdminSection title="Стан бота" hint="Бот лише пише в Discord — нічого не читає на жодному сервері."
        error={stErr} onRetry={loadStatus} loading={!st && !stErr}
        actions={<button type="button" className="btn ghost sm" onClick={loadStatus}>Оновити</button>}>
        {st && (
          <div className="adm-grid">
            <div className="adm-tile">
              <span className="muted">Зв'язок</span>
              <b><span className={'pill ' + (st.online ? 'good' : 'bad')}>{st.online ? 'на зв\'язку' : 'немає зв\'язку'}</span> {st.bot}</b>
              {(st.error || bot?.last_error) && <small className="err">{st.error || bot?.last_error}</small>}
            </div>
            <div className="adm-tile">
              <span className="muted">Сервери бота</span>
              {st.guilds.length ? st.guilds.map(g => <b key={g.id}>{g.name}</b>) : <small className="muted">ще ні на одному — запроси бота на сервер</small>}
            </div>
            <div className="adm-tile">
              <span className="muted">Остання вдала дія</span>
              <b>{when(bot?.last_ok_at ?? null)}</b>
              <small className="muted">у черзі змін цін: {st.queued}</small>
            </div>
          </div>
        )}
        {st && st.posts.length > 0 && (
          <ul className="adm-list">
            {st.posts.map(p => {
              const [label, tone] = STATE[p.status] ?? [p.status, 'warn'];
              return (
                <li key={p.key} className="adm-row">
                  <div className="adm-row-main"><b>{KIND[p.key.split(':')[0]] ?? p.key}</b><span className="muted">{when(p.created_at)}{p.crossposted ? ' · переслано підписникам' : ''}</span>
                    {p.error && <small className="err">{p.error}</small>}</div>
                  <span className={'pill ' + tone}>{label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </AdminSection>

      <AdminSection title="Канали й публікації" error={loadErr} onRetry={load} loading={!form && !loadErr}
        hint="Канал цін — тип «Оголошення»: інші сервери підписуються на нього, і Discord пересилає їм кожне оновлення.">
        {form && (
          <form className="form" onSubmit={save} noValidate>
            {field('prices_channel_id', 'Канал цін (ID)', 'prices')}
            <label className="mcheck"><input type="checkbox" checked={form.prices_on} onChange={e => set('prices_on', e.target.checked)} /> Публікувати ціни скупників</label>
            {field('news_channel_id', 'Канал новин (ID)', 'news')}
            <label className="mcheck"><input type="checkbox" checked={form.news_on} onChange={e => set('news_on', e.target.checked)} /> Публікувати новини (з чернеток — наступний реліз)</label>
            <div className="adm-form-row">
              <label className="fld">Вікно збирання змін, хв
                <input type="number" min={1} max={60} value={form.window_min} onChange={e => set('window_min', Number(e.target.value))} />
                <small className="muted">Усі зміни цін за цей час — одним повідомленням.</small></label>
              <label className="fld">Пересилань на годину
                <input type="number" min={1} max={50} value={form.crosspost_per_hour} onChange={e => set('crosspost_per_hour', Number(e.target.value))} />
                <small className="muted">Discord дозволяє близько 10 з каналу-оголошення.</small></label>
            </div>
            <div className="row">
              <button className="btn acc" disabled={busy !== '' || !dirty}>Зберегти налаштування бота</button>
              {msg && <p className={msg === 'Збережено.' ? 'good' : 'err'} role="status">{msg}</p>}
            </div>
          </form>
        )}
      </AdminSection>
    </>
  );
}
