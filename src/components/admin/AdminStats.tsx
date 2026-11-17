import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  CATEGORIES, CATEGORY_LABEL, currentMonth, discordAnnouncement, nickOrPlaceholder, periodLabel, previousMonth, toCsv, toTopRow,
  validPeriod, winnerTemplate, type Category, type Period, type TopRow,
} from '../../lib/activityStats';
import AdminSection from './AdminSection';
import { NotifyDialog, type NotifyDraft } from './AdminNotifications';

/* Статистика активності (specs/091 US1–US3, US6; contracts/ui.md): топ-10 за період у трьох категоріях, текст для Discord, CSV,
   внески гравця з виключеннями, налаштування правил. Кожне читання й дію перевіряє база (лише admin, 0075–0079). */

interface Ev {
  event_id: number; category: Category; title: string | null; link: string | null; created_at: string; status: string;
  counted: boolean; reason: string | null; exclusion_id: number | null; exclusion_reason: string | null; excluded_by: string | null; excluded_at: string | null;
}
interface Excl { id: number; event_id: number | null; user_id: string; period_from: string | null; period_to: string | null; reason: string;
  created_by_nick: string | null; created_at: string; revoked_by_nick: string | null; revoked_at: string | null }
type Player = { userId: string; nick: string | null };
type Ask = { kind: 'event'; ev: Ev } | { kind: 'player' };

const ROLES: [string, string][] = [['user', 'Гравці'], ['editor', 'Редактори'], ['moderator', 'Модератори'], ['admin', 'Адміни']];
const REASON: Record<string, string> = {
  over_daily_limit: 'понад ліміт за добу', excluded: 'виключено адміном', player_excluded: 'гравця виключено з конкурсу',
  role_excluded: 'роль не бере участі', pending: 'на розгляді', rejected: 'відхилено', removed: 'прибрано з сайту',
};
const when = (s: string) => new Date(s).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const errText = (e: { message: string; code?: string }) => (e.code === '42501' ? 'Немає доступу: сторінка лише для адміна.' : e.message);

