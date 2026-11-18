import { useEffect, useMemo, useState } from 'react';
import AdminSection from './AdminSection';
import {
  dropGlossaryCache, hideTerm, loadGlossaryAdmin, revertTerm, saveTerm, termHistory, unhideTerm, type AdminTerm, type TermVersion,
} from '../../lib/glossary';
import type { GlossaryTerm } from '../../desktop/rulesSearch';

/* Глосарій RP-термінів (specs/093 US3): admin і moderator додають, змінюють, прибирають і відкочують терміни.
   Кожна дія — версія з автором (0080); права перевіряє база. Програма підхоплює зміни за ≤ 10 хв. */

const ACTION: Record<TermVersion['action'], string> = { create: 'додано', edit: 'змінено', hide: 'прибрано', unhide: 'повернуто', revert: 'відкочено' };
const when = (s: string) => new Date(s).toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const lines = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean);
type Form = { term: string; aliases: string; full_name: string; description: string; related: string };
const EMPTY: Form = { term: '', aliases: '', full_name: '', description: '', related: '' };
const toForm = (t: GlossaryTerm): Form => ({ term: t.term, aliases: t.aliases.join('\n'), full_name: t.full_name, description: t.description, related: t.related_rules.join('\n') });

function check(f: Form) {
  const al = lines(f.aliases), rel = lines(f.related);
  return {
    term: !f.term.trim() ? 'Додайте скорочення.' : f.term.trim().length > 12 ? 'Скорочення — до 12 символів.' : '',
    aliases: al.length > 20 ? 'Не більше 20 назв.' : al.some(a => a.length > 80) ? 'Кожна назва — до 80 символів.' : '',
    full_name: f.full_name.length > 80 ? 'Повна назва — до 80 символів.' : '',
    description: !f.description.trim() ? 'Додайте пояснення.' : f.description.trim().length > 300 ? 'Пояснення — до 300 символів.' : '',
    related: rel.length > 10 ? 'Не більше 10 пунктів.' : rel.some(r => r.length > 40) ? 'Кожен пункт — до 40 символів.' : rel.some(r => !/^\S.*\s\d+(\.\d+)*$/.test(r)) ? 'Формат: скорочення документа й номер, напр. «ЗП 6.9».' : '',
  };
}

