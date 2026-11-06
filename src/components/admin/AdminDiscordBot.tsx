import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import AdminSection from './AdminSection';

/* Discord-бот (specs/060 US3): стан, сервери бота, канал кожного скупника (0056), увімкнення публікацій, пробне.
   Налаштування — discord_bot і discord_buyer_channels (лише admin, RLS); стан і пробне — функція discord-bot (токен лише там). */
interface Bot {
  news_channel_id: string; prices_on: boolean; news_on: boolean;
  window_min: number; crosspost_per_hour: number; last_ok_at: string | null; last_error: string;
}
type Ch = { id: string; name?: string; announcement?: boolean; error?: string } | null;
interface Status {
  online: boolean; bot: string; error: string; guilds: { id: string; name: string }[];
  channels: { news: Ch; byId: Record<string, Ch> }; queued: number;
  posts: { key: string; channel_id: string; status: string; error: string; crossposted: boolean; created_at: string }[];
}
type Buyer = { id: string; name: string };

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

function ChannelNote({ c }: { c: Ch | undefined }) {
  if (!c) return null;
  if (c.error) return <small className="err">{c.error}</small>;
  return <small className="muted">#{c.name}{c.announcement ? ' · оголошення' : <span className="err"> · не оголошення — підписники не отримають</span>}</small>;
}

/* поле ID каналу з перевіркою при blur, назвою каналу й кнопкою «Пробне» */
function ChannelField({ id, label, value, saved, onChange, info, onTest, testMsg, busy, onBoard }: {
  id: string; label: string; value: string; saved: string; onChange: (v: string) => void;
  info: Ch | undefined; onTest: () => void; testMsg: string; busy: boolean; onBoard?: () => void;
}) {
  const [touched, setTouched] = useState(false);
  const err = idErr(value);
  return (
    <li className="adm-row">
      <div className="adm-row-main fld">
        <label htmlFor={id}><b>{label}</b></label>
        <input id={id} className="mono" inputMode="numeric" autoComplete="off" placeholder="ID каналу" value={value}
          aria-invalid={touched && !!err || undefined} aria-describedby={id + '-e'}
          onChange={e => onChange(e.target.value.trim())} onBlur={() => setTouched(true)} />
        <span id={id + '-e'}>
          {touched && err ? <small className="err">{err}</small> : value && value === saved ? <ChannelNote c={info} /> : !value ? <small className="muted">без каналу — у Discord не публікується</small> : null}
        </span>
        {testMsg && <small className={testMsg.startsWith('Надіслано') ? 'good' : 'err'} role="status">{testMsg}</small>}
      </div>
      <div className="adm-row-act">
        {onBoard && <button type="button" className="btn ghost sm" disabled={!saved || value !== saved || busy} onClick={onBoard}
          title={value !== saved ? 'Спершу збережи зміни' : 'Поточний прайс скупника в його канал'}>Надіслати прайс</button>}
        <button type="button" className="btn ghost sm" disabled={!saved || value !== saved || busy} onClick={onTest}
          title={value !== saved ? 'Спершу збережи зміни' : undefined}>Надіслати пробне</button>
      </div>
    </li>
  );
}

