import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import AdminSection from './AdminSection';
import DiscordPreview from './DiscordPreview';
import { uploadCatalogImage } from '../../lib/images';
import { COVER, coverBlob, coverKind, coverVersion, drawCover } from '../../lib/newsCover';
import { newsMessage, newsTooLong, NEWS_MAX, newsDescription } from '../../../supabase/functions/discord-bot/format';

/* «Новини» (specs/060 US2): чернетки з журналу програми (changelog:…), новин сайту (site:…), вручну (manual:…) чи
   об'єднані (merged:…). Власник править, бачить вигляд у Discord і надсилає кнопкою — бот сам нічого не публікує.
   Таблиця news_drafts — лише admin (RLS, 0055); надсилання — дія send функції discord-bot (токен лише там). */
interface Draft {
  id: number; source_ref: string; title: string; added: string[]; changed: string[]; removed: string[];
  image_url: string; link: string; status: 'draft' | 'sent' | 'skipped' | 'merged'; sent_at: string | null; created_at: string;
}
type Form = { title: string; added: string; changed: string; removed: string; image_url: string; link: string };
type Filter = 'draft' | 'sent' | 'skipped';
const FILTERS: [Filter, string][] = [['draft', 'Чернетки'], ['sent', 'Надіслані'], ['skipped', 'Не публікувати']];

const ITEM_MAX = 300, TITLE_MAX = 120;
const lines = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean);
const toForm = (d: Draft): Form => ({ title: d.title, added: d.added.join('\n'), changed: d.changed.join('\n'), removed: d.removed.join('\n'), image_url: d.image_url, link: d.link });
const fromForm = (f: Form) => ({ title: f.title.trim(), added: lines(f.added), changed: lines(f.changed), removed: lines(f.removed), image_url: f.image_url.trim(), link: f.link.trim() });
const when = (s: string | null) => (s ? new Date(s).toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const SOURCE: Record<string, string> = { changelog: 'журнал програми', site: 'новини сайту', manual: 'вручну', merged: 'об\'єднана' };
const source = (ref: string) => SOURCE[ref.split(':')[0]] ?? ref;

/* що не пропустить база (0055) — людським текстом, до збереження */
function problem(f: Form): string {
  const d = fromForm(f);
  if (!d.title) return 'Напиши заголовок.';
  if (d.title.length > TITLE_MAX) return `Заголовок довший за ${TITLE_MAX} символів.`;
  const long = [...d.added, ...d.changed, ...d.removed].find(x => x.length > ITEM_MAX);
  if (long) return `Пункт «${long.slice(0, 40)}…» довший за ${ITEM_MAX} символів — розбий його на два.`;
  for (const [k, v] of [['Картинка', d.image_url], ['Посилання', d.link]]) if (v && !/^https:\/\//.test(v)) return `${k} — адреса має починатися з https://`;
  return '';
}

async function call<T>(action: string, extra: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.functions.invoke('discord-bot', { body: { action, ...extra } });
  if (error) {
    let text = 'Функція discord-bot не відповіла — її задеплоєно?';
    try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) text = b.error; } catch { /* лишаємо загальний */ }
    throw new Error(text);
  }
  return data as T;
}