function TermForm({ initial, id, onDone, onCancel }: { initial: Form; id: string | null; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState(initial);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const e = check(f);
  const bad = Object.values(e).some(Boolean);
  const set = (k: keyof Form) => (ev: { target: { value: string } }) => setF(x => ({ ...x, [k]: ev.target.value }));
  const blur = (k: keyof Form) => () => setTouched(t => ({ ...t, [k]: true }));
  const show = (k: keyof Form) => (touched[k] && e[k] ? <small className="err">{e[k]}</small> : null);

  async function submit() {
    setTouched({ term: true, aliases: true, full_name: true, description: true, related: true });
    if (bad || busy) return;
    setBusy(true); setErr('');
    try {
      await saveTerm(id, { term: f.term.trim(), aliases: lines(f.aliases), full_name: f.full_name.trim(), description: f.description.trim(), related_rules: lines(f.related) });
      dropGlossaryCache();
      onDone();
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }

  return (
    <form className="adm-form" onSubmit={ev => { ev.preventDefault(); submit(); }}>
      <div className="fld"><label htmlFor="gl-term"><b>Скорочення</b></label>
        <input id="gl-term" value={f.term} onChange={set('term')} onBlur={blur('term')} placeholder="ДМ" aria-invalid={touched.term && !!e.term || undefined} />{show('term')}</div>
      <div className="fld"><label htmlFor="gl-full"><b>Повна назва</b> <span className="muted">(необов'язково)</span></label>
        <input id="gl-full" value={f.full_name} onChange={set('full_name')} onBlur={blur('full_name')} placeholder="DeathMatch" />{show('full_name')}</div>
      <div className="fld"><label htmlFor="gl-al"><b>Інші назви</b> <span className="muted">— кожна з нового рядка: латиницею, синоніми</span></label>
        <textarea id="gl-al" rows={4} value={f.aliases} onChange={set('aliases')} onBlur={blur('aliases')} placeholder={'DM\nвбивство без причини'} />{show('aliases')}</div>
      <div className="fld"><label htmlFor="gl-rel"><b>Пов'язані пункти</b> <span className="muted">— кожен з нового рядка, напр. «ЗП 6.9»</span></label>
        <textarea id="gl-rel" rows={3} value={f.related} onChange={set('related')} onBlur={blur('related')} placeholder="ЗП 6.9" />{show('related')}</div>
      <div className="fld" style={{ gridColumn: '1 / -1' }}><label htmlFor="gl-desc"><b>Пояснення</b></label>
        <textarea id="gl-desc" rows={3} value={f.description} onChange={set('description')} onBlur={blur('description')} aria-describedby="gl-desc-n" />
        <span id="gl-desc-n">{show('description') ?? <small className="muted">{f.description.trim().length} / 300</small>}</span></div>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="row">
        <button type="submit" className="btn acc sm" disabled={busy}>{busy ? 'Зберігаю…' : id ? 'Зберегти зміни' : 'Додати термін'}</button>
        <button type="button" className="btn ghost sm" onClick={onCancel}>Скасувати</button>
      </div>
    </form>
  );
}

function History({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof termHistory>> | null>(null);
  const [err, setErr] = useState('');
  const load = () => termHistory(id).then(setRows).catch(x => setErr((x as Error).message));
  useEffect(() => { load(); }, [id]);   // eslint-disable-line react-hooks/exhaustive-deps
  async function revert(v: number) {
    if (!confirm(`Відкотити термін до версії ${v}? Поточний вміст збережеться в історії.`)) return;
    try { await revertTerm(id, v); dropGlossaryCache(); await load(); onChanged(); } catch (x) { setErr((x as Error).message); }
  }
  if (err) return <p className="err" role="alert">{err}</p>;
  if (!rows) return <p className="muted">Вантажу історію…</p>;
  return (
    <ol className="adm-gl-hist">
      {rows.map((r, i) => (
        <li key={r.version_no}>
          <span className="mono">v{r.version_no}</span> · {ACTION[r.action]} · {r.author_nick || 'система'} · {when(r.created_at)}
          <div className="muted">{r.data.term}{r.data.full_name ? ` (${r.data.full_name})` : ''} — {r.data.description}{r.data.hidden ? ' · прибраний' : ''}</div>
          {i > 0 && <button type="button" className="btn ghost sm" onClick={() => revert(r.version_no)}>Відкотити до цієї</button>}
        </li>))}
    </ol>
  );
}

export default function AdminGlossary() {
  const [rows, setRows] = useState<AdminTerm[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [edit, setEdit] = useState<{ id: string | null; form: Form } | null>(null);
  const [hist, setHist] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const load = () => loadGlossaryAdmin().then(r => { setRows(r); setErr(''); }).catch(x => setErr('Не вдалося завантажити глосарій: ' + (x as Error).message));
  useEffect(() => { load(); }, []);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter(r => (showHidden || !r.hidden)
      && (!s || [r.term, r.full_name, r.description, ...r.aliases].some(x => x.toLowerCase().includes(s))))
      .sort((a, b) => a.term.localeCompare(b.term, 'uk'));
  }, [rows, q, showHidden]);

  async function toggle(r: AdminTerm) {
    setMsg('');
    try {
      if (r.hidden) await unhideTerm(r.id); else await hideTerm(r.id);
      dropGlossaryCache(); await load();
      setMsg(r.hidden ? `«${r.term}» повернуто.` : `«${r.term}» прибрано — повернути можна з «Показати прибрані».`);
    } catch (x) { setMsg((x as Error).message); }
  }
  const done = (text: string) => { setEdit(null); setMsg(text); load(); };

  return (
    <AdminSection title="Глосарій" hint="RP-терміни для пошуку в Alt+Q і вкладки WIKI «Глосарій». Зміни з'являються в програмі гравців протягом 10 хвилин; кожна зміна зберігається в історії."
      loading={!rows && !err} error={err} onRetry={load}
      actions={<button type="button" className="btn acc sm" onClick={() => { setEdit({ id: null, form: EMPTY }); setHist(null); }}>Додати термін</button>}>
      <div className="adm-form-row">
        <div className="fld adm-search"><label htmlFor="gl-q">Пошук</label><input id="gl-q" value={q} onChange={e => setQ(e.target.value)} placeholder="Скорочення, назва чи пояснення" /></div>
        <label className="row"><input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} /> Показати прибрані</label>
      </div>
      {msg && <p className="muted" role="status">{msg}</p>}
      {edit && edit.id === null && <TermForm initial={edit.form} id={null} onDone={() => done('Термін додано.')} onCancel={() => setEdit(null)} />}
      {rows && !list.length && <p className="adm-empty">{q ? 'Такого терміну немає.' : 'Термінів ще немає.'}</p>}
      <ul className="adm-list">
        {list.map(r => (
          <li key={r.id} className="adm-row">
            <div className="adm-row-main">
              <b>{r.term}{r.full_name ? ` · ${r.full_name}` : ''}{r.hidden && <span className="pill warn"> прибраний</span>}</b>
              <span className="muted">{r.description}</span>
              {(r.aliases.length > 0 || r.related_rules.length > 0) && <small className="muted">{r.aliases.join(', ')}{r.related_rules.length ? ` · пункти: ${r.related_rules.join(', ')}` : ''}</small>}
              <small className="muted">v{r.version} · {when(r.updated_at)}</small>
            </div>
            <div className="adm-row-act">
              {!r.hidden && <button type="button" className="btn ghost sm" onClick={() => { setEdit({ id: r.id, form: toForm(r) }); setHist(null); }}>Змінити</button>}
              <button type="button" className="btn ghost sm" aria-expanded={hist === r.id} onClick={() => setHist(h => (h === r.id ? null : r.id))}>Історія</button>
              <button type="button" className="btn ghost sm" onClick={() => toggle(r)}>{r.hidden ? 'Повернути' : 'Прибрати'}</button>
            </div>
            {edit?.id === r.id && <TermForm initial={edit.form} id={r.id} onDone={() => done(`«${r.term}» збережено.`)} onCancel={() => setEdit(null)} />}
            {hist === r.id && <div className="adm-form"><History id={r.id} onChanged={load} /></div>}
          </li>))}
      </ul>
    </AdminSection>
  );
}
