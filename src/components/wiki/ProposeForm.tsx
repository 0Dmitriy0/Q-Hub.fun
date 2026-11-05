import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { uploadProof } from '../../lib/images';
import { dbError, diff, FIELDS, parseInput, similar, slugFromName, SOURCES, toInput, validate, type Data, type Section } from '../../lib/wiki';
import Icon from '../Icon';
import DiffView from './DiffView';

/* «Запропонувати правку» / «Додати» / «Прибрати сторінку» (specs/043 US1, US2, FR-015): форма за полями розділу.
   Картка не змінюється, поки модератор не прийме — це гарантує база (wiki_decide, 0057). Гість — вхід через Discord
   з поверненням до тієї самої форми (FR-007, намір у sessionStorage) */
export type ProposeTarget = { section: Section; id: string | null; data: Data; version?: number; title: string };
const INTENT = 'qhub-wiki-intent';

export function saveIntent(section: Section, id: string | null, mode: 'edit' | 'new' | 'hide') {
  try { sessionStorage.setItem(INTENT, JSON.stringify({ section, id, mode })); } catch { /* без сховища — просто без автовідкриття */ }
}
/* намір після входу: один раз, лише для свого розділу */
export function takeIntent(section: Section): { id: string | null; mode: 'edit' | 'new' | 'hide' } | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(INTENT) || 'null');
    if (!v || v.section !== section) return null;
    sessionStorage.removeItem(INTENT); return { id: v.id ?? null, mode: v.mode ?? 'edit' };
  } catch { return null; }
}

