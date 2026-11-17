import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { CATEGORY_LABEL, type Category, type Period } from '../../lib/activityStats';
import AdminSection from './AdminSection';

/* Сповіщення гравцям (specs/091 US4–US5; contracts/ui.md): форма надсилання й історія зі статусами прочитання й Discord.
   Надсилає лише admin (notification_send перевіряє в базі). id генерується при відкритті форми — подвійне «Надіслати» не дає дубля. */

export interface NotifyDraft {
  recipient?: { id: string; nick: string | null };
  title?: string; body?: string; category?: Category | 'other';
  place?: number | null; period?: Period | null;
}

interface Row {
  id: string; recipient_nick: string | null; sender_nick: string | null; title: string; body: string; category: string; prize: string;
  place: number | null; created_at: string; read_at: string | null; discord_status: 'queued' | 'sent' | 'failed'; discord_error: string;
}

const when = (s: string) => new Date(s).toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const CATS: (Category | 'other')[] = ['prices', 'marks', 'guides', 'other'];
const LIMITS = { title: 120, body: 1500, prize: 200 };

function DiscordState({ r }: { r: Pick<Row, 'discord_status' | 'discord_error'> }) {
  if (r.discord_status === 'sent') return <span className="pill good">доставлено</span>;
  if (r.discord_status === 'queued') return <span className="pill warn" title={r.discord_error || undefined}>в черзі</span>;
  return <span className="pill bad" title={r.discord_error}>не доставлено{r.discord_error ? ` — ${r.discord_error}` : ''}</span>;
}

