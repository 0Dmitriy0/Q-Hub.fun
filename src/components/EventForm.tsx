import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { SeasonEvent } from '../lib/seasons';
import { levelsFromText, suggestSlug } from '../lib/eventsWiki';
import PicUpload from './PicUpload';

/* форма івенту для staff (specs/055 US4): одна на WIKI й головну. Поля season_events (0051) + прив'язка до категорій
   папки «Івенти» на мапі + рівні батл пасу. Прив'язки й рівні зберігаються повною заміною набору */
type Cat = { id: string; name: string; n: number };
type Other = { id: number; slug: string; title: string };
const dateOk = (s?: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const SLUG = /^[a-z0-9-]{2,60}$/;
const saveErr = (m: string, code?: string) =>
  code === '23505' || /duplicate key|season_events_slug_key/i.test(m) ? 'Така адреса вже є в іншого івенту — зміни її.'
    : /row-level|permission/i.test(m) ? 'Змінювати івенти можуть лише адмін, редактори й модератори.'
      : /season_events_slug|column .* does not exist/i.test(m) ? 'Немає нових полів івентів: запусти міграцію 0051.'
        : 'Не вдалося зберегти: ' + m;

export default function EventForm({ row, onClose, onSaved }: { row: Partial<SeasonEvent>; onClose: () => void; onSaved: (e: SeasonEvent) => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [f, setF] = useState({
    title: row.title || '', slug: row.slug || '', kind: row.kind || 'event', starts_on: row.starts_on || '', ends_on: row.ends_on || '',
    description: row.description || '', body: row.body || '', link: row.link || '', prev_id: row.prev_id ? String(row.prev_id) : ''
  });
  const [image, setImage] = useState(row.image_url || '');
  const [slugTouched, setSlugTouched] = useState(!!row.slug);
  const [cats, setCats] = useState<Cat[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [others, setOthers] = useState<Other[]>([]);
  const [levels, setLevels] = useState('');
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);

  useEffect(() => { dlg.current?.showModal(); }, []);
  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const [c, o, m, l] = await Promise.all([
        supabase.from('map_categories').select('id,name').eq('grp', 'Івенти').order('sort'),
        supabase.from('season_events').select('id,slug,title').order('starts_on', { ascending: false }),
        row.id ? supabase.from('season_event_maps').select('category_id').eq('event_id', row.id) : Promise.resolve({ data: [] }),
        row.id ? supabase.from('season_event_levels').select('level,line,reward').eq('event_id', row.id).order('level') : Promise.resolve({ data: [] })
      ]);
      const list = (c.data || []) as { id: string; name: string }[];
      const counted = await Promise.all(list.map(async x => {
        const { count } = await supabase!.from('map_points').select('id', { count: 'exact', head: true }).eq('category_id', x.id);
        return { ...x, n: count ?? 0 };
      }));
      setCats(counted);
      setOthers(((o.data || []) as Other[]).filter(x => x.id !== row.id));
      setPicked(new Set(((m.data || []) as { category_id: string }[]).map(x => x.category_id)));
      setLevels(((l.data || []) as { level: number; line: string; reward: string }[]).map(x => `${x.level}; ${x.reward}; ${x.line}`).join('\n'));
    })();
  }, [row.id]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const v = e.target.value;
    setF(x => {
      const n = { ...x, [k]: v };
      /* адреса з назви, доки staff не змінив її сам */
      if (k === 'title' && !slugTouched) n.slug = suggestSlug(v, others.map(o => o.slug), +(x.starts_on.slice(0, 4) || new Date().getFullYear()));
      return n;
    });
    if (k === 'slug') setSlugTouched(true);
  };
  const lv = f.kind === 'battlepass' ? levelsFromText(levels) : { rows: [], error: null };

  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    if (!f.title.trim()) return setMsg('Вкажи назву івенту.');
    if (!SLUG.test(f.slug)) return setMsg('Адреса — від 2 до 60 символів: малі латинські літери, цифри й дефіс.');
    if (!dateOk(f.starts_on) || (f.ends_on && (!dateOk(f.ends_on) || f.ends_on < f.starts_on))) return setMsg('Перевір дати: кінець не раніше за початок (або залиш кінець порожнім).');
    if (f.link.trim() && !/^https:\/\//.test(f.link.trim())) return setMsg('Посилання має починатися з https://');
    if (lv.error) return setMsg('Рівні батл пасу. ' + lv.error);
    const v = {
      title: f.title.trim(), slug: f.slug, kind: f.kind, starts_on: f.starts_on, ends_on: f.ends_on || null,
      description: f.description.trim(), body: f.body.trim(), link: f.link.trim(), image_url: image, prev_id: f.prev_id ? +f.prev_id : null
    };
    setBusy(true);
    const r = row.id ? await supabase!.from('season_events').update(v).eq('id', row.id).select().single()
      : await supabase!.from('season_events').insert(v).select().single();
    if (r.error) { setBusy(false); return setMsg(saveErr(r.error.message, r.error.code)); }
    const saved = r.data as SeasonEvent;
    /* прив'язки до мапи й рівні — повною заміною; помилка тут не губить збережений івент */
    const del = await supabase!.from('season_event_maps').delete().eq('event_id', saved.id);
    const add = picked.size ? await supabase!.from('season_event_maps').insert([...picked].map(c => ({ event_id: saved.id, category_id: c }))) : { error: null };
    let lerr = null;
    if (f.kind === 'battlepass') {
      const d = await supabase!.from('season_event_levels').delete().eq('event_id', saved.id);
      const i = lv.rows.length ? await supabase!.from('season_event_levels').insert(lv.rows.map(x => ({ event_id: saved.id, ...x }))) : { error: null };
      lerr = d.error || i.error;
    }
    setBusy(false);
    const sub = del.error || add.error || lerr;
    if (sub) return setMsg('Івент збережено, але мапу чи рівні — ні: ' + saveErr(sub.message, sub.code) + ' Спробуй зберегти ще раз.');
    onSaved(saved);
  }

  return (
    <dialog ref={dlg} className="modal ev-form-dlg" aria-labelledby="evf-title" onClose={onClose}>
      <form className="modal-box form" onSubmit={save}>
        <div className="row between"><h2 id="evf-title">{row.id ? 'Змінити івент' : 'Новий івент'}</h2>
          <button type="button" className="btn sm ghost" onClick={onClose} aria-label="Закрити форму">✕</button></div>
        <label className="fld">Назва<input value={f.title} onChange={set('title')} maxLength={80} placeholder="Найттаун: Хелловін" autoFocus required /></label>
        <label className="fld">Адреса сторінки<input value={f.slug} onChange={set('slug')} maxLength={60} placeholder="khellovin-2026" spellCheck={false} />
          <small className="muted mono">/wiki/iventy/{f.slug || '…'}</small></label>
        <label className="fld">Тип<select value={f.kind} onChange={set('kind')}><option value="event">Івент</option><option value="battlepass">Батл пас</option></select></label>
        <div className="form cols">
          <label className="fld">З<input type="date" value={f.starts_on} onChange={set('starts_on')} required /></label>
          <label className="fld">По (включно, необов'язково)<input type="date" value={f.ends_on} onChange={set('ends_on')} /></label>
        </div>
        <label className="fld">Короткий опис (плитка й головна)<textarea value={f.description} onChange={set('description')} maxLength={600} rows={2} placeholder="Що відбувається й чому варто взяти участь" /></label>
        <label className="fld">Повний опис<textarea value={f.body} onChange={set('body')} maxLength={20000} rows={8} placeholder={'Що робити, нагороди, умови.\n\nАбзаци — через порожній рядок. Картинка — рядок «Знімок: https://…»'} /></label>
        <label className="fld">Офіційне оголошення (необов'язково)<input value={f.link} onChange={set('link')} placeholder="https://forum.quant5.com.ua/…" /></label>
        <div className="fld">Фото (640×360)
          {row.id ? <div className="row">{image && <img src={image} alt="" className="ev-form-pic" />}
            <PicUpload label={'Фото івенту ' + f.title} path={`events/${row.id}.webp`} frame={{ w: 640, h: 360 }} onDone={async url => { setImage(url); }} />
            {image && <button type="button" className="btn sm ghost" onClick={() => setImage('')}>Прибрати</button>}</div>
            : <small className="muted">Фото можна додати після першого збереження.</small>}
        </div>
        <fieldset className="fld ev-cats"><legend>Мітки на мапі (папка «Івенти»)</legend>
          {cats.length ? cats.map(c => (
            <label key={c.id} className="row"><input type="checkbox" checked={picked.has(c.id)} onChange={e => setPicked(s => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} />
              {c.name} <span className="muted mono">{c.n}</span></label>))
            : <small className="muted">У папці «Івенти» на мапі ще немає категорій.</small>}
        </fieldset>
        <label className="fld">Минулого разу (необов'язково)<select value={f.prev_id} onChange={set('prev_id')}>
          <option value="">—</option>{others.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}</select></label>
        {f.kind === 'battlepass' && <label className="fld">Рівні й нагороди — рядок «рівень; нагорода; free або paid»
          <textarea value={levels} onChange={e => setLevels(e.target.value)} rows={6} spellCheck={false} placeholder={'1; 5 000 $; free\n1; Кейс «Осінь»; paid\n2; Бензин 20 л'} />
          {lv.error ? <small className="err">{lv.error}</small> : <small className="muted">Рівнів: {lv.rows.length}</small>}</label>}
        <div className="row"><button className="btn acc" disabled={busy}>{busy ? 'Зберігаю…' : row.id ? 'Зберегти' : 'Додати івент'}</button>
          <button type="button" className="btn ghost" onClick={onClose}>Скасувати</button></div>
        {msg && <p className="err" role="alert">{msg}</p>}
      </form>
    </dialog>
  );
}
