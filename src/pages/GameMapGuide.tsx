import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import PicUpload from '../components/PicUpload';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { guide, joinTiles, pieces, splitTiles, steps, tileError, version, type GuideStage, type GuideStep, type GuideTile } from '../lib/guide';

/* «Як поставити мапу в гру» (specs/023): постійна адреса /mapa/v-gru, щоб давати посиланням у Discord.
   Кроки пише адмін тут же, без випуску сайту (public.guides, 0035); гравці бачать лише опубліковану інструкцію з датою
   перевірки (FR-007). Сайт кроків не вигадує: поки їх немає — чесно «готуємо».
   specs/027: плитки «Що потрібно», етапи зі змістом, позначки «зроблено» в браузері, шляхи з «Копіювати» */
type Guide = { title: string; install: string; restore: string; faq: string; permission_url: string; discord_url: string; checked_on: string | null; published: boolean };
const SLUG = 'game-map';

export default function GameMapGuide() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [g, setG] = useState<Guide | null | undefined>(undefined);
  const [edit, setEdit] = useState(false);
  const load = () => {
    if (!supabase) { setG(null); return; }
    supabase.from('guides').select('title,install,restore,faq,permission_url,discord_url,checked_on,published').eq('slug', SLUG).maybeSingle()
      .then(({ data }) => setG((data as Guide) || null));
  };
  useEffect(load, [role]);

  const date = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
  const parsed = g ? guide(g.install) : null;
  const stages = parsed?.stages || [];
  const toc = stages.filter(s => s.title);
  return (
    <div className={'guide' + (toc.length > 1 && !edit ? ' has-toc' : '')}>
      <div className="guide-main">
        <Link className="h-more" to="/mapa?game=1">← До «Карти для гри»</Link>
        <h1>Як поставити мапу Q-Hub у гру</h1>
        <p className="muted guide-pc"><Icon name="download" size={16} />Ставити мапу треба на комп'ютері, де встановлена GTA V. З телефона можна лише прочитати інструкцію.</p>
        {g === undefined ? <p className="empty">Завантаження…</p>
          : edit && isAdmin ? <GuideForm g={g} done={() => { setEdit(false); load(); }} />
          : !g || (!g.published && !isAdmin) || !stages.length ? (
            <div className="card guide-wait">
              <h2>Інструкцію готуємо</h2>
              <p className="muted">Кожен крок перевіряємо на справжній грі, перш ніж показувати. Поки що питай у Discord Q-Hub.</p>
              {isAdmin && <button type="button" className="btn acc sm" onClick={() => setEdit(true)}>Написати інструкцію</button>}
            </div>
          ) : (
            <>
              {!g.published && <p className="err">Чернетка — гравці її ще не бачать. Опублікуй з датою перевірки.</p>}
              {g.permission_url && <p className="guide-ok"><Icon name="shield" size={16} />Заміну мінікарти дозволено адміністрацією QuantRP — <a href={g.permission_url} target="_blank" rel="noopener noreferrer">підтвердження</a>.</p>}
              {g.checked_on && <p className="muted">Перевірено на грі {date(g.checked_on)}.</p>}
              {toc.length > 1 && <Toc stages={stages} mobile />}
              <Tiles tiles={parsed!.tiles} />
              <Install stages={stages} ver={version(g.install)} />
              <Section title="Повернути як було" text={g.restore} />
              <Section title="Не вийшло?" text={g.faq} />
              {g.discord_url && <p>Не знайшов своєї проблеми — <a href={g.discord_url} target="_blank" rel="noopener noreferrer">напиши в Discord Q-Hub</a>.</p>}
              {isAdmin && <button type="button" className="btn ghost sm" onClick={() => setEdit(true)}>Змінити інструкцію</button>}
            </>
          )}
      </div>
      {toc.length > 1 && !edit && g && <aside className="guide-aside"><Toc stages={stages} /></aside>}
    </div>
  );
}

const stageId = (i: number) => 'etap-' + (i + 1);
/* перехід до етапу: розгорнути його, якщо згорнутий, і прокрутити (BrowserRouter — без #-адрес) */
function go(i: number) {
  const el = document.getElementById(stageId(i)) as HTMLDetailsElement | null;
  if (!el) return;
  el.open = true;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.querySelector('summary')?.focus({ preventScroll: true });
}

function Toc({ stages, mobile }: { stages: GuideStage[]; mobile?: boolean }) {
  const list = (
    <ol className="guide-toc-list">
      {stages.map((s, i) => s.title && <li key={i}><button type="button" onClick={() => go(i)}><span className="mono">{s.first}</span>{s.title}</button></li>)}
    </ol>
  );
  return mobile
    ? <details className="guide-toc mobile"><summary>Етапи інструкції</summary>{list}</details>
    : <nav className="guide-toc" aria-label="Етапи інструкції"><h2>Етапи</h2>{list}</nav>;
}