export default function AdminNews() {
  const [list, setList] = useState<Draft[] | null>(null);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState<Filter>('draft');
  const [open, setOpen] = useState<number | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [pick, setPick] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [chName, setChName] = useState('');
  const [channel, setChannel] = useState<{ on: boolean; id: string }>({ on: false, id: '' });

  async function load(keep?: number) {
    setErr('');
    const [r, b] = await Promise.all([
      supabase!.from('news_drafts').select('*').order('created_at', { ascending: false }).limit(200),
      supabase!.from('discord_bot').select('news_on,news_channel_id').maybeSingle(),
    ]);
    if (r.error) { setErr('Немає таблиці чернеток — міграцію 0055_discord_bot.sql застосовано?'); return; }
    setList(r.data as Draft[]);
    if (b.data) setChannel({ on: b.data.news_on, id: b.data.news_channel_id });
    if (keep !== undefined) { const d = (r.data as Draft[]).find(x => x.id === keep); setOpen(d ? d.id : null); setForm(d ? toForm(d) : null); }
  }
  useEffect(() => { load(); }, []);

  const shown = (list ?? []).filter(d => d.status === filter);
  const cur = list?.find(d => d.id === open) ?? null;
  const preview = useMemo(() => (form ? fromForm(form) : null), [form]);
  const over = preview ? newsTooLong(preview) : 0;
  const dirty = !!(cur && form && JSON.stringify(fromForm(toForm(cur))) !== JSON.stringify(fromForm(form)));

  function openDraft(d: Draft) {
    if (dirty && !window.confirm('Є незбережені зміни в чернетці. Відкрити іншу без збереження?')) return;
    setOpen(d.id); setForm(toForm(d)); setMsg(''); setConfirm(false);
  }

  async function save(): Promise<boolean> {
    if (!cur || !form) return false;
    const p = problem(form); if (p) { setMsg(p); return false; }
    setBusy('save');
    const { error } = await supabase!.from('news_drafts').update(fromForm(form)).eq('id', cur.id);
    setBusy('');
    if (error) { setMsg('Не вдалося зберегти: ' + error.message); return false; }
    setMsg('Збережено.'); await load(cur.id); return true;
  }

  async function setStatus(status: 'skipped' | 'draft') {
    if (!cur) return;
    setBusy('status');
    const { error } = await supabase!.from('news_drafts').update({ status }).eq('id', cur.id);
    setBusy('');
    if (error) { setMsg('Не вдалося: ' + error.message); return; }
    setMsg(status === 'skipped' ? 'Сховано — у Discord не піде.' : 'Повернуто в чернетки.'); await load(cur.id);
  }

  async function send() {
    if (!cur) return;
    setConfirm(false);
    if (dirty && !(await save())) return;
    setBusy('send'); setMsg('');
    try {
      const r = await call<{ already?: boolean; channel?: string }>('send', { draft_id: cur.id });
      setMsg(r.already ? 'Цю новину вже надіслано раніше.' : `Надіслано в #${r.channel ?? 'канал новин'}.`);
    } catch (e) { setMsg((e as Error).message + ' Можна натиснути ще раз — дубля не буде.'); }
    setBusy(''); await load(cur.id);
  }

  /* підтвердження з назвою каналу: назву знає лише Discord — питаємо функцію, поки власник читає текст */
  function ask() {
    const p = problem(form!); if (p) { setMsg(p); return; }
    setConfirm(true); setMsg('');
    if (!chName) call<{ channels: { news: { name?: string } | null } }>('status', {}).then(r => setChName(r.channels.news?.name ?? '')).catch(() => {});
  }

  /* обкладинка за шаблоном Q-Hub (src/lib/newsCover.ts) → сховище catalog → адреса в «Картинка»; зберігає власник кнопкою */
  async function makeCover() {
    if (!cur || !form) return;
    setBusy('cover'); setMsg('');
    try {
      const title = form.title.trim() || cur.title;
      const cv = await drawCover({ kind: coverKind(cur.source_ref), title, version: coverVersion(title),
        date: new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }) });
      const file = new File([await coverBlob(cv)], 'cover.webp', { type: 'image/webp' });
      const url = await uploadCatalogImage(file, `news/cover-${cur.id}-${Date.now().toString(36)}.webp`, COVER);
      setForm(x => (x ? { ...x, image_url: url } : x));
      setMsg('Обкладинку зроблено — подивись у перегляді й натисни «Зберегти».');
    } catch (e) { setMsg('Не вдалося зробити обкладинку: ' + ((e as Error).message || e)); }
    setBusy('');
  }

  async function create() {
    setBusy('new');
    const { data, error } = await supabase!.from('news_drafts')
      .insert({ source_ref: 'manual:' + crypto.randomUUID(), title: 'Нова новина Q-Hub' }).select('*').single();
    setBusy('');
    if (error) { setMsg('Не вдалося створити: ' + error.message); return; }
    setFilter('draft'); await load((data as Draft).id);
  }

  /* кілька дрібних → одна новина з усіма пунктами; вихідні — merged (US2 AC5) */
  async function merge() {
    const src = (list ?? []).filter(d => pick.has(d.id)).sort((a, b) => a.created_at.localeCompare(b.created_at));
    if (src.length < 2) return;
    const all = (k: 'added' | 'changed' | 'removed') => [...new Set(src.flatMap(d => d[k]))];
    setBusy('merge');
    const { data, error } = await supabase!.from('news_drafts').insert({
      source_ref: 'merged:' + src.map(d => d.id).join(','), title: src[src.length - 1].title,
      added: all('added'), changed: all('changed'), removed: all('removed'),
      image_url: src.find(d => d.image_url)?.image_url ?? '', link: src.find(d => d.link)?.link ?? '',
    }).select('*').single();
    if (!error) await supabase!.from('news_drafts').update({ status: 'merged' }).in('id', src.map(d => d.id));
    setBusy('');
    if (error) { setMsg('Не вдалося об\'єднати: ' + error.message); return; }
    setPick(new Set()); await load((data as Draft).id);
  }

  const toggle = (id: number) => setPick(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const ready = channel.on && !!channel.id;
  const f = (k: keyof Form, label: string, rows = 0, hint = '') => (
    <label className="fld">{label}
      {rows ? <textarea rows={rows} value={form![k]} onChange={e => setForm({ ...form!, [k]: e.target.value })} />
        : <input value={form![k]} onChange={e => setForm({ ...form!, [k]: e.target.value })} placeholder={k === 'title' ? '' : 'https://…'} />}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );

  return (
    <>
      <AdminSection title="Новини" error={err} onRetry={() => load()} loading={!list && !err}
        hint="Після кожного викладання сайту з'являється чернетка з журналу програми й новин сайту. Бот публікує лише те, що ти надішлеш кнопкою."
        actions={<div className="row">
          {pick.size >= 2 && <button type="button" className="btn ghost sm" disabled={busy !== ''} onClick={merge}>Об'єднати {pick.size}</button>}
          <button type="button" className="btn acc sm" disabled={busy !== ''} onClick={create}>Нова новина</button>
        </div>}>
        {!ready && list && <p className="err">Публікацію новин вимкнено або не вказано канал новин — увімкни у вкладці «Discord-бот». Чернетки можна готувати й так.</p>}
        <div className="seg" role="tablist" aria-label="Які новини показати">
          {FILTERS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => { setFilter(k); setPick(new Set()); }}>
              {label} · {(list ?? []).filter(d => d.status === k).length}
            </button>
          ))}
        </div>
        {shown.length === 0 ? <p className="adm-empty">{filter === 'draft' ? 'Чернеток немає. Вони з\'являться після наступного викладання з новим записом журналу — або натисни «Нова новина».' : 'Тут порожньо.'}</p> : (
          <ul className="adm-list">
            {shown.map(d => (
              <li key={d.id} className={'adm-row' + (d.id === open ? ' news-open' : '')}>
                {filter === 'draft' && <input type="checkbox" aria-label={'Вибрати для об\'єднання: ' + d.title} checked={pick.has(d.id)} onChange={() => toggle(d.id)} />}
                <div className="adm-row-main">
                  <b>{d.title}</b>
                  <span className="muted">{source(d.source_ref)} · {when(d.created_at)}{d.sent_at ? ' · надіслано ' + when(d.sent_at) : ''} · пунктів: {d.added.length + d.changed.length + d.removed.length}</span>
                </div>
                <button type="button" className="btn ghost sm" onClick={() => openDraft(d)}>{d.id === open ? 'Відкрито' : 'Відкрити'}</button>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      {cur && form && preview && (
        <AdminSection title={cur.status === 'sent' ? 'Надіслана новина' : 'Чернетка'} hint={`Джерело: ${source(cur.source_ref)}. Кожен пункт — окремий рядок, до ${ITEM_MAX} символів.`}>
          <div className="news-edit">
            <div className="form">
              {f('title', 'Заголовок')}
              {f('added', 'Додано', 4)}
              {f('changed', 'Змінено', 4, 'Сюди ж — виправлене.')}
              {f('removed', 'Прибрано', 2)}
              {f('image_url', 'Картинка', 0, 'Необов\'язково. Велика картинка під текстом — своя адреса або обкладинка Q-Hub кнопкою нижче.')}
              {cur.status !== 'sent' && (
                <div className="row">
                  <button type="button" className="btn ghost sm" disabled={busy !== ''} onClick={makeCover}>{busy === 'cover' ? 'Малюю…' : form.image_url ? 'Зробити нову обкладинку' : 'Зробити обкладинку'}</button>
                  {form.image_url && <button type="button" className="btn ghost sm" disabled={busy !== ''} onClick={() => setForm({ ...form, image_url: '' })}>Прибрати картинку</button>}
                </div>
              )}
              {f('link', 'Посилання', 0, 'Необов\'язково. Заголовок у Discord стане посиланням.')}
              <small className={over ? 'err' : 'muted'}>Символів у тексті: {newsDescription(preview).length} з {NEWS_MAX}{over ? ` — задовге на ${over}, скороти пункти` : ''}</small>
              {cur.status === 'sent' ? <p className="muted">Надіслано {when(cur.sent_at)}. Зміни тут уже не потраплять у Discord.</p> : (
                <div className="row">
                  <button type="button" className="btn ghost" disabled={busy !== '' || !dirty} onClick={save}>Зберегти</button>
                  {cur.status === 'draft' && !confirm && <button type="button" className="btn acc" disabled={busy !== '' || !!over || !ready}
                    title={!ready ? 'Увімкни новини й вкажи канал у вкладці «Discord-бот»' : undefined}
                    onClick={ask}>Надіслати в Discord</button>}
                  {cur.status === 'draft' && <button type="button" className="btn ghost" disabled={busy !== ''} onClick={() => setStatus('skipped')}>Не публікувати</button>}
                  {cur.status === 'skipped' && <button type="button" className="btn ghost" disabled={busy !== ''} onClick={() => setStatus('draft')}>Повернути в чернетки</button>}
                </div>
              )}
              {confirm && (
                <div className="news-confirm" role="alertdialog" aria-label="Підтвердження">
                  <p>Надіслати «{preview.title}» у {chName ? <b>#{chName}</b> : 'канал новин Discord'}? Її побачать усі на сервері й підписники каналу. Скасувати після надсилання не можна.</p>
                  <div className="row">
                    <button type="button" className="btn acc" disabled={busy !== ''} onClick={send}>Так, надіслати</button>
                    <button type="button" className="btn ghost" onClick={() => setConfirm(false)}>Скасувати</button>
                  </div>
                </div>
              )}
              {msg && <p className={/^(Збережено|Надіслано|Сховано|Повернуто|Цю новину|Обкладинку)/.test(msg) ? 'good' : 'err'} role="status">{msg}</p>}
            </div>
            <DiscordPreview body={newsMessage(preview)} />
          </div>
        </AdminSection>
      )}
    </>
  );
}
