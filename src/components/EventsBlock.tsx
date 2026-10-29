import { useCallback, useEffect, useState } from 'react';
import EventList from './EventList';
import Icon from './Icon';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { days, kyivDay, range, upcoming, type Phase, type Promo, type SeasonEvent } from '../lib/seasons';

/* Блок «Найближчі івенти» на головній: розклад щогодинних івентів, сезонні івенти (Найттаун: Хелловін…) і промокоди.
   Сезонні івенти й промокоди — з бази (міграція 0025), додають і змінюють адмін і редактори прямо тут */
type Tab = 'sched' | 'season' | 'promo';
const TAB_KEY = 'qhub-events-tab';

function PhasePill({ ph }: { ph: Phase }) {
  if (ph.kind === 'now') return <span className="sv-ph now">{ph.left === null ? 'триває' : ph.left === 1 ? 'останній день' : `ще ${days(ph.left)}`}</span>;
  if (ph.kind === 'soon') return <span className="sv-ph soon">{ph.in === 1 ? 'завтра' : `через ${days(ph.in)}`}</span>;
  return null;
}

export default function EventsBlock() {
  const { isStaff } = useAuth();
  const [tab, setTab] = useState<Tab>(() => { try { return (localStorage.getItem(TAB_KEY) as Tab) || 'sched'; } catch { return 'sched'; } });
  const [events, setEvents] = useState<SeasonEvent[] | null>(null);
  const [promos, setPromos] = useState<Promo[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [edit, setEdit] = useState<{ kind: 'season'; row: Partial<SeasonEvent> } | { kind: 'promo'; row: Partial<Promo> } | null>(null);
  const today = kyivDay(Date.now());

  const load = useCallback(async () => {
    if (!supabase) { setEvents([]); setPromos([]); return; }
    const [e, p] = await Promise.all([
      supabase.from('season_events').select('id,title,description,starts_on,ends_on,link').order('starts_on'),
      supabase.from('promo_codes').select('id,code,reward,playtime_hours,starts_on,ends_on,note').order('starts_on'),
    ]);
    /* таблиць ще немає — міграцію 0025 не запущено: гравцям просто порожньо, адміну — підказка */
    setMissing(!!(e.error || p.error));
    setEvents((e.data as SeasonEvent[]) || []); setPromos((p.data as Promo[]) || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const pick = (t: Tab) => { setTab(t); setEdit(null); try { localStorage.setItem(TAB_KEY, t); } catch { /* приватний режим */ } };
  const ev = upcoming(events || [], today), pr = upcoming(promos || [], today);
  const live = (rows: { ph: Phase }[]) => rows.filter(r => r.ph.kind === 'now').length;

  return (
    <div className="card evblock" id="iventy">
      <div className="evhead">
        <h2 className="ih"><Icon name="clock" />Найближчі івенти</h2>
        <div className="seg sm" role="tablist" aria-label="Що показати">
          <button role="tab" aria-selected={tab === 'sched'} aria-pressed={tab === 'sched'} onClick={() => pick('sched')}>Розклад</button>
          <button role="tab" aria-selected={tab === 'season'} aria-pressed={tab === 'season'} onClick={() => pick('season')}>Івенти{live(ev) > 0 && <span className="evdot" aria-label={`${live(ev)} триває`}>{live(ev)}</span>}</button>
          <button role="tab" aria-selected={tab === 'promo'} aria-pressed={tab === 'promo'} onClick={() => pick('promo')}>Промокоди{live(pr) > 0 && <span className="evdot" aria-label={`${live(pr)} діє`}>{live(pr)}</span>}</button>
        </div>
      </div>

      {tab === 'sched' && <EventList compact />}

      {tab !== 'sched' && isStaff && missing && <p className="err">Таблиць ще немає: запусти <code>supabase/migrations/0025_season_events_promos.sql</code> у Supabase → SQL Editor.</p>}

      {tab === 'season' && (edit?.kind === 'season' ? <SeasonForm row={edit.row} done={() => { setEdit(null); load(); }} /> : <>
        {events === null ? <p className="empty">Завантаження…</p> : !ev.length ? <p className="empty">Зараз сезонних івентів немає. Щойно з'явиться новий — він буде тут.</p> :
          <div className="list" style={{ gap: 8 }}>{ev.map(e => (
            <article key={e.id} className={'sv' + (e.ph.kind === 'now' ? ' on' : '')}>
              <div className="sv-top"><b>{e.title}</b><PhasePill ph={e.ph} /></div>
              <small className="sv-dates">{range(e.starts_on, e.ends_on, today)}</small>
              {e.description && <p className="sv-txt">{e.description}</p>}
              <div className="row">
                {e.link && <a className="h-more" href={e.link} target="_blank" rel="noopener noreferrer">Детальніше →<span className="vh"> (відкриється в новій вкладці)</span></a>}
                {isStaff && <StaffActions table="season_events" id={e.id} onEdit={() => setEdit({ kind: 'season', row: e })} done={load} />}
              </div>
            </article>))}</div>}
        {isStaff && !missing && <button type="button" className="btn ghost sm" onClick={() => setEdit({ kind: 'season', row: { starts_on: today, ends_on: today } })}><Icon name="plus" size={16} />Додати івент</button>}
      </>)}

      {tab === 'promo' && (edit?.kind === 'promo' ? <PromoForm row={edit.row} done={() => { setEdit(null); load(); }} /> : <>
        {promos === null ? <p className="empty">Завантаження…</p> : !pr.length ? <p className="empty">Діючих промокодів зараз немає.</p> :
          <div className="list" style={{ gap: 8 }}>{pr.map(p => <PromoCard key={p.id} p={p} today={today} staff={isStaff} onEdit={() => setEdit({ kind: 'promo', row: p })} done={load} />)}</div>}
        {isStaff && !missing && <button type="button" className="btn ghost sm" onClick={() => setEdit({ kind: 'promo', row: { starts_on: today, ends_on: today } })}><Icon name="plus" size={16} />Додати промокод</button>}
      </>)}
    </div>
  );
}

function PromoCard({ p, today, staff, onEdit, done }: { p: Promo & { ph: Phase }; today: string; staff: boolean; onEdit: () => void; done: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(p.code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* без доступу до буфера — код видно й так */ } };
  const soon = p.ph.kind === 'soon';
  return (
    <article className={'sv promo' + (p.ph.kind === 'now' ? ' on' : '')}>
      <div className="sv-top">
        <button type="button" className="pcode" onClick={copy} disabled={soon} title={soon ? 'Код ще не діє' : 'Скопіювати код'}>
          <span className="mono">{p.code}</span><Icon name={copied ? 'check' : 'copy'} size={15} /><span className="vh">{copied ? 'скопійовано' : 'скопіювати'}</span>
        </button>
        <PhasePill ph={p.ph} />
      </div>
      <dl className="pmeta">
        <div><dt>Що отримаєш</dt><dd>{p.reward}</dd></div>
        <div><dt>Відіграти</dt><dd>{p.playtime_hours == null || Number(p.playtime_hours) === 0 ? 'без умови' : `${String(p.playtime_hours).replace('.', ',')} год`}</dd></div>
        <div><dt>Діє</dt><dd>{range(p.starts_on, p.ends_on, today)}</dd></div>
      </dl>
      {p.note && <p className="sv-txt">{p.note}</p>}
      {staff && <div className="row"><StaffActions table="promo_codes" id={p.id} onEdit={onEdit} done={done} /></div>}
    </article>
  );
}

/* «Змінити» й «Видалити» (друге натискання — підтвердження) — для адміна й редакторів */
function StaffActions({ table, id, onEdit, done }: { table: 'season_events' | 'promo_codes'; id: number; onEdit: () => void; done: () => void }) {
  const [sure, setSure] = useState(false);
  async function del() {
    if (!sure) { setSure(true); setTimeout(() => setSure(false), 3000); return; }
    await supabase!.from(table).delete().eq('id', id); done();
  }
  return <span className="row sv-staff"><button type="button" className="btn ghost sm" onClick={onEdit}>Змінити</button><button type="button" className="btn ghost sm" onClick={del}>{sure ? 'Так, видалити' : 'Видалити'}</button></span>;
}

const dateOk = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const saveErr = (m: string) => (/row-level|permission/i.test(m) ? 'Додавати можуть лише адмін і редактори.' : 'Не вдалося зберегти: ' + m);

function SeasonForm({ row, done }: { row: Partial<SeasonEvent>; done: () => void }) {
  const [f, setF] = useState({ title: row.title || '', description: row.description || '', starts_on: row.starts_on || '', ends_on: row.ends_on || '', link: row.link || '' });
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(x => ({ ...x, [k]: e.target.value }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.title.trim()) return setMsg('Вкажи назву івенту.');
    /* дата кінця необов'язкова (specs/018): без неї івент триває, доки його не приберуть */
    if (!dateOk(f.starts_on) || (f.ends_on && (!dateOk(f.ends_on) || f.ends_on < f.starts_on))) return setMsg('Перевір дати: кінець не раніше за початок (або залиш кінець порожнім).');
    if (f.link.trim() && !/^https:\/\//.test(f.link.trim())) return setMsg('Посилання має починатися з https://');
    const v = { title: f.title.trim(), description: f.description.trim(), starts_on: f.starts_on, ends_on: f.ends_on || null, link: f.link.trim() };
    setBusy(true);
    const { error } = row.id ? await supabase!.from('season_events').update(v).eq('id', row.id) : await supabase!.from('season_events').insert(v);
    setBusy(false);
    if (error) return setMsg(saveErr(error.message));
    done();
  }
  return (
    <form className="form cols svform" onSubmit={save}>
      <label className="fld">Назва<input value={f.title} onChange={set('title')} maxLength={80} placeholder="Найттаун: Хелловін" autoFocus /></label>
      <label className="fld">З<input type="date" value={f.starts_on} onChange={set('starts_on')} /></label>
      <label className="fld">По (включно, необов'язково)<input type="date" value={f.ends_on} onChange={set('ends_on')} /></label>
      <label className="fld">Посилання (необов'язково)<input value={f.link} onChange={set('link')} placeholder="https://forum.quant5.com.ua/…" /></label>
      <label className="fld wide">Опис<textarea value={f.description} onChange={set('description')} maxLength={600} rows={3} placeholder="Що відбувається, де шукати, які нагороди" /></label>
      <div className="row wide"><button className="btn acc" disabled={busy}>{row.id ? 'Зберегти' : 'Додати івент'}</button><button type="button" className="btn ghost" onClick={done}>Скасувати</button></div>
      {msg && <p className="err wide" role="alert">{msg}</p>}
    </form>
  );
}

function PromoForm({ row, done }: { row: Partial<Promo>; done: () => void }) {
  const [f, setF] = useState({ code: row.code || '', reward: row.reward || '', playtime: row.playtime_hours == null ? '' : String(row.playtime_hours), starts_on: row.starts_on || '', ends_on: row.ends_on || '', note: row.note || '' });
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(x => ({ ...x, [k]: e.target.value }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.code.trim()) return setMsg('Вкажи промокод.');
    if (!f.reward.trim()) return setMsg('Напиши, що гравець отримає.');
    const h = f.playtime.trim() ? Number(f.playtime.replace(',', '.')) : null;
    if (h !== null && !(h >= 0)) return setMsg('Години — число, наприклад 3 або 1,5.');
    if (!dateOk(f.starts_on) || !dateOk(f.ends_on) || f.ends_on < f.starts_on) return setMsg('Перевір дати: кінець не раніше за початок.');
    const v = { code: f.code.trim(), reward: f.reward.trim(), playtime_hours: h, starts_on: f.starts_on, ends_on: f.ends_on, note: f.note.trim() };
    setBusy(true);
    const { error } = row.id ? await supabase!.from('promo_codes').update(v).eq('id', row.id) : await supabase!.from('promo_codes').insert(v);
    setBusy(false);
    if (error) return setMsg(saveErr(error.message));
    done();
  }
  return (
    <form className="form cols svform" onSubmit={save}>
      <label className="fld">Промокод<input value={f.code} onChange={set('code')} maxLength={40} placeholder="HALLOWEEN26" autoFocus /></label>
      <label className="fld">Скільки відіграти, год<input value={f.playtime} onChange={set('playtime')} inputMode="decimal" placeholder="порожньо — без умови" /></label>
      <label className="fld">З<input type="date" value={f.starts_on} onChange={set('starts_on')} /></label>
      <label className="fld">По (включно)<input type="date" value={f.ends_on} onChange={set('ends_on')} /></label>
      <label className="fld wide">Що отримаєш<input value={f.reward} onChange={set('reward')} maxLength={200} placeholder="50 000 $ і кейс «Хелловін»" /></label>
      <label className="fld wide">Примітка (необов'язково)<textarea value={f.note} onChange={set('note')} maxLength={300} rows={2} placeholder="Де ввести код, обмеження" /></label>
      <div className="row wide"><button className="btn acc" disabled={busy}>{row.id ? 'Зберегти' : 'Додати промокод'}</button><button type="button" className="btn ghost" onClick={done}>Скасувати</button></div>
      {msg && <p className="err wide" role="alert">{msg}</p>}
    </form>
  );
}