function Tiles({ tiles }: { tiles: GuideTile[] }) {
  if (!tiles.length) return null;
  return (
    <section className="guide-sec">
      <h2>Що потрібно</h2>
      <div className="guide-tiles">
        {tiles.map(t => {
          const body = <>
            <b>{t.name}{t.optional && <span className="guide-opt">необов'язково</span>}</b>
            {t.why && <small>{t.why}</small>}
            <span className="guide-go">{t.external ? <>Завантажити <Icon name="ext" size={14} /><span className="sr">(зовнішній сайт, нова вкладка)</span></> : <>Відкрити на сайті <Icon name="map" size={14} /></>}</span>
            {t.external && <span className="guide-host">{host(t.url)}</span>}
          </>;
          return t.external
            ? <a key={t.name} className={'guide-tile' + (t.optional ? ' opt' : '')} href={t.url} target="_blank" rel="noopener noreferrer">{body}</a>
            : <Link key={t.name} className={'guide-tile' + (t.optional ? ' opt' : '')} to={t.url}>{body}</Link>;
        })}
      </div>
    </section>
  );
}
const host = (u: string) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return ''; } };

/* позначки «зроблено» — лише в цьому браузері, ключ з версією кроків; приватний режим — просто без позначок */
function useDone(ver: string) {
  const key = 'qhub-guide-done:' + ver;
  const [done, setDone] = useState<Set<number>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]') as number[]); } catch { return new Set(); }
  });
  const save = (s: Set<number>) => {
    setDone(s);
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('qhub-guide-done:') && k !== key) localStorage.removeItem(k);
      if (s.size) localStorage.setItem(key, JSON.stringify([...s])); else localStorage.removeItem(key);
    } catch { /* без сховища позначки живуть до перезавантаження */ }
  };
  const toggle = (n: number) => { const s = new Set(done); if (s.has(n)) s.delete(n); else s.add(n); save(s); };
  return { done, toggle, reset: () => save(new Set()) };
}

function Install({ stages, ver }: { stages: GuideStage[]; ver: string }) {
  const { done, toggle, reset } = useDone(ver);
  const total = stages.reduce((n, s) => n + s.steps.length, 0);
  return (
    <section className="guide-sec">
      <div className="guide-head">
        <h2>Як поставити</h2>
        <span className="muted">Зроблено {done.size} з {total}</span>
        {done.size > 0 && <button type="button" className="btn ghost sm" onClick={reset}>Почати знову</button>}
      </div>
      {stages.map((s, i) => {
        const list = <Steps list={s.steps} first={s.first} done={done} toggle={toggle} />;
        if (!s.title) return <div key={i}>{list}</div>;
        const left = s.steps.filter((_, j) => !done.has(s.first + j)).length;
        return (
          <details key={i} className="guide-stage" id={stageId(i)} open>
            <summary><h3>{s.title}</h3><span className={'guide-left' + (left ? '' : ' ok')}>{left ? `${s.steps.length - left} з ${s.steps.length}` : <><Icon name="check" size={14} />готово</>}</span></summary>
            {list}
          </details>
        );
      })}
    </section>
  );
}

function Steps({ list, first, done, toggle }: { list: GuideStep[]; first: number; done?: Set<number>; toggle?: (n: number) => void }) {
  return (
    <ol className="guide-steps" start={first}>
      {list.map((s, j) => {
        const n = first + j, ok = !!done?.has(n);
        return (
          <li key={n} className={(s.warn ? 'warn' : '') + (ok ? ' done' : '')}>
            {s.warn && <span className="guide-warn"><Icon name="alert" size={16} />Важливо</span>}
            {s.text && <p><Text text={s.text} /></p>}
            {s.image && <img src={s.image} alt={`Знімок до кроку ${n}`} loading="lazy" />}
            {toggle && <button type="button" className="guide-done" aria-pressed={ok} onClick={() => toggle(n)}><Icon name="check" size={14} />{ok ? 'Зроблено' : 'Позначити зробленим'}</button>}
          </li>
        );
      })}
    </ol>
  );
}

function Text({ text }: { text: string }) {
  return <>{pieces(text).map((p, i) =>
    p.k === 'url' ? <a key={i} href={p.v} target="_blank" rel="noopener noreferrer">{p.v}</a>
      : p.k === 'path' ? <Path key={i} v={p.v} />
      : p.k === 'btn' ? <kbd key={i} className="guide-btn">{p.v}</kbd>
      : p.v)}</>;
}

function Path({ v }: { v: string }) {
  const [ok, setOk] = useState(false);
  const t = useRef(0);
  async function copy() {
    try { await navigator.clipboard.writeText(v); } catch { return; }
    setOk(true); clearTimeout(t.current); t.current = window.setTimeout(() => setOk(false), 1500);
  }
  return (
    <span className="guide-path">
      <code>{v}</code>
      <button type="button" onClick={copy} aria-label={'Копіювати шлях ' + v}><Icon name={ok ? 'check' : 'copy'} size={14} />{ok ? 'Скопійовано' : 'Копіювати'}</button>
      <span className="sr" role="status">{ok ? 'Скопійовано' : ''}</span>
    </span>
  );
}

