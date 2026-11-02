import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { useDiscord } from '../lib/brand';
import { guide, type GuideStage } from '../lib/guide';
import { CATEGORIES, byCategory, guidePieces, slugOf, slugOk, type WikiGuide } from '../lib/wikiGuides';

/* WIKI → Гайди (/wiki/haidy, /wiki/haidy/<адреса>). Текст пише адмін на сайті, як інструкцію мапи (public.guides, 0046):
   гравці бачать лише опубліковане з датою перевірки на грі, адмін — ще й чернетки. Інструкція «Як поставити мапу в гру»
   живе на своїй сторінці (/mapa/v-gru), тут на неї лише посилання */
const COLS = 'slug,title,category,summary,body,sort,checked_on,published';
const date = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const NO_TABLE = 'Таблиці ще немає: запусти supabase/migrations/0046_wiki_guides.sql у Supabase → SQL Editor.';

function useGuides() {
  const { role } = useAuth();
  const [list, setList] = useState<WikiGuide[] | null>(null);
  const [err, setErr] = useState('');
  const load = () => {
    if (!supabase) { setList([]); return; }
    supabase.from('guides').select(COLS).neq('category', '').then(({ data, error }) => {
      setErr(error ? NO_TABLE : ''); setList((data as WikiGuide[]) || []);
    });
  };
  useEffect(load, [role]);
  return { list, err, load };
}

export function GuidesList() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const { list, err } = useGuides();
  const nav = useNavigate();
  const groups = byCategory(list || []);
  return (
    <div className="wguides">
      <div className="row between">
        <p className="muted">Покрокові гайди від гравців Q-Hub. Кожен перевірено на грі — дата перевірки є в гайді.</p>
        {isAdmin && <button type="button" className="btn acc sm" onClick={() => nav('/wiki/haidy/novyi')}><Icon name="plus" size={16} />Новий гайд</button>}
      </div>
      {isAdmin && err && <p className="err">{err}</p>}
      {list === null ? <p className="empty">Завантаження…</p> : <>
        {groups.map(({ category, guides }) => (
          <section key={category} className="wguides-sec">
            <h2>{category}</h2>
            <div className="wguides-grid">
              {guides.map(g => (
                <Link key={g.slug} className={'card wguide' + (g.published ? '' : ' draft')} to={'/wiki/haidy/' + g.slug}>
                  {!g.published && <span className="wguide-draft">Чернетка</span>}
                  <b>{g.title}</b>
                  {g.summary && <span className="muted">{g.summary}</span>}
                  <small className="mono">{g.checked_on ? 'перевірено ' + date(g.checked_on) : 'ще не перевірено'}</small>
                </Link>
              ))}
            </div>
          </section>
        ))}
        <section className="wguides-sec">
          <h2>Q-Hub</h2>
          <div className="wguides-grid">
            <Link className="card wguide" to="/mapa/v-gru"><b>Як поставити мапу Q-Hub у гру</b><span className="muted">Заміна мінікарти GTA V через OpenIV: що потрібно, кроки й як повернути як було.</span></Link>
          </div>
        </section>
        {!groups.length && !isAdmin && <p className="empty">Перші гайди готуємо — кожен перевіряємо на грі, перш ніж показувати.</p>}
      </>}
    </div>
  );
}

