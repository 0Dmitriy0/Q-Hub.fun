import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import PicUpload from '../components/PicUpload';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { steps } from '../lib/guide';

/* «Як поставити мапу в гру» (specs/023): постійна адреса /mapa/v-gru, щоб давати посиланням у Discord.
   Кроки пише адмін тут же, без випуску сайту (public.guides, 0035); гравці бачать лише опубліковану інструкцію з датою
   перевірки (FR-007). Сайт кроків не вигадує: поки їх немає — чесно «готуємо» */
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
  return (
    <div className="guide">
      <Link className="h-more" to="/mapa?game=1">← До «Карти для гри»</Link>
      <h1>Як поставити мапу Q-Hub у гру</h1>
      <p className="muted guide-pc"><Icon name="download" size={16} />Ставити мапу треба на комп'ютері, де встановлена GTA V. З телефона можна лише прочитати інструкцію.</p>
      {g === undefined ? <p className="empty">Завантаження…</p>
        : edit && isAdmin ? <GuideForm g={g} done={() => { setEdit(false); load(); }} />
        : !g || (!g.published && !isAdmin) || !steps(g.install).length ? (
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
            <Section title="Як поставити" text={g.install} />
            <Section title="Повернути як було" text={g.restore} />
            <Section title="Не вийшло?" text={g.faq} />
            {g.discord_url && <p>Не знайшов своєї проблеми — <a href={g.discord_url} target="_blank" rel="noopener noreferrer">напиши в Discord Q-Hub</a>.</p>}
            {isAdmin && <button type="button" className="btn ghost sm" onClick={() => setEdit(true)}>Змінити інструкцію</button>}
          </>
        )}
    </div>
  );
}

function Section({ title, text }: { title: string; text: string }) {
  const list = steps(text);
  if (!list.length) return null;
  return (
    <section className="guide-sec">
      <h2>{title}</h2>
      <ol className="guide-steps">
        {list.map((s, i) => <li key={i}>{s.text && <p>{s.text}</p>}{s.image && <img src={s.image} alt={`Знімок до кроку ${i + 1}`} loading="lazy" />}</li>)}
      </ol>
    </section>
  );
}

function GuideForm({ g, done }: { g: Guide | null; done: () => void }) {
  const [f, setF] = useState({ install: g?.install || '', restore: g?.restore || '', faq: g?.faq || '', permission_url: g?.permission_url || '', discord_url: g?.discord_url || '', checked_on: g?.checked_on || '', published: !!g?.published });
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const area = (k: 'install' | 'restore' | 'faq', label: string, rows: number) => (
    <label className="fld wide">{label}<textarea value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} rows={rows} /></label>);
  async function save() {
    if (f.published && !f.checked_on) return setMsg('Щоб опублікувати, вкажи дату, коли перевірив кроки на грі.');
    for (const u of [f.permission_url, f.discord_url]) if (u && !/^https:\/\//.test(u.trim())) return setMsg('Посилання мають починатися з https://');
    setBusy(true); setMsg('');
    const { error } = await supabase!.from('guides').update({ ...f, permission_url: f.permission_url.trim(), discord_url: f.discord_url.trim(), checked_on: f.checked_on || null, updated_at: new Date().toISOString() }).eq('slug', SLUG);
    setBusy(false);
    if (error) return setMsg(/guides/.test(error.message) ? 'Таблиці ще немає: запусти supabase/migrations/0035_guides.sql у Supabase → SQL Editor.' : 'Не вдалося зберегти: ' + error.message);
    done();
  }
  return (
    <div className="card form cols svform">
      <p className="muted wide">Кожен крок — одна дія; кроки розділяй порожнім рядком. Знімок до кроку — рядок <span className="mono">Знімок: https://…</span> (кнопка нижче завантажить картинку й допише цей рядок у «Як поставити»).</p>
      {area('install', 'Як поставити', 12)}
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
