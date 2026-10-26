import { Fragment, useEffect, useState } from 'react';
import Select from './Select';
import type { MapCategory, MapMark } from '../lib/mapData';
import {
  authorName, loadDrafts, nearby, publishDraft, purgeExpiredShots, rejectDraft, shotUrl, shotUrls, statusLabel, type MapDraft,
} from '../lib/mapDrafts';

const when = (iso: string) => new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/* вкладка «Чернетки» на мапі: точки, які редактори зняли в грі клавішею F9.
   Адмін бачить усі нові, ставить або пересуває точку, обирає категорію й публікує чи відхиляє.
   editor і moderator бачать лише свої й їхній статус — без дій (права перевіряє база, не цей інтерфейс). */
export default function MapDrafts({ isAdmin, cats, marks, point, picking, onPoint, onPick, onFocus, onPublished }: {
  isAdmin: boolean; cats: MapCategory[]; marks: MapMark[]; point: [number, number] | null; picking: boolean;
  onPoint: (p: [number, number] | null) => void; onPick: (on: boolean) => void;
  onFocus: (p: [number, number]) => void; onPublished: (m: MapMark) => void;
}) {
  const own = cats.filter(c => !c.builtin);
  /* підказка редактора: «Сміттєві баки · бак за магазином» */
  const hintText = (d: MapDraft) => [own.find(c => c.id === d.category_id)?.name, d.note?.trim()].filter(Boolean).join(' · ');
  const [drafts, setDrafts] = useState<MapDraft[] | null>(null);
  const [err, setErr] = useState('');
  const [view, setView] = useState<'new' | 'done'>('new');
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<MapDraft | null>(null);
  const [full, setFull] = useState<string | null | undefined>(undefined);   // undefined — ще вантажиться, null — не вдалося
  const [cat, setCat] = useState(''); const [name, setName] = useState(''); const [note, setNote] = useState('');
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadDrafts().then(async ({ data, error }) => {
      if (error) { setErr(error); setDrafts([]); return; }
      setDrafts(data);
      if (isAdmin) {
        const gone = await purgeExpiredShots(data);
        if (gone.length) setDrafts(ds => ds && ds.map(d => (gone.includes(d.id) ? { ...d, shot_deleted_at: new Date().toISOString() } : d)));
      }
    });
    return () => onPoint(null);   // вийшли з вкладки — маркер чернетки зникає з мапи
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  /* адмін за замовчуванням бачить нові; editor/moderator — усі свої */
  const list = (drafts || []).filter(d => !isAdmin || (view === 'new' ? d.status === 'new' : d.status !== 'new'));
  const fresh = (drafts || []).filter(d => d.status === 'new').length;
  useEffect(() => {
    const paths = list.slice(0, 40).filter(d => !d.shot_deleted_at && !thumbs[d.shot]).map(d => d.shot);
    if (paths.length) shotUrls(paths).then(u => setThumbs(t => ({ ...t, ...u })));
  }, [drafts, view]);   // eslint-disable-line react-hooks/exhaustive-deps

  function open(d: MapDraft) {
    setSel(d); setMsg(''); setFull(undefined); setName('');
    /* підказка редактора з програми — одразу у формі, адмін може змінити */
    setCat(d.category_id && own.some(c => c.id === d.category_id) ? d.category_id : ''); setNote(d.note || '');
    const p: [number, number] | null = d.x !== null && d.y !== null ? [d.x, d.y] : null;
    onPoint(p); if (p) onFocus(p);
    if (!d.shot_deleted_at) shotUrl(d.shot).then(setFull);
  }
  function close() { setSel(null); onPoint(null); onPick(false); }
  const done = (id: string, patch: Partial<MapDraft>) => { setDrafts(ds => ds && ds.map(d => (d.id === id ? { ...d, ...patch } : d))); close(); };

  async function publish() {
    if (!sel) return;
    if (!point) return setMsg('Поставте точку на мапі.');
    if (!cat) return setMsg('Оберіть категорію.');
    setBusy(true); setMsg('');
    const r = await publishDraft(sel.id, { category: cat, x: point[0], y: point[1], name: name.trim(), note: note.trim() });
    setBusy(false);
    if (r.error) return setMsg(r.error);
    onPublished({ id: 'db-' + r.pointId, dbId: r.pointId, category: cat, name: name.trim(), note: note.trim(), x: point[0], y: point[1], label: true });
    done(sel.id, { status: 'published', point_id: r.pointId!, x: point[0], y: point[1], reviewed_at: new Date().toISOString() });
  }
  async function reject() {
    if (!sel || !confirm('Відхилити чернетку? На мапу вона не потрапить.')) return;
    setBusy(true); setMsg('');
    const e = await rejectDraft(sel.id);
    setBusy(false);
    if (e) return setMsg(e);
    done(sel.id, { status: 'rejected', reviewed_at: new Date().toISOString() });
  }

  /* перед публікацією — що вже є поруч (FR-017); рахується від поточної точки й категорії, тож оновлюється при їх зміні */
  const near = isAdmin && sel?.status === 'new' && point ? nearby(point, cat, marks, drafts || [], sel.id) : [];
  const catName = (id: string) => cats.find(c => c.id === id)?.name || 'мітка';

  if (drafts === null) return <p className="muted mdr-note">Завантажую чернетки…</p>;
  if (err) return <p className="card err">{err}</p>;

  if (sel) return (
    <section className="madmin mdr-open" aria-label="Чернетка">
      <button type="button" className="btn sm ghost" onClick={close}>← До списку</button>
      <h4>{authorName(sel)} · {when(sel.taken_at)} · <span className={'mdr-st ' + sel.status}>{statusLabel(sel.status)}</span></h4>
      {sel.shot_deleted_at ? <p className="muted">Знімок уже видалено (минуло 30 днів після обробки).</p>
        : full ? <a href={full} target="_blank" rel="noreferrer" className="mdr-shot" title="Відкрити знімок у повному розмірі"><img src={full} alt="Знімок великої карти з гри" /></a>
        : full === null ? <p className="muted">Знімок не вдалося відкрити.</p>
        : <p className="muted">Завантажую знімок…</p>}
      <p className="mono mdr-xy">{point ? `X ${Math.round(point[0])} · Y ${Math.round(point[1])}` : 'Точку не визначено'}</p>
      {hintText(sel) && <p className="mdr-hint">Редактор: {hintText(sel)}</p>}
      {near.length > 0 && <p className="mdr-near" role="status">Поруч уже є: {near.slice(0, 3).map((n, i) => <Fragment key={n.kind + n.id}>{i ? ', ' : ''}
        <button type="button" onClick={() => onFocus([n.x, n.y])} title="Показати на мапі">{n.name || catName(cat)} · {Math.round(n.dist)} м</button></Fragment>)}
        {near.length > 3 && ` і ще ${near.length - 3}`}</p>}
      {isAdmin && sel.status === 'new' && <>
        <p className="muted">{point ? 'Точку можна перетягнути на мапі або поставити заново.' : 'Подивіться на знімок і поставте точку на мапі.'}</p>
        <button type="button" className={'btn sm' + (picking ? ' acc' : ' ghost')} onClick={() => onPick(!picking)} aria-pressed={picking}>{picking ? 'Клікни на мапі…' : point ? 'Поставити заново' : 'Поставити на мапі'}</button>
        <Select label="Категорія" value={cat} onChange={setCat} searchable options={own.map(c => ({ value: c.id, label: c.name, hint: c.grp }))} placeholder="Категорія" />
        <input className="min" placeholder="Назва (необов'язково)" value={name} onChange={e => setName(e.target.value)} aria-label="Назва мітки" maxLength={160} />
        <input className="min" placeholder="Примітка (необов'язково)" value={note} onChange={e => setNote(e.target.value)} aria-label="Примітка" maxLength={600} />
        <div className="mrow">
          <button type="button" className="btn sm ghost" disabled={busy} onClick={reject}>Відхилити</button>
          <button type="button" className="btn sm acc" disabled={busy || !point} onClick={publish}>Опублікувати на карті</button>
        </div>
      </>}
      {msg && <p className="mmsg" role="status">{msg}</p>}
    </section>
  );

  return (
    <section className="mdrafts" aria-label="Чернетки міток">
      {isAdmin && <div className="mseg" role="radiogroup" aria-label="Які чернетки">
        <button type="button" role="radio" aria-checked={view === 'new'} onClick={() => setView('new')}>Нові ({fresh})</button>
        <button type="button" role="radio" aria-checked={view === 'done'} onClick={() => setView('done')}>Оброблені</button>
      </div>}
      {!list.length && <p className="muted mdr-note">{isAdmin && view === 'new'
        ? 'Нових чернеток немає. Їх надсилають редактори з програми: велика карта в грі → F9.'
        : isAdmin ? 'Оброблених чернеток ще немає.' : 'Ваших чернеток ще немає. У грі відкрийте велику карту й натисніть F9 у програмі Q-Hub.'}</p>}
      <ul className="mdr-list">
        {list.map(d => (
          <li key={d.id}>
            <button type="button" onClick={() => open(d)}>
              {thumbs[d.shot] ? <img src={thumbs[d.shot]} alt="" width={64} height={36} loading="lazy" /> : <span className="mdr-ph" aria-hidden="true" />}
              <span className="mdr-t"><b>{authorName(d)}</b><small>{when(d.taken_at)}{d.x === null ? ' · точку не визначено' : ''}{hintText(d) ? ' · ' + hintText(d) : ''}</small></span>
              <span className={'mdr-st ' + d.status}>{statusLabel(d.status)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