export function GuidePage() {
  const { slug = '' } = useParams();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [g, setG] = useState<WikiGuide | null | undefined>(undefined);
  const [edit, setEdit] = useState(slug === 'novyi');
  const [discord] = useDiscord();
  const nav = useNavigate();
  const load = () => {
    if (slug === 'novyi') { setG(null); return; }
    if (!supabase) { setG(null); return; }
    supabase.from('guides').select(COLS).eq('slug', slug).neq('category', '').maybeSingle().then(({ data }) => setG((data as WikiGuide) || null));
  };
  useEffect(load, [slug, role]);   // eslint-disable-line react-hooks/exhaustive-deps

  const stages = g ? guide(g.body).stages : [];
  const toc = stages.filter(s => s.title);
  if (edit && isAdmin) return (
    <div className="guide"><div className="guide-main">
      <Link className="h-more" to="/wiki/haidy">← Усі гайди</Link>
      <h1>{g ? 'Змінити гайд' : 'Новий гайд'}</h1>
      <GuideEdit g={g ?? null} done={s => { setEdit(false); if (s === '' || (!s && slug === 'novyi')) nav('/wiki/haidy'); else if (s && s !== slug) nav('/wiki/haidy/' + s); else load(); }} />
    </div></div>
  );
  return (
    <div className={'guide' + (toc.length > 1 ? ' has-toc' : '')}>
      <div className="guide-main">
        <Link className="h-more" to="/wiki/haidy">← Усі гайди</Link>
        {g === undefined ? <p className="empty">Завантаження…</p> : !g ? (
          <div className="card guide-wait"><h2>Гайду не знайдено</h2><p className="muted">Можливо, його ще не опублікували або адреса змінилась. <Link to="/wiki/haidy">Усі гайди</Link></p></div>
        ) : <>
          <span className="lbl">{g.category}</span>
          <h1>{g.title}</h1>
          {g.summary && <p className="muted">{g.summary}</p>}
          {!g.published && <p className="err">Чернетка — гравці її ще не бачать. Перевір кроки на грі й опублікуй з датою перевірки.</p>}
          {g.checked_on && <p className="muted">Перевірено на грі {date(g.checked_on)}. Щось змінилось у грі? {discord ? <a href={discord} target="_blank" rel="noopener noreferrer">Напиши в Discord Q-Hub</a> : 'Напиши в Discord Q-Hub'}.</p>}
          {toc.length > 1 && <Toc stages={stages} mobile />}
          {stages.map((s, i) => s.title
            ? <section key={i} className="guide-sec" id={'etap-' + (i + 1)}><h2>{s.title}</h2><Steps stage={s} /></section>
            : <Steps key={i} stage={s} />)}
          {isAdmin && <button type="button" className="btn ghost sm" onClick={() => setEdit(true)}>Змінити гайд</button>}
        </>}
      </div>
      {toc.length > 1 && g && <aside className="guide-aside"><Toc stages={stages} /></aside>}
    </div>
  );
}