export default function AdminDiscordBot() {
  const [bot, setBot] = useState<Bot | null>(null);
  const [form, setForm] = useState<Bot | null>(null);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [chSaved, setChSaved] = useState<Record<string, string>>({});
  const [chForm, setChForm] = useState<Record<string, string>>({});
  const [st, setSt] = useState<Status | null>(null);
  const [stErr, setStErr] = useState('');
  const [loadErr, setLoadErr] = useState('');
  const [msg, setMsg] = useState('');
  const [chMsg, setChMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [testMsg, setTestMsg] = useState<Record<string, string>>({});

  async function load() {
    setLoadErr('');
    const [b, list, map] = await Promise.all([
      supabase!.from('discord_bot').select('news_channel_id,prices_on,news_on,window_min,crosspost_per_hour,last_ok_at,last_error').maybeSingle(),
      supabase!.from('buyers').select('id,name').order('sort'),
      supabase!.from('discord_buyer_channels').select('buyer_id,channel_id'),
    ]);
    if (b.error || !b.data) { setLoadErr('Налаштувань бота немає — міграцію 0055_discord_bot.sql застосовано?'); return; }
    if (map.error) { setLoadErr('Немає таблиці каналів скупників — застосуй міграцію 0056_discord_buyer_channels.sql.'); return; }
    setBot(b.data as Bot); setForm(b.data as Bot);
    setBuyers((list.data as Buyer[]) || []);
    const m = Object.fromEntries(((map.data as { buyer_id: string; channel_id: string }[]) || []).map(r => [r.buyer_id, r.channel_id]));
    setChSaved(m); setChForm(m);
  }
  async function loadStatus() {
    setStErr('');
    try { setSt(await call<Status>('status')); } catch (e) { setStErr((e as Error).message); }
  }
  useEffect(() => { load(); loadStatus(); }, []);

  const set = <K extends keyof Bot>(k: K, v: Bot[K]) => setForm(f => (f ? { ...f, [k]: v } : f));

  async function saveChannels() {
    setChMsg('');
    if (buyers.some(b => idErr(chForm[b.id] ?? ''))) { setChMsg('Виправ ID каналів, позначені червоним.'); return; }
    const up = buyers.filter(b => (chForm[b.id] ?? '') && chForm[b.id] !== chSaved[b.id]).map(b => ({ buyer_id: b.id, channel_id: chForm[b.id] }));
    const del = buyers.filter(b => !(chForm[b.id] ?? '') && chSaved[b.id]).map(b => b.id);
    setBusy('channels');
    const r1 = up.length ? await supabase!.from('discord_buyer_channels').upsert(up) : { error: null };
    const r2 = del.length ? await supabase!.from('discord_buyer_channels').delete().in('buyer_id', del) : { error: null };
    setBusy('');
    if (r1.error || r2.error) { setChMsg('Не вдалося зберегти канали — перевір, що в тебе роль admin.'); return; }
    setChSaved({ ...Object.fromEntries(Object.entries(chForm).filter(([, v]) => v)) }); setChMsg('Збережено.'); loadStatus();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!form) return; setMsg('');
    if (idErr(form.news_channel_id)) { setMsg('ID каналу новин — 17–20 цифр.'); return; }
    if (!(form.window_min >= 1 && form.window_min <= 60)) { setMsg('Вікно збирання — від 1 до 60 хв.'); return; }
    if (!(form.crosspost_per_hour >= 1 && form.crosspost_per_hour <= 50)) { setMsg('Пересилань на годину — від 1 до 50.'); return; }
    setBusy('save');
    const { news_channel_id, prices_on, news_on, window_min, crosspost_per_hour } = form;
    const { error } = await supabase!.from('discord_bot').update({ news_channel_id, prices_on, news_on, window_min, crosspost_per_hour }).eq('id', true);
    setBusy('');
    if (error) { setMsg('Не вдалося зберегти — перевір, що в тебе роль admin.'); return; }
    setBot(form); setMsg('Збережено.'); loadStatus();
  }

  async function test(key: string, channel_id: string) {
    setBusy('test-' + key); setTestMsg(m => ({ ...m, [key]: '' }));
    try {
      const r = await call<{ ok: boolean; error?: string }>('test', { channel_id });
      setTestMsg(m => ({ ...m, [key]: r.ok ? 'Надіслано — перевір канал.' : r.error || 'Не вдалося.' }));
    } catch (e) { setTestMsg(m => ({ ...m, [key]: (e as Error).message })); }
    setBusy(''); loadStatus();
  }

  /* поточний прайс у канали: одному скупнику (key = його id) чи всім, у кого ще немає повідомлення (key = 'missing') */
  const [boardMsg, setBoardMsg] = useState('');
  async function sendBoard(key: string, extra: Record<string, unknown>) {
    setBusy('board-' + key); setBoardMsg('');
    const name = (id: string) => buyers.find(b => b.id === id)?.name ?? id;
    try {
      const r = await call<{ posted: string[]; failed: { buyer_id: string; error: string }[]; note?: string }>('board', extra);
      const ok = r.posted.length ? `Надіслано: ${r.posted.map(name).join(', ')}.` : r.note || 'Нічого не надіслано.';
      const bad = r.failed.map(f => `${name(f.buyer_id)} — ${f.error}`).join(' ');
      if (key === 'missing') setBoardMsg([ok, bad].filter(Boolean).join(' '));
      else setTestMsg(m => ({ ...m, [key]: r.failed.length ? bad : 'Надіслано — перевір канал.' }));
    } catch (e) {
      if (key === 'missing') setBoardMsg((e as Error).message); else setTestMsg(m => ({ ...m, [key]: (e as Error).message }));
    }
    setBusy(''); loadStatus();
  }

  const dirty = JSON.stringify(bot) !== JSON.stringify(form);
  const chDirty = buyers.some(b => (chForm[b.id] ?? '') !== (chSaved[b.id] ?? ''));
  const withChannel = buyers.filter(b => chSaved[b.id]).length;

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
              const ch = st.channels.byId[p.channel_id] ?? null;
              return (
                <li key={p.key} className="adm-row">
                  <div className="adm-row-main"><b>{KIND[p.key.split(':')[0]] ?? p.key}</b><span className="muted">{when(p.created_at)}{p.crossposted ? ' · переслано підписникам' : ''}{ch?.name ? ' · #' + ch.name : ''}</span>
                    {p.error && <small className="err">{p.error}</small>}</div>
                  <span className={'pill ' + tone}>{label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </AdminSection>

      <AdminSection title="Канали скупників" error={loadErr} onRetry={load} loading={!form && !loadErr}
        hint={`Зміни цін скупника йдуть лише в його канал. Без каналу — у Discord не публікується. Зараз з каналом: ${withChannel} з ${buyers.length}.`}
        actions={<button type="button" className="btn ghost sm" disabled={busy !== '' || !withChannel || chDirty}
          onClick={() => sendBoard('missing', { missing: true })}
          title="Поточний прайс у канали скупників, де бот ще нічого не публікував">Надіслати прайс, де ще немає</button>}>
        {boardMsg && <p className={boardMsg.startsWith('Надіслано') && !boardMsg.includes(' — ') ? 'good' : 'err'} role="status">{boardMsg}</p>}
        <ul className="adm-list">
          {buyers.map(b => (
            <ChannelField key={b.id} id={'dc-b-' + b.id} label={b.name} value={chForm[b.id] ?? ''} saved={chSaved[b.id] ?? ''}
              onChange={v => setChForm(f => ({ ...f, [b.id]: v }))} info={st?.channels.byId[chSaved[b.id]] ?? undefined}
              onTest={() => test(b.id, chSaved[b.id])} testMsg={testMsg[b.id] ?? ''} busy={busy !== ''}
              onBoard={() => sendBoard(b.id, { buyer_ids: [b.id] })} />
          ))}
        </ul>
        <div className="row">
          <button type="button" className="btn acc" disabled={busy !== '' || !chDirty} onClick={saveChannels}>Зберегти канали скупників</button>
          {chMsg && <p className={chMsg === 'Збережено.' ? 'good' : 'err'} role="status">{chMsg}</p>}
        </div>
      </AdminSection>

      <AdminSection title="Публікації" loading={!form && !loadErr}
        hint="Канали скупників — тип «Оголошення»: інші сервери підписуються на них, і Discord пересилає їм кожне оновлення.">
        {form && (
          <form className="form" onSubmit={save} noValidate>
            <label className="mcheck"><input type="checkbox" checked={form.prices_on} onChange={e => set('prices_on', e.target.checked)} /> Публікувати ціни скупників</label>
            <div className="adm-form-row">
              <label className="fld">Вікно збирання змін, хв
                <input type="number" min={1} max={60} value={form.window_min} onChange={e => set('window_min', Number(e.target.value))} />
                <small className="muted">Усі зміни скупника за цей час — одним повідомленням.</small></label>
              <label className="fld">Пересилань на годину (на канал)
                <input type="number" min={1} max={50} value={form.crosspost_per_hour} onChange={e => set('crosspost_per_hour', Number(e.target.value))} />
                <small className="muted">Discord дозволяє близько 10 з каналу-оголошення.</small></label>
            </div>
            <ul className="adm-list">
              <ChannelField id="dc-news" label="Канал новин" value={form.news_channel_id} saved={bot?.news_channel_id ?? ''}
                onChange={v => set('news_channel_id', v)} info={st?.channels.news ?? undefined}
                onTest={() => test('news', bot!.news_channel_id)} testMsg={testMsg.news ?? ''} busy={busy !== ''} />
            </ul>
            <label className="mcheck"><input type="checkbox" checked={form.news_on} onChange={e => set('news_on', e.target.checked)} /> Публікувати новини (надсилаєш сам кнопкою у вкладці «Новини»)</label>
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