/* форма сповіщення (модальне вікно); draft — що підставити (з топу — шаблон переможця) */
export function NotifyDialog({ draft, onClose, onSent }: { draft: NotifyDraft | null; onClose: () => void; onSent?: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [id, setId] = useState('');
  const [who, setWho] = useState<{ id: string; nick: string | null } | null>(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ id: string; nick: string }[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [cat, setCat] = useState<Category | 'other'>('other');
  const [prize, setPrize] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!draft) { dlg.current?.close(); return; }
    setId(crypto.randomUUID());
    setWho(draft.recipient ?? null); setQ(''); setFound([]);
    setTitle(draft.title ?? ''); setBody(draft.body ?? ''); setCat(draft.category ?? 'other'); setPrize('');
    setTouched(false); setErr(''); setBusy(false);
    dlg.current?.showModal();
  }, [draft]);

  /* пошук отримувача за ніком (від 2 символів) */
  useEffect(() => {
    if (!draft || who || q.trim().length < 2 || !supabase) { setFound([]); return; }
    const t = setTimeout(() => {
      supabase!.rpc('profiles_search_nick', { p_q: q.trim() }).then(({ data }) => setFound((data ?? []) as { id: string; nick: string }[]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, who, draft]);

  const errs = {
    who: who ? '' : 'Оберіть гравця.',
    title: !title.trim() ? 'Додайте заголовок.' : title.trim().length > LIMITS.title ? `Заголовок — до ${LIMITS.title} символів.` : '',
    body: !body.trim() ? 'Додайте текст.' : body.trim().length > LIMITS.body ? `Текст — до ${LIMITS.body} символів.` : '',
    prize: prize.trim().length > LIMITS.prize ? `Приз — до ${LIMITS.prize} символів.` : '',
  };
  const bad = Object.values(errs).some(Boolean);

  async function send() {
    setTouched(true);
    if (bad || busy || !supabase || !who) return;
    setBusy(true); setErr('');
    const { error } = await supabase.rpc('notification_send', {
      p_id: id, p_recipient: who.id, p_title: title.trim(), p_body: body.trim(), p_category: cat, p_prize: prize.trim(),
      p_place: draft?.place ?? null, p_from: draft?.period?.from ?? null, p_to: draft?.period?.to ?? null,
    });
    setBusy(false);
    if (error) { setErr('Не вдалося надіслати: ' + error.message + '. Спробуйте ще раз — дубля не буде.'); return; }
    onSent?.();
    onClose();
  }

  return (
    <dialog ref={dlg} className="modal" aria-labelledby="nd-title" onClose={onClose} onClick={e => { if (e.target === dlg.current) onClose(); }}>
      {draft && (
        <form className="modal-box" onSubmit={e => { e.preventDefault(); send(); }}>
          <div className="row between">
            <h2 id="nd-title">Сповіщення гравцю</h2>
            <button type="button" className="btn ghost sm" onClick={onClose}>Закрити</button>
          </div>
          <div className="fld">
            <label htmlFor="nd-who"><b>Кому</b></label>
            {who
              ? <div className="row"><b>{who.nick || 'без ніку'}</b>{!draft.recipient && <button type="button" className="btn ghost sm" onClick={() => setWho(null)}>Змінити</button>}</div>
              : <>
                <input id="nd-who" autoComplete="off" placeholder="Нік у Q-Hub" value={q} onChange={e => setQ(e.target.value)}
                  aria-invalid={touched && !!errs.who || undefined} aria-describedby="nd-who-e" />
                {found.length > 0 && (
                  <ul className="nd-found">
                    {found.map(f => <li key={f.id}><button type="button" className="btn ghost sm" onClick={() => setWho(f)}>{f.nick}</button></li>)}
                  </ul>)}
                {q.trim().length >= 2 && !found.length && <small className="muted">Нікого не знайдено.</small>}
              </>}
            <span id="nd-who-e">{touched && errs.who && <small className="err">{errs.who}</small>}</span>
          </div>
          <div className="fld">
            <label htmlFor="nd-title-in"><b>Заголовок</b></label>
            <input id="nd-title-in" value={title} maxLength={LIMITS.title + 20} onChange={e => setTitle(e.target.value)}
              aria-invalid={touched && !!errs.title || undefined} aria-describedby="nd-title-e" />
            <span id="nd-title-e">{touched && errs.title && <small className="err">{errs.title}</small>}</span>
          </div>
          <div className="fld">
            <label htmlFor="nd-body"><b>Текст</b></label>
            <textarea id="nd-body" rows={5} value={body} onChange={e => setBody(e.target.value)}
              aria-invalid={touched && !!errs.body || undefined} aria-describedby="nd-body-e" />
            <span id="nd-body-e">
              {touched && errs.body ? <small className="err">{errs.body}</small> : <small className="muted">{body.trim().length} / {LIMITS.body}</small>}
            </span>
          </div>
          <div className="adm-form-row">
            <div className="fld">
              <label htmlFor="nd-cat"><b>Категорія конкурсу</b></label>
              <select id="nd-cat" value={cat} onChange={e => setCat(e.target.value as Category | 'other')}>
                {CATS.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
            </div>
            <div className="fld">
              <label htmlFor="nd-prize"><b>Приз</b> <span className="muted">(необов'язково)</span></label>
              <input id="nd-prize" value={prize} onChange={e => setPrize(e.target.value)} placeholder="Напр. 500 000$ у грі"
                aria-invalid={touched && !!errs.prize || undefined} aria-describedby="nd-prize-e" />
              <span id="nd-prize-e">{touched && errs.prize && <small className="err">{errs.prize}</small>}</span>
            </div>
          </div>
          <p className="muted adm-note">Сповіщення з'явиться в дзвіночку на сайті. Бот також спробує надіслати його в особисті повідомлення Discord — статус видно в історії.</p>
          {err && <p className="err" role="alert">{err}</p>}
          <div className="row">
            <button type="submit" className="btn acc" disabled={busy}>{busy ? 'Надсилаю…' : 'Надіслати сповіщення'}</button>
          </div>
        </form>
      )}
    </dialog>
  );
}

/* перемикач DM (discord_bot.dm_on, 0078): вимкнено — бот одразу ставить «не доставлено: надсилання вимкнено» */
function DmToggle() {
  const [on, setOn] = useState<boolean | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    supabase?.from('discord_bot').select('dm_on').eq('id', true).maybeSingle()
      .then(({ data, error }) => { if (error) setErr('Перемикач DM недоступний — застосуйте міграцію 0078.'); else setOn(data?.dm_on ?? true); });
  }, []);
  async function toggle(v: boolean) {
    if (!supabase) return;
    setOn(v); setErr('');
    const { error } = await supabase.from('discord_bot').update({ dm_on: v }).eq('id', true);
    if (error) { setOn(!v); setErr('Не збережено: ' + error.message); }
  }
  if (err) return <small className="err">{err}</small>;
  if (on === null) return null;
  return <label className="row"><input type="checkbox" checked={on} onChange={e => toggle(e.target.checked)} /> Надсилати також в особисті повідомлення Discord</label>;
}

export default function AdminNotifications() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');
  const [draft, setDraft] = useState<NotifyDraft | null>(null);

  async function load() {
    if (!supabase) { setErr('Немає з\'єднання з базою.'); return; }
    const { data, error } = await supabase.rpc('notifications_admin_list', { p_limit: 100 });
    if (error) { setErr('Не вдалося завантажити історію: ' + error.message); return; }
    setErr(''); setRows((data ?? []) as Row[]);
  }
  /* SC-006: статус «прочитано» з'являється сам — оновлення раз на хвилину, поки вкладка відкрита */
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <AdminSection title="Сповіщення гравцям" hint="Історія надісланих сповіщень: прочитання на сайті й доставка в Discord. Оновлюється щохвилини."
      loading={!rows && !err} error={err} onRetry={load}
      actions={<div className="row"><button type="button" className="btn ghost sm" onClick={load}>Оновити</button>
        <button type="button" className="btn acc sm" onClick={() => setDraft({})}>Нове сповіщення</button></div>}>
      <DmToggle />
      {rows && !rows.length && <p className="adm-empty">Сповіщень ще не надсилали. Надішліть переможцю з «Статистики активності» або кнопкою «Нове сповіщення».</p>}
      {rows && rows.length > 0 && (
        <div className="adm-scroll">
          <table className="adm-table">
            <thead><tr><th>Кому</th><th>Заголовок</th><th>Категорія</th><th>Приз</th><th>Коли</th><th>Від кого</th><th>На сайті</th><th>Discord</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td><b>{r.recipient_nick || 'без ніку'}</b></td>
                  <td title={r.body}>{r.title}</td>
                  <td>{CATEGORY_LABEL[r.category as Category | 'other'] ?? r.category}{r.place ? ` · ${r.place} місце` : ''}</td>
                  <td>{r.prize || '—'}</td>
                  <td className="mono">{when(r.created_at)}</td>
                  <td>{r.sender_nick || '—'}</td>
                  <td>{r.read_at ? <span className="pill good" title={when(r.read_at)}>прочитано {when(r.read_at)}</span> : <span className="pill">не прочитано</span>}</td>
                  <td><DiscordState r={r} /></td>
                </tr>))}
            </tbody>
          </table>
        </div>)}
      <NotifyDialog draft={draft} onClose={() => setDraft(null)} onSent={load} />
    </AdminSection>
  );
}