function Toc({ stages, mobile }: { stages: GuideStage[]; mobile?: boolean }) {
  const go = (i: number) => document.getElementById('etap-' + (i + 1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const list = <ol className="guide-toc-list">{stages.map((s, i) => s.title && <li key={i}><button type="button" onClick={() => go(i)}><span className="mono">{s.first}</span>{s.title}</button></li>)}</ol>;
  return mobile ? <details className="guide-toc mobile"><summary>Зміст</summary>{list}</details> : <nav className="guide-toc" aria-label="Зміст гайду"><h2>Зміст</h2>{list}</nav>;
}

function Steps({ stage }: { stage: GuideStage }) {
  return (
    <ol className="guide-steps" start={stage.first}>
      {stage.steps.map((s, j) => (
        <li key={j} className={s.warn ? 'warn' : ''}>
          {s.warn && <span className="guide-warn"><Icon name="alert" size={16} />Важливо</span>}
          {s.text && <p><Text text={s.text} /></p>}
          {s.image && <img src={s.image} alt={`Знімок до кроку ${stage.first + j}`} loading="lazy" />}
        </li>
      ))}
    </ol>
  );
}

function Text({ text }: { text: string }) {
  return <>{guidePieces(text).map((p, i) =>
    p.k === 'url' ? <a key={i} href={p.v} target="_blank" rel="noopener noreferrer">{p.v}</a>
      : p.k === 'site' ? <Link key={i} to={p.v}>{p.v}</Link>
      : p.k === 'path' ? <code key={i}>{p.v}</code>
      : p.k === 'btn' ? <kbd key={i} className="guide-btn">{p.v}</kbd>
      : p.v)}</>;
}

/* редактор гайду (адмін): адреса задається один раз, при створенні; опублікувати можна лише з датою перевірки */
function GuideEdit({ g, done }: { g: WikiGuide | null; done: (slug?: string) => void }) {
  const [f, setF] = useState({ slug: g?.slug || '', title: g?.title || '', category: g?.category || CATEGORIES[0], summary: g?.summary || '', body: g?.body || '', sort: String(g?.sort ?? 100), checked_on: g?.checked_on || '', published: !!g?.published });
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [sure, setSure] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF(x => ({ ...x, [k]: e.target.value }));
  const slug = g ? g.slug : (f.slug || slugOf(f.title));
  async function save() {
    if (!f.title.trim()) return setMsg('Вкажи назву гайду.');
    if (!f.category.trim()) return setMsg('Вкажи розділ.');
    if (!slugOk(slug)) return setMsg('Адреса — 2–40 латинських літер, цифр або дефісів.');
    if (!guide(f.body).stages.some(s => s.steps.length)) return setMsg('Напиши хоча б один крок.');
    if (f.published && !f.checked_on) return setMsg('Щоб опублікувати, вкажи дату, коли перевірив кроки на грі.');
    const row = { title: f.title.trim(), category: f.category.trim(), summary: f.summary.trim(), body: f.body, sort: Number(f.sort) || 100, checked_on: f.checked_on || null, published: f.published, updated_at: new Date().toISOString() };
    setBusy(true); setMsg('');
    const { error } = g ? await supabase!.from('guides').update(row).eq('slug', g.slug) : await supabase!.from('guides').insert({ slug, ...row });
    setBusy(false);
    if (error) return setMsg(/duplicate|unique/i.test(error.message) ? 'Гайд з такою адресою вже є — зміни адресу.' : /category|column/i.test(error.message) ? NO_TABLE : 'Не вдалося зберегти: ' + error.message);
    done(slug);
  }
  async function del() {
    if (!g) return;
    if (!sure) { setSure(true); setTimeout(() => setSure(false), 3000); return; }
    const { error } = await supabase!.from('guides').delete().eq('slug', g.slug);
    if (error) return setMsg('Не вдалося видалити: ' + error.message);
    done('');   // '' — видалено: назад до списку
  }
  return (
    <div className="card form cols svform">
      <label className="fld wide">Назва<input value={f.title} onChange={set('title')} maxLength={120} placeholder="Перший день на Quant RP" autoFocus /></label>
      <label className="fld">Розділ<input value={f.category} onChange={set('category')} list="wg-cats" maxLength={40} /><datalist id="wg-cats">{CATEGORIES.map(c => <option key={c} value={c} />)}</datalist></label>
      {g ? <label className="fld">Адреса<input value={'/wiki/haidy/' + g.slug} readOnly /></label>
        : <label className="fld">Адреса (латиницею)<input value={f.slug} onChange={set('slug')} placeholder={slugOf(f.title) || 'pershyi-den'} maxLength={40} /></label>}
      <label className="fld">Порядок у розділі<input value={f.sort} onChange={set('sort')} inputMode="numeric" /></label>
      <label className="fld wide">Коротко — що в гайді (видно в списку)<input value={f.summary} onChange={set('summary')} maxLength={300} /></label>
      <p className="muted wide">Кожен крок — одна дія; кроки розділяй порожнім рядком. Розділ гайду — рядок <span className="mono">Етап: Назва</span>. Попередження — крок, що починається з <span className="mono">Важливо:</span>. Кнопку з гри — у квадратних дужках: <span className="mono">[Влаштуватися]</span>. Сторінки сайту (<span className="mono">/mapa</span>, <span className="mono">/tsiny</span>, <span className="mono">/wiki/roboty</span>) стануть посиланнями. Знімок до кроку — рядок <span className="mono">Знімок: https://…</span>.</p>
      <label className="fld wide">Текст гайду<textarea value={f.body} onChange={set('body')} rows={22} /></label>
      <label className="fld">Перевірено на грі<input type="date" value={f.checked_on} onChange={set('checked_on')} /></label>
      <label className="mcheck"><input type="checkbox" checked={f.published} onChange={e => setF(x => ({ ...x, published: e.target.checked }))} />Опублікувати для гравців</label>
      <div className="row wide">
        <button type="button" className="btn acc" disabled={busy} onClick={save}>Зберегти</button>
        <button type="button" className="btn ghost" onClick={() => done(g?.slug)}>Скасувати</button>
        {g && <button type="button" className="btn ghost" onClick={del}>{sure ? 'Так, видалити гайд' : 'Видалити'}</button>}
      </div>
      {msg && <p className="err wide" role="alert">{msg}</p>}
    </div>
  );
}