/* options — варіанти списків, яких немає в FIELDS (категорії мапи); для нової сторінки початкові значення — target.data */
export default function ProposeForm({ target, mode, list, onClose, options }: {
  target: ProposeTarget | null; mode: 'edit' | 'new' | 'hide'; list?: { id: string | number; name: string }[]; onClose: () => void;
  options?: Record<string, [string, string][]>;
}) {
  const { session, signIn } = useAuth();
  const { pathname, search } = useLocation();
  const dlg = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [slug, setSlug] = useState(''); const [slugTouched, setSlugTouched] = useState(false);
  const [source, setSource] = useState(''); const [note, setNote] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState(''); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);
  const [ban, setBan] = useState('');
  const section = target?.section ?? 'job';
  const fields = useMemo(() => FIELDS[section].map(f => (options?.[f.key] ? { ...f, options: options[f.key] } : f)), [section, options]);

  useEffect(() => {
    if (!target) { dlg.current?.close(); return; }
    const f: Record<string, string | boolean> = {};
    for (const x of fields) f[x.key] = toInput(x, target.data[x.key]);
    /* нова сторінка: у списках — перший варіант, а не порожнє значення, якого немає серед варіантів */
    if (mode === 'new') for (const x of fields) if (x.type === 'select' && !target.data[x.key] && x.options?.length) f[x.key] = x.options[0][0];
    setForm(f); setSlug(''); setSlugTouched(false); setSource(''); setNote(''); setProof(null); setTouched({}); setMsg(''); setDone(false);
    dlg.current?.showModal();
    /* заборона (FR-013): пояснення замість форми */
    const uid = session?.user.id;
    if (supabase && uid) supabase.from('wiki_bans').select('reason').eq('user_id', uid).maybeSingle().then(({ data }) => setBan(data?.reason ?? ''));
  }, [target, mode]);

  const next: Data = useMemo(() => Object.fromEntries(fields.map(f => [f.key, parseInput(f, form[f.key] ?? '')])), [form, fields]);
  const changes = useMemo(() => (target && mode === 'edit' ? diff(section, target.data, next) : {}), [next, target, mode, section]);
  const newData: Data = useMemo(() => {
    if (mode !== 'new') return {};
    const d: Data = {};
    for (const f of fields) { const v = next[f.key]; if (!(v === '' || v == null || (Array.isArray(v) && !v.length) || (f.type === 'bool' && !v && f.key !== 'legal'))) d[f.key] = v; }
    if (section === 'job') { d.id = slugTouched ? slug : slugFromName(String(next.name ?? '')); if (!('legal' in d)) d.legal = !!next.legal; }
    return d;
  }, [next, mode, fields, section, slug, slugTouched]);
  const errors = useMemo(() => (mode === 'hide' ? {} : validate(section, mode === 'new' ? newData : changes, mode === 'new')), [mode, section, newData, changes]);
  const dupes = mode === 'new' && list ? similar(String(next.name ?? ''), list) : [];

  if (!target) return <dialog ref={dlg} className="modal wmodal" onClose={onClose} />;
  const title = mode === 'new' ? `Додати: ${target.title}` : mode === 'hide' ? `Прибрати сторінку «${target.title}»` : `Правка: ${target.title}`;

  async function send() {
    setTouched(Object.fromEntries(fields.map(f => [f.key, true])));
    if (!source) { setMsg('Вкажи, звідки знаєш.'); return; }
    if (mode === 'hide' && !note.trim()) { setMsg('Напиши, чому сторінку треба прибрати.'); return; }
    if (mode === 'edit' && !Object.keys(changes).length) { setMsg('Ти нічого не змінив.'); return; }
    if (Object.keys(errors).length) { setMsg(Object.values(errors)[0]); return; }
    if (!supabase || !session) return;
    setBusy(true); setMsg('');
    const id = crypto.randomUUID();
    let proof_path = '';
    try { if (proof) proof_path = await uploadProof(proof, `${session.user.id}/${id}.webp`); }
    catch (e) { setBusy(false); setMsg('Не вдалося завантажити скрін: ' + (e as Error).message); return; }
    const { error } = await supabase.from('wiki_proposals').insert({
      id, section, target_id: mode === 'new' ? null : target!.id, kind: mode,
      data: mode === 'new' ? newData : mode === 'edit' ? changes : {}, base_version: target!.version ?? null,
      source, source_note: note.trim().slice(0, 300), proof_path,
    });
    setBusy(false);
    if (error) { if (proof_path) supabase.storage.from('wiki-proof').remove([proof_path]); setMsg(dbError(error)); return; }
    setDone(true);
  }

  const setVal = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));
  return (
    <dialog ref={dlg} className="modal wmodal" aria-labelledby="wp-t" onClose={onClose} onClick={e => { if (e.target === dlg.current) onClose(); }}>
      <div className="modal-box">
        <div className="row between"><h2 id="wp-t">{title}</h2>
          <button type="button" className="hud-b" onClick={onClose} aria-label="Закрити" title="Закрити"><Icon name="x" size={18} /></button></div>
        {!session ? (
          <div className="wp-login">
            <p>Пропонувати правки можуть гравці з входом через Discord — так модератор бачить, хто автор, а твоє ім'я з'явиться на картці.</p>
            <button type="button" className="btn acc" onClick={() => { saveIntent(section, target.id, mode); signIn(pathname + search); }}><Icon name="user" />Увійти через Discord</button>
          </div>
        ) : done ? (
          <div className="wp-done" role="status">
            <p><b>Надіслано на розгляд.</b> Картка зміниться, коли модератор прийме правку. Статус — у <Link to="/kabinet/pravky" onClick={onClose}>кабінеті → «Мої правки»</Link>.</p>
            <button type="button" className="btn acc" onClick={onClose}>Готово</button>
          </div>
        ) : ban ? (
          <p className="err" role="alert">Тобі заборонено пропонувати правки: {ban}. Питання — у Discord Q-Hub.</p>
        ) : (
          <form className="form wp-form" noValidate onSubmit={e => { e.preventDefault(); send(); }}>
            {mode !== 'hide' && fields.map(f => {
              const err = touched[f.key] ? errors[f.key] : '';
              const id = 'wp-' + f.key;
              return (
                <div key={f.key} className={'fld' + (f.type === 'list' || f.type === 'longtext' ? ' wide' : '')}>
                  {f.type === 'bool'
                    ? <label className="mcheck"><input type="checkbox" checked={!!form[f.key]} onChange={e => setVal(f.key, e.target.checked)} />{f.label}</label>
                    : <label htmlFor={id}>{f.label}{f.required && mode === 'new' ? ' *' : ''}</label>}
                  {f.type === 'select' && <select id={id} value={String(form[f.key] ?? '')} onChange={e => setVal(f.key, e.target.value)} onBlur={() => setTouched(t => ({ ...t, [f.key]: true }))}>
                    {f.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
                  {(f.type === 'text' || f.type === 'int') && <input id={id} inputMode={f.type === 'int' ? 'numeric' : undefined} value={String(form[f.key] ?? '')}
                    aria-invalid={!!err || undefined} aria-describedby={err ? id + '-e' : undefined}
                    onChange={e => setVal(f.key, e.target.value)} onBlur={() => setTouched(t => ({ ...t, [f.key]: true }))} />}
                  {(f.type === 'longtext' || f.type === 'list') && <textarea id={id} rows={f.type === 'list' ? 3 : 5} value={String(form[f.key] ?? '')}
                    aria-invalid={!!err || undefined} aria-describedby={err ? id + '-e' : undefined}
                    onChange={e => setVal(f.key, e.target.value)} onBlur={() => setTouched(t => ({ ...t, [f.key]: true }))} />}
                  {f.type === 'list' && !err && <small className="muted">Кожен пункт — окремий рядок.</small>}
                  {f.hint && !err && <small className="muted">{f.hint}</small>}
                  {f.key === 'name' && dupes.length > 0 && <small className="warn">Можливо, це вже є: {dupes.map(d => d.name).join(', ')}</small>}
                  {err && <small id={id + '-e'} className="err">{err}</small>}
                </div>
              );
            })}
            {mode === 'new' && section === 'job' && (
              <div className="fld wide"><label htmlFor="wp-slug">Адреса сторінки</label>
                <input id="wp-slug" className="mono" value={slugTouched ? slug : slugFromName(String(next.name ?? ''))} onChange={e => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }} />
                <small className={errors.id && touched.name ? 'err' : 'muted'}>{errors.id && touched.name ? errors.id : '/wiki/roboty?job=' + (slugTouched ? slug : slugFromName(String(next.name ?? '')) || '…')}</small></div>
            )}
            {mode === 'edit' && Object.keys(changes).length > 0 && <div className="wide"><h3 className="wp-h">Що зміниться</h3><DiffView section={section} old={target.data} changes={changes} /></div>}
            <fieldset className="fld wide wp-src"><legend>Звідки знаєш? *</legend>
              <div className="seg">{SOURCES.map(([k, l]) => <button key={k} type="button" aria-pressed={source === k} className={source === k ? 'on' : ''} onClick={() => setSource(k)}>{l}</button>)}</div>
              <input aria-label="Посилання чи пояснення" placeholder={mode === 'hide' ? 'Чому прибрати (наприклад: роботу прибрали з гри в патчі 02.11)' : 'Посилання чи пояснення — необов\'язково (наприклад: перевірив у грі 05.11)'}
                value={note} maxLength={300} onChange={e => setNote(e.target.value)} />
              <label className="wp-proof">Скрін-доказ — необов'язково. Бачать лише ти й модератори, після рішення його видаляють.
                <input type="file" accept="image/*" onChange={e => setProof(e.target.files?.[0] ?? null)} /></label>
            </fieldset>
            <p className="muted wide wp-rule"><Icon name="shield" size={14} />Лише з гри, Discord чи власного досвіду. Не копіюй з інших фан-сайтів — таку правку відхилять.</p>
            {msg && <p className="err wide" role="alert">{msg}</p>}
            <div className="row wide">
              <button className="btn acc" disabled={busy}>{busy ? 'Надсилаю…' : mode === 'hide' ? 'Запропонувати прибрати' : 'Надіслати на розгляд'}</button>
              <button type="button" className="btn ghost" onClick={onClose}>Скасувати</button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