export default function AdminStats() {
  const [period, setPeriod] = useState<Period>(() => currentMonth());
  const [draft, setDraft] = useState<Period>(period);
  const [rows, setRows] = useState<TopRow[] | null>(null);
  const [err, setErr] = useState('');
  const [copyMsg, setCopyMsg] = useState('');
  const [parts, setParts] = useState<string[] | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [notify, setNotify] = useState<NotifyDraft | null>(null);

  const load = useCallback(async (p: Period) => {
    if (!supabase) { setErr('Немає з\'єднання з базою.'); return; }
    setRows(null); setErr('');
    const { data, error } = await supabase.rpc('activity_top', { p_from: p.from, p_to: p.to, p_limit: 10 });
    if (error) { setErr('Не вдалося порахувати: ' + errText(error)); return; }
    setRows(((data ?? []) as Parameters<typeof toTopRow>[0][]).map(toTopRow));
  }, []);
  useEffect(() => { load(period); setParts(null); setCopyMsg(''); }, [period, load]);

  const apply = (p: Period) => { setDraft(p); setPeriod(p); };
  const draftOk = validPeriod(draft);
  const isCur = period.from === currentMonth().from && period.to === currentMonth().to;
  const isPrev = period.from === previousMonth().from && period.to === previousMonth().to;

  async function copy(text: string, n?: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyMsg(n ? `Частину ${n} скопійовано.` : 'Скопійовано — вставляйте в Discord.');
    } catch { setCopyMsg('Браузер не дав доступу до буфера. Виділіть текст нижче й скопіюйте вручну.'); setParts(p => p ?? [text]); }
  }
  function copyDiscord() {
    if (!rows) return;
    const list = discordAnnouncement(rows, period);
    if (list.length === 1) { setParts(null); copy(list[0]); } else { setParts(list); setCopyMsg(''); }
  }
  function csv() {
    if (!rows) return;
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `q-hub-aktyvnist-${period.from}_${period.to}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const notifyWinner = (r: TopRow) => {
    const t = winnerTemplate(r.nick, r.category, r.place, period);
    setNotify({ recipient: { id: r.userId, nick: r.nick }, title: t.title, body: t.body, category: r.category, place: r.place, period });
  };

  return (
    <>
      <AdminSection title="Статистика активності"
        hint="Хто найбільше допоміг сайту за період: зараховані внески за правилами конкурсу (київський час, межі включно)."
        actions={<div className="row">
          <button type="button" className="btn ghost sm" disabled={!rows} onClick={copyDiscord}>Скопіювати для Discord</button>
          <button type="button" className="btn ghost sm" disabled={!rows} onClick={csv}>Експорт CSV</button>
        </div>}>
        <div className="adm-stats-period">
          <div className="row" role="group" aria-label="Швидкий вибір періоду">
            <button type="button" className={'btn sm ' + (isCur ? 'acc' : 'ghost')} aria-pressed={isCur} onClick={() => apply(currentMonth())}>Цей місяць</button>
            <button type="button" className={'btn sm ' + (isPrev ? 'acc' : 'ghost')} aria-pressed={isPrev} onClick={() => apply(previousMonth())}>Попередній місяць</button>
          </div>
          <form className="adm-form-row" onSubmit={e => { e.preventDefault(); if (draftOk) setPeriod(draft); }}>
            <div className="fld"><label htmlFor="st-from">З</label>
              <input id="st-from" type="date" value={draft.from} onChange={e => setDraft(d => ({ ...d, from: e.target.value }))} aria-describedby="st-per-e" /></div>
            <div className="fld"><label htmlFor="st-to">По</label>
              <input id="st-to" type="date" value={draft.to} onChange={e => setDraft(d => ({ ...d, to: e.target.value }))} aria-describedby="st-per-e" /></div>
            <button type="submit" className="btn ghost sm" disabled={!draftOk}>Застосувати</button>
            <span id="st-per-e">{!draftOk && <small className="err">Кінець має бути не раніше початку, а період — не довший за рік.</small>}</span>
          </form>
          <p className="muted adm-note">Період: <b>{periodLabel(period)}</b></p>
        </div>
        {copyMsg && <p className="good" role="status">{copyMsg}</p>}
        {parts && parts.length > 1 && (
          <div className="adm-stats-parts">
            <p className="warn">Текст довший за ліміт Discord (2000 символів) — надішліть його {parts.length} повідомленнями по черзі.</p>
            {parts.map((p, i) => (
              <div key={i} className="adm-stats-part">
                <pre>{p}</pre>
                <button type="button" className="btn ghost sm" onClick={() => copy(p, i + 1)}>Скопіювати частину {i + 1}</button>
              </div>))}
          </div>)}
        {err && <div className="adm-err" role="alert"><span>{err}</span><button type="button" className="btn ghost sm" onClick={() => load(period)}>Спробувати ще</button></div>}
        {!err && (
          <div className="adm-stats-cards">
            {CATEGORIES.map(cat => {
              const top = rows?.filter(r => r.category === cat);
              return (
                <section key={cat} className="adm-card adm-stats-card" aria-labelledby={'st-' + cat} aria-busy={!rows || undefined}>
                  <h3 id={'st-' + cat}>{CATEGORY_LABEL[cat]}</h3>
                  {!top && <div className="adm-stats-skel" aria-hidden="true"><span /><span /><span /></div>}
                  {top && !top.length && <p className="adm-empty">За цей період внесків немає.</p>}
                  {top && top.length > 0 && (
                    <ol className="adm-stats-top">
                      {top.map(r => (
                        <li key={r.userId}>
                          <span className="adm-stats-place mono">{r.place}</span>
                          <button type="button" className="linkish adm-stats-nick" onClick={() => setPlayer({ userId: r.userId, nick: r.nick })}
                            title="Внески гравця за період">{nickOrPlaceholder(r.nick)}</button>
                          <b className="mono">{r.cnt}</b>
                          <button type="button" className="btn ghost sm" onClick={() => notifyWinner(r)}
                            aria-label={`Сповістити ${nickOrPlaceholder(r.nick)}: ${r.place} місце, ${CATEGORY_LABEL[cat]}`}>Сповістити</button>
                        </li>))}
                    </ol>)}
                </section>);
            })}
          </div>)}
      </AdminSection>
      <StatsSettings onSaved={() => load(period)} />
      <PlayerDialog player={player} period={period} onClose={() => setPlayer(null)} onChanged={() => load(period)} />
      <NotifyDialog draft={notify} onClose={() => setNotify(null)} />
    </>
  );
}

/* внески гравця за період: що, коли, посилання, статус; виключити / повернути з причиною */
function PlayerDialog({ player, period, onClose, onChanged }: { player: Player | null; period: Period; onClose: () => void; onChanged: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [evs, setEvs] = useState<Ev[] | null>(null);
  const [excl, setExcl] = useState<Excl[]>([]);
  const [err, setErr] = useState('');
  const [ask, setAsk] = useState<Ask | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!player || !supabase) return;
    setErr('');
    const [e, x] = await Promise.all([
      supabase.rpc('activity_user_events', { p_user: player.userId, p_from: period.from, p_to: period.to }),
      supabase.rpc('activity_exclusions_list', { p_from: period.from, p_to: period.to }),
    ]);
    if (e.error || x.error) { setErr('Не вдалося завантажити внески: ' + errText((e.error || x.error)!)); return; }
    setEvs((e.data ?? []) as Ev[]);
    setExcl(((x.data ?? []) as Excl[]).filter(r => r.user_id === player.userId && r.event_id === null));
  }, [player, period]);

  useEffect(() => {
    if (!player) { dlg.current?.close(); return; }
    setEvs(null); setAsk(null); setReason('');
    load();
    dlg.current?.showModal();
  }, [player, load]);

  async function run(fn: () => PromiseLike<{ error: { message: string; code?: string } | null }>) {
    setBusy(true); setErr('');
    const { error } = await fn();
    setBusy(false);
    if (error) { setErr(errText(error)); return; }
    setAsk(null); setReason('');
    await load(); onChanged();
  }
  const confirm = () => {
    if (!ask || reason.trim().length < 3 || !supabase || !player) return;
    const db = supabase;
    if (ask.kind === 'event') run(() => db.rpc('activity_exclude_event', { p_event: ask.ev.event_id, p_reason: reason.trim() }));
    else run(() => db.rpc('activity_exclude_user', { p_user: player.userId, p_from: period.from, p_to: period.to, p_reason: reason.trim() }));
  };
  const unexclude = (id: number) => supabase && run(() => supabase!.rpc('activity_unexclude', { p_exclusion: id }));

  const activePlayer = excl.find(x => !x.revoked_at);
  const counted = evs?.filter(e => e.counted).length ?? 0;

  return (
    <dialog ref={dlg} className="modal jmodal" aria-labelledby="pd-title" onClose={onClose} onClick={e => { if (e.target === dlg.current) onClose(); }}>
      {player && (
        <div className="modal-box">
          <div className="row between">
            <h2 id="pd-title">{nickOrPlaceholder(player.nick)} · {periodLabel(period)}</h2>
            <button type="button" className="btn ghost sm" onClick={onClose}>Закрити</button>
          </div>
          {evs && <p className="muted">Зараховано {counted} з {evs.length} внесків.</p>}
          {activePlayer
            ? <div className="adm-err warn" role="status">
                <span>Гравця виключено з конкурсу ({activePlayer.period_from} – {activePlayer.period_to}): «{activePlayer.reason}» · {activePlayer.created_by_nick || 'адмін'}, {when(activePlayer.created_at)}</span>
                <button type="button" className="btn ghost sm" disabled={busy} onClick={() => unexclude(activePlayer.id)}>Повернути в конкурс</button>
              </div>
            : <div className="row"><button type="button" className="btn ghost sm" disabled={busy} onClick={() => { setAsk({ kind: 'player' }); setReason(''); }}>
                Виключити гравця з конкурсу за цей період</button></div>}
          {ask && (
            <form className="adm-stats-ask" onSubmit={e => { e.preventDefault(); confirm(); }}>
              <label htmlFor="pd-reason"><b>{ask.kind === 'player' ? 'Чому виключити гравця з конкурсу?' : `Чому виключити внесок «${ask.ev.title || 'без назви'}»?`}</b></label>
              <input id="pd-reason" autoFocus value={reason} maxLength={300} onChange={e => setReason(e.target.value)} placeholder="Напр. помилкова ціна, накрутка"
                aria-describedby="pd-reason-h" />
              <small id="pd-reason-h" className="muted">Обов'язково, від 3 символів. Причину побачать інші адміни.</small>
              <div className="row">
                <button type="submit" className="btn acc sm" disabled={busy || reason.trim().length < 3}>Виключити</button>
                <button type="button" className="btn ghost sm" onClick={() => setAsk(null)}>Скасувати</button>
              </div>
            </form>)}
          {err && <p className="err" role="alert">{err}</p>}
          {!evs && !err && <p className="muted">Вантажу…</p>}
          {evs && !evs.length && <p className="adm-empty">За цей період внесків немає.</p>}
          {evs && evs.length > 0 && (
            <ul className="adm-list">
              {evs.map(e => (
                <li key={e.event_id} className="adm-row">
                  <div className="adm-row-main">
                    <b>{e.link ? <a href={e.link} target="_blank" rel="noreferrer">{e.title || 'без назви'}</a> : (e.title || 'без назви')}</b>
                    <span className="muted">{CATEGORY_LABEL[e.category]} · {when(e.created_at)} · {e.counted
                      ? <span className="good">зараховано</span>
                      : <span className={e.reason === 'excluded' || e.reason === 'player_excluded' ? 'bad' : 'warn'}>{REASON[e.reason ?? ''] ?? e.reason}</span>}</span>
                    {e.exclusion_id && <small className="muted">«{e.exclusion_reason}» · {e.excluded_by || 'адмін'}, {e.excluded_at && when(e.excluded_at)}</small>}
                  </div>
                  <div className="adm-row-act">
                    {e.exclusion_id
                      ? <button type="button" className="btn ghost sm" disabled={busy} onClick={() => unexclude(e.exclusion_id!)}>Повернути</button>
                      : e.status === 'counted' && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => { setAsk({ kind: 'event', ev: e }); setReason(''); }}>Виключити</button>}
                  </div>
                </li>))}
            </ul>)}
          {excl.some(x => x.revoked_at) && (
            <details className="adm-stats-hist">
              <summary>Скасовані виключення гравця</summary>
              <ul>{excl.filter(x => x.revoked_at).map(x => (
                <li key={x.id} className="muted">«{x.reason}» · {x.created_by_nick || 'адмін'}, {when(x.created_at)} → повернув {x.revoked_by_nick || 'адмін'}, {when(x.revoked_at!)}</li>))}
              </ul>
            </details>)}
        </div>
      )}
    </dialog>
  );
}

/* правила зарахування: ліміт цін за добу й ролі без участі; звірка подій з джерелами */
function StatsSettings({ onSaved }: { onSaved: () => void }) {
  const [limit, setLimit] = useState('1');
  const [roles, setRoles] = useState<string[]>(['admin', 'moderator']);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('activity_settings_get');
    if (error) { setErr('Не вдалося завантажити налаштування: ' + errText(error)); return; }
    const s = (data as { price_daily_limit: number; excluded_roles: string[] }[] | null)?.[0];
    if (s) { setLimit(String(s.price_daily_limit)); setRoles(s.excluded_roles); }
    setLoaded(true);
  }
  const n = Number(limit);
  const limitErr = Number.isInteger(n) && n >= 1 && n <= 50 ? '' : 'Ціле число від 1 до 50.';

  async function save() {
    if (limitErr || !supabase) return;
    setBusy(true); setMsg(''); setErr('');
    const { error } = await supabase.rpc('activity_settings_set', { p_price_daily_limit: n, p_excluded_roles: roles });
    setBusy(false);
    if (error) { setErr('Не збережено: ' + errText(error)); return; }
    setMsg('Збережено — топ перераховано.'); onSaved();
  }
  async function resync() {
    if (!supabase) return;
    setBusy(true); setMsg(''); setErr('');
    const { data, error } = await supabase.rpc('activity_resync');
    setBusy(false);
    if (error) { setErr('Звірка не вдалась: ' + errText(error)); return; }
    setMsg(Number(data) ? `Змінено подій: ${data} — топ перераховано.` : 'Розбіжностей немає — події збігаються з сайтом.');
    if (Number(data)) onSaved();
  }

  return (
    <section className="adm-sec">
      <details onToggle={e => { if ((e.target as HTMLDetailsElement).open && !loaded) load(); }}>
        <summary className="adm-stats-sum"><h2>Правила зарахування</h2></summary>
        <form className="adm-form" onSubmit={e => { e.preventDefault(); save(); }}>
          <div className="fld">
            <label htmlFor="st-limit"><b>Ціна одного товару скупника — разів на добу від гравця</b></label>
            <input id="st-limit" type="number" min={1} max={50} step={1} value={limit} onChange={e => setLimit(e.target.value)}
              aria-invalid={!!limitErr || undefined} aria-describedby="st-limit-e" />
            <span id="st-limit-e">{limitErr ? <small className="err">{limitErr}</small> : <small className="muted">Доба — за київським часом.</small>}</span>
          </div>
          <fieldset className="fld">
            <legend><b>Не беруть участі в конкурсі</b></legend>
            {ROLES.map(([r, l]) => (
              <label key={r} className="row"><input type="checkbox" checked={roles.includes(r)}
                onChange={e => setRoles(rs => (e.target.checked ? [...rs, r] : rs.filter(x => x !== r)))} /> {l}</label>))}
          </fieldset>
          {err && <p className="err" role="alert">{err}</p>}
          {msg && <p className="good" role="status">{msg}</p>}
          <div className="row">
            <button type="submit" className="btn acc sm" disabled={busy || !!limitErr || !loaded}>Зберегти правила</button>
            <button type="button" className="btn ghost sm" disabled={busy} onClick={resync}
              title="Перерахувати таблицю подій з цін, міток і гайдів на сайті">Звірити з сайтом</button>
          </div>
        </form>
      </details>
    </section>
  );
}