function Section({ title, text }: { title: string; text: string }) {
  const list = steps(text);
  if (!list.length) return null;
  return (
    <section className="guide-sec">
      <h2>{title}</h2>
      <Steps list={list} first={1} />
    </section>
  );
}

function GuideForm({ g, done }: { g: Guide | null; done: () => void }) {
  const split = splitTiles(g?.install || '');
  const [f, setF] = useState({ tiles: split.tiles, install: split.rest, restore: g?.restore || '', faq: g?.faq || '', permission_url: g?.permission_url || '', discord_url: g?.discord_url || '', checked_on: g?.checked_on || '', published: !!g?.published });
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const area = (k: 'tiles' | 'install' | 'restore' | 'faq', label: string, rows: number) => (
    <label className="fld wide">{label}<textarea value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} rows={rows} /></label>);
  async function save() {
    if (f.published && !f.checked_on) return setMsg('Щоб опублікувати, вкажи дату, коли перевірив кроки на грі.');
    for (const u of [f.permission_url, f.discord_url]) if (u && !/^https:\/\//.test(u.trim())) return setMsg('Посилання мають починатися з https://');
    const te = tileError(f.tiles); if (te) return setMsg(te);
    setBusy(true); setMsg('');
    const { tiles, ...rest } = f;
    const { error } = await supabase!.from('guides').update({ ...rest, install: joinTiles(tiles, f.install), permission_url: f.permission_url.trim(), discord_url: f.discord_url.trim(), checked_on: f.checked_on || null, updated_at: new Date().toISOString() }).eq('slug', SLUG);
    setBusy(false);
    if (error) return setMsg(/guides/.test(error.message) ? 'Таблиці ще немає: запусти supabase/migrations/0035_guides.sql у Supabase → SQL Editor.' : 'Не вдалося зберегти: ' + error.message);
    done();
  }
  return (
    <div className="card form cols svform">
      {area('tiles', 'Що потрібно — плитки: рядок на плитку', 5)}
      <p className="muted wide">Плитка: <span className="mono">Назва | навіщо | посилання</span>, для необов'язкової — ще <span className="mono">| необов'язково</span>. Посилання — https://… або сторінка сайту (<span className="mono">/mapa?game=1</span>). Порядок рядків — порядок плиток.</p>
      <p className="muted wide">Кожен крок — одна дія; кроки розділяй порожнім рядком. Етап — окремий рядок <span className="mono">Етап: Назва</span>, кроки після нього потрапляють у цей етап. Попередження — крок, що починається з <span className="mono">Важливо:</span>. Кнопку програми бери в квадратні дужки: <span className="mono">[Редагувати]</span>. Шляхи з <span className="mono">\</span> (GTAV\update) отримають «Копіювати» самі. Знімок до кроку — рядок <span className="mono">Знімок: https://…</span> (кнопка нижче завантажить картинку й допише цей рядок у «Як поставити»).</p>
      {area('install', 'Як поставити', 16)}
      <div className="row wide"><PicUpload label="Завантажити знімок" path={`guides/game-map-${Date.now().toString(36)}.webp`} frame={{ w: 1600, h: 900 }} onDone={async url => { setF(x => ({ ...x, install: x.install.trimEnd() + '\nЗнімок: ' + url + '\n' })); }} /><span className="muted">знімок — до останнього кроку «Як поставити»</span></div>
      {area('restore', 'Повернути як було (до 5 кроків)', 6)}
      {area('faq', 'Не вийшло? (проблема й рішення — одним кроком)', 8)}
      <label className="fld">Підтвердження дозволу адміністрації (посилання)<input value={f.permission_url} onChange={e => setF({ ...f, permission_url: e.target.value })} placeholder="https://discord.com/channels/…" /></label>
      <label className="fld">Discord Q-Hub для питань<input value={f.discord_url} onChange={e => setF({ ...f, discord_url: e.target.value })} placeholder="https://discord.gg/…" /></label>
      <label className="fld">Перевірено на грі<input type="date" value={f.checked_on} onChange={e => setF({ ...f, checked_on: e.target.value })} /></label>
      <label className="mcheck"><input type="checkbox" checked={f.published} onChange={e => setF({ ...f, published: e.target.checked })} />Опублікувати для гравців</label>
      <div className="row wide"><button type="button" className="btn acc" disabled={busy} onClick={save}>Зберегти</button><button type="button" className="btn ghost" onClick={done}>Скасувати</button></div>
      {msg && <p className="err wide" role="alert">{msg}</p>}
    </div>
  );
}
