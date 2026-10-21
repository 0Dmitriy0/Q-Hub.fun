import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { uploadCatalogImage } from '../lib/images';
import { money, parseMoney, when } from '../lib/format';
import { CYCLE_H, GOOD, cycleStart, nextCycle, priceRange, rangePos, series, type Pt } from '../lib/pricestats';
import { dur, kyHM } from '../lib/events';
import { PriceChart, RangeBar, Spark } from '../components/PriceChart';
import Leaderboard, { type Contributor } from '../components/Leaderboard';
import { groupUpdates, type Update } from '../lib/updates';

interface Buyer { id: string; name: string; updated_at: string | null; image_url: string }
interface Item { id: number; name: string; unit: string; image_url: string }
interface Row { buyer_id: string; item_id: number; min_price: number; max_price: number; price: number; price_at: string | null; items: Item | null }

interface Hist { buyer_id: string; item_id: number; price: number; at: string }

const DAY = 864e5;
/* історію тягнемо з запасом: остання ціна до 30-денного вікна стає початком лінії */
const HIST_DAYS = 90;
const ms = (ts: string | null) => (ts ? new Date(ts).getTime() : 0);

function Pic({ url, alt, size = 40 }: { url: string; alt: string; size?: number }) {
  return url
    ? <img className="pic" src={url} alt={alt} width={size} height={size} loading="lazy" />
    : <span className="pic none" style={{ width: size, height: size }} aria-hidden="true">{alt.slice(0, 1)}</span>;
}

/* зрозуміле пояснення замість технічної помилки сховища */
function imageError(x: unknown) {
  const m = x instanceof Error ? x.message : String((x as { message?: string })?.message ?? x);
  if (/row-level security|unauthorized|403|лише адмін/i.test(m)) return 'Завантажувати картинки може лише адмін. Увійди тим акаунтом Discord, який є адміном сайту.';
  if (/bucket not found/i.test(m)) return 'У базі немає сховища для картинок. Запусти q-hub-images.sql у Supabase → SQL Editor.';
  if (/too large|maximum allowed size/i.test(m)) return 'Картинка завелика. Обери файл до 1 МБ.';
  return 'Не вдалося завантажити картинку: ' + m;
}

/* кнопка-файл для адміна: вибрав картинку → стиснулась → у сховище → адреса в рядок каталогу */
function PicUpload({ label, path, onDone }: { label: string; path: string; onDone: (url: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className={'btn sm ghost' + (busy ? ' busy' : '')} title={label}>
      {busy ? 'Вантажу…' : 'Фото'}
      <input type="file" accept="image/*" className="vh" disabled={busy} onChange={async e => {
        const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
        setBusy(true);
        try { await onDone(await uploadCatalogImage(f, path)); } catch (x) { alert(imageError(x)); }
        setBusy(false);
      }} />
    </label>
  );
}

export default function Prices() {
  const { isStaff, role, session, signIn } = useAuth();
  const isAdmin = role === 'admin';
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [ups, setUps] = useState<Update[]>([]);
  const [top, setTop] = useState<Contributor[]>([]);
  const [saving, setSaving] = useState('');
  const [tick, setTick] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setTick(Date.now()), 30000); return () => clearInterval(id); }, []);
  const [tab, setTab] = useState('');
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [hist, setHist] = useState<Record<string, Pt[]>>({});
  const [histFor, setHistFor] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState('');
  const [lim, setLim] = useState({ min: '', max: '' });
  const now = useMemo(() => Date.now(), [hist]);

  async function load() {
    if (!supabase) return;
    const [b, r, u, c] = await Promise.all([
      supabase.from('buyers').select('id,name,updated_at,image_url').order('sort'),
      supabase.from('buyer_items').select('buyer_id,item_id,min_price,max_price,price,price_at,items(id,name,unit,image_url)'),
      supabase.from('price_updates').select('id,buyer_id,item_id,price,created_at,cycle,reporter_name').order('created_at', { ascending: false }).limit(500),
      supabase.from('contributors').select('*').order('total', { ascending: false }).limit(500)
    ]);
    if (b.error || r.error) { setErr('Не вдалося завантажити ціни. Онови сторінку.'); return; }
    setBuyers(b.data as Buyer[]); setRows(r.data as unknown as Row[]);
    /* хто оновлював і рейтинг — доповнення: без них ціни все одно показуються */
    setUps(u.error ? [] : (u.data as Update[])); setTop(c.error ? [] : (c.data as Contributor[]));
    if (b.data?.length) setTab(t => t || (b.data[0] as Buyer).id);
  }
  useEffect(() => { load(); }, []);

  async function loadHist(ids: string[]) {
    if (!supabase || !ids.length) return;
    setHistFor(s => new Set([...s, ...ids]));
    const { data, error } = await supabase.from('price_history').select('buyer_id,item_id,price,at')
      .in('buyer_id', ids).gte('at', new Date(Date.now() - HIST_DAYS * DAY).toISOString()).order('at').limit(5000);
    if (error) return; /* графік — доповнення: без історії сторінка цін працює як раніше */
    setHist(h => {
      const n = { ...h };
      for (const id of ids) for (const k of Object.keys(n)) if (k.startsWith(id + ':')) delete n[k];
      for (const r of data as Hist[]) (n[r.buyer_id + ':' + r.item_id] ||= []).push({ t: new Date(r.at).getTime(), p: Number(r.price) });
      return n;
    });
  }

  const cur = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter(r => r.items && (ql ? r.items.name.toLowerCase().includes(ql) : r.buyer_id === tab))
      .map(r => {
        /* автор поточної ціни — останнє внесення гравця, якщо воно і є цією ціною; інакше ціна з імпорту */
        const u = ups.find(x => x.buyer_id === r.buyer_id && x.item_id === r.item_id);
        const mine = u && Math.abs(ms(u.created_at) - ms(r.price_at)) < 2000;
        return { ...r, shown: r.price, at: r.price_at, by: mine ? u!.reporter_name || 'гравець' : r.price_at ? 'редактор' : '' };
      })
      .sort((a, b) => a.items!.name.localeCompare(b.items!.name, 'uk'));
  }, [rows, ups, tab, q]);
  const buyer = buyers.find(b => b.id === tab);
  useEffect(() => { loadHist([...new Set(cur.map(r => r.buyer_id))].filter(id => !histFor.has(id))); }, [cur]);
  const reload = (buyerId: string) => { load(); loadHist([buyerId]); };

  function toggle(key: string, r: Row) {
    setOpen(o => (o === key ? '' : key));
    setLim({ min: r.min_price ? String(r.min_price) : '', max: r.max_price ? String(r.max_price) : '' });
  }
  async function saveLimits(r: Row) {
    const min = parseMoney(lim.min), max = parseMoney(lim.max);
    if ((min || max) && !(min > 0 && max > min)) { alert('Мінімум має бути більшим за нуль, а максимум — більшим за мінімум. Щоб прибрати межі, зітри обидва числа.'); return; }
    const { error } = await supabase!.from('buyer_items').update({ min_price: min, max_price: max }).eq('buyer_id', r.buyer_id).eq('item_id', r.item_id);
    if (error) { alert('Не вдалося зберегти межі.'); return; }
    load();
  }

  /* і гравці, і редактори вносять ціну однаково — так кожне оновлення має автора і йде в рейтинг.
     Межі й «раз за цикл» перевіряє база; її пояснення показуємо як є */
  const [msg, setMsg] = useState<Record<string, string>>({});
  async function savePrice(r: Row) {
    const key = r.buyer_id + ':' + r.item_id, v = parseMoney(edit[key] ?? '');
    if (!(v > 0)) { setMsg(m => ({ ...m, [key]: 'Впиши ціну числом, наприклад 450 або 1,5к.' })); return; }
    setSaving(key);
    const { error } = await supabase!.from('price_reports').insert({ kind: 'buyer', buyer_id: r.buyer_id, item_id: r.item_id, price: v });
    setSaving('');
    if (error) { setMsg(m => ({ ...m, [key]: error.message.startsWith('Ціна') || error.message.startsWith('Забагато') || error.message.startsWith('У цього') ? error.message : 'Не вдалося зберегти ціну. Спробуй ще раз.' })); return; }
    setEdit(e => { const n = { ...e }; delete n[key]; return n; });
    setMsg(m => { const n = { ...m }; delete n[key]; return n; });
    reload(r.buyer_id);
  }
  const cs = cycleStart(tick), nc = nextCycle(tick);
  const fresh = cur.filter(r => ms(r.at) >= cs).length;
  const [allUps, setAllUps] = useState(false);
  const groups = useMemo(() => groupUpdates(ups), [ups]);
  const recent = groups.slice(0, allUps ? 30 : 8);
  const buyerSize = (id: string) => rows.filter(r => r.buyer_id === id).length;
  const buyerName = (id: string) => buyers.find(b => b.id === id)?.name || '';
  const itemName = (id: number) => rows.find(r => r.item_id === id)?.items?.name || '—';

  return (
    <>
      <div><h1>Ціни скупників</h1><p className="muted">Скупники міняють ціни кожні {CYCLE_H} години. Побачив нову ціну в грі — онови її тут: вона одразу стане поточною, а ти отримаєш бал у рейтингу. Смужка показує, де ціна зараз між мінімумом і максимумом скупника: від {GOOD}% — вигідно здавати. Натисни на товар, щоб побачити графік за 30 днів.</p></div>
      {!supabase && <div className="card empty">База ще не підключена.</div>}
      {err && <div className="card err">{err}</div>}
      {supabase && !err && !buyers.length && <div className="card empty">Каталог скупників ще порожній. Адміну: запусти <span className="mono">supabase/seed/catalog_from_hub.sql</span> у Supabase → SQL Editor.</div>}
      {buyers.length > 0 && (
        <>
          <section className="card recent">
            <div className="row between rhead"><h2>Останні оновлення цін</h2><Leaderboard list={top} cycleH={CYCLE_H} /></div>
            {recent.length
              ? <ul className="ulist">{recent.map(g => {
                  /* один стиль для всіх записів: нік жирним на початку, під ним що саме оновлено */
                  const buyerLink = <a href={'#' + g.buyer_id} onClick={e => { e.preventDefault(); setQ(''); setTab(g.buyer_id); }}>{buyerName(g.buyer_id)}</a>;
                  const one = g.items.length === 1, all = !one && g.items.length >= buyerSize(g.buyer_id);
                  return <li key={g.key}>
                    <div className="ug-head"><b>{g.who || 'гравець'}</b>
                      <span className="muted">{one ? 'оновив ціну' : all ? 'оновив усі ціни' : `оновив ${g.items.length} цін`} · {buyerLink}</span>
                      <span className={'ug-at' + (ms(g.at) < cs ? ' muted' : '')}>{when(g.at)}</span></div>
                    <div className="ug-items">{one
                      ? <>{itemName(g.items[0].item_id)} — <b className="mono">{money(g.items[0].price)}</b></>
                      : g.items.map(u => itemName(u.item_id)).sort((a, b) => a.localeCompare(b, 'uk')).join(', ')}</div>
                  </li>;
                })}</ul>
              : <div className="empty">Гравці ще не оновлювали ціни. Будь першим — натисни «Оновити ціну» біля товару нижче.</div>}
            {groups.length > 8 && <button type="button" className="btn sm ghost" onClick={() => setAllUps(v => !v)}>{allUps ? 'Згорнути' : 'Показати більше'}</button>}
          </section>
          <div className="fld"><input type="search" placeholder="Пошук товару серед усіх скупників" value={q} onChange={e => setQ(e.target.value)} aria-label="Пошук товару" /></div>
          {!q && <div className="tabs" role="tablist">{buyers.map(b => (
            <a key={b.id} href={'#' + b.id} role="tab" aria-selected={b.id === tab} className={'tabpic' + (b.id === tab ? ' active' : '')} onClick={e => { e.preventDefault(); setTab(b.id); }}>
              <Pic url={b.image_url} alt={b.name} size={24} />{b.name}
            </a>))}</div>}
          {!session && <div className="card row between"><span>Увійди через Discord, щоб оновлювати ціни й потрапити в рейтинг.</span><button className="btn acc sm" onClick={signIn}>Увійти</button></div>}
          <section className="card">
            {!q && buyer && (
              <div className="row between">
                <div className="row"><Pic url={buyer.image_url} alt={buyer.name} size={48} /><div><h2>{buyer.name}</h2><span className="muted">{buyer.updated_at ? 'оновлено ' + when(buyer.updated_at) : 'ще не оновлювали'}</span></div></div>
                {isAdmin && <PicUpload label={'Картинка скупника ' + buyer.name} path={`buyers/${buyer.id}.webp`} onDone={async url => {
                  const { error } = await supabase!.from('buyers').update({ image_url: url }).eq('id', buyer.id); if (error) throw error; load();
                }} />}
              </div>
            )}
            {!q && buyer && (
              <div className="cycle" role="status">
                <div><small>Цей цикл цін</small><b className="mono">{kyHM(cs)}–{kyHM(nc)}</b></div>
                <div><small>Нова зміна цін</small><b className="mono">через {dur(nc - tick)}</b></div>
                <div><small>Оновлено в цьому циклі</small><b className="mono">{fresh} з {cur.length}</b></div>
              </div>
            )}
            {cur.length ? (
              <div className="plist">{cur.map(r => {
                const key = r.buyer_id + ':' + r.item_id, old = !!r.at && ms(r.at) < cs, isOpen = open === key, editing = edit[key] !== undefined;
                const raw = hist[key] || [], pts = series(raw, now), range = priceRange(raw, r.min_price, r.max_price, now), pos = rangePos(r.shown, range);
                return (
                  <div className={'prow' + (isOpen ? ' open' : '')} key={key}>
                    <Pic url={r.items!.image_url} alt={r.items!.name} />
                    <button type="button" className="pname" aria-expanded={isOpen} aria-controls={'pd-' + key} onClick={() => toggle(key, r)}><b>{r.items!.name}</b>
                      <small>{q ? (buyers.find(b => b.id === r.buyer_id)?.name || '') + ' · ' : ''}{r.at ? <span className={old ? 'warn' : ''}>{when(r.at)} · {r.by}{old ? ' · з минулого циклу' : ''}</span> : 'ціни ще немає'}</small>
                      <RangeBar pos={pos} range={range} /></button>
                    <Spark pts={pts} now={now} />
                    <div className="pval">
                      {editing
                        ? <form className="row upd" onSubmit={e => { e.preventDefault(); savePrice(r); }}>
                            <label className="fld"><input autoFocus aria-label={'Нова ціна ' + r.items!.name} inputMode="numeric" value={edit[key]} onChange={e => setEdit({ ...edit, [key]: e.target.value })} style={{ width: 110 }} /></label>
                            <button className="btn sm acc" disabled={saving === key}>{saving === key ? 'Зберігаю…' : 'Зберегти'}</button>
                            <button type="button" className="btn sm ghost" onClick={() => { setEdit(e => { const n = { ...e }; delete n[key]; return n; }); setMsg(m => { const n = { ...m }; delete n[key]; return n; }); }}>Скасувати</button>
                          </form>
                        : <b className="mono">{r.shown ? money(r.shown) : '—'}</b>}
                      {!editing && <small className="muted">за {r.items!.unit}</small>}
                      {!editing && session && <button type="button" className={'btn sm ' + (old || !r.at ? 'acc' : 'ghost')} onClick={() => setEdit({ ...edit, [key]: r.shown ? String(r.shown) : '' })}>Оновити ціну</button>}
                      {msg[key] && <small className="err" role="alert">{msg[key]}</small>}
                    </div>
                    {isAdmin && <PicUpload label={'Картинка товару ' + r.items!.name} path={`items/${r.item_id}.webp`} onDone={async url => {
                      const { error } = await supabase!.from('items').update({ image_url: url }).eq('id', r.item_id); if (error) throw error; load();
                    }} />}
                    {isOpen && (
                      <div className="pdetail" id={'pd-' + key}>
                        <div className="stats">
                          <div><small>Зараз</small><b className="mono">{r.shown ? money(r.shown) : '—'}</b></div>
                          <div><small>Мінімум</small><b className="mono">{range ? money(range.min) : '—'}</b></div>
                          <div><small>Максимум</small><b className="mono">{range ? money(range.max) : '—'}</b></div>
                          <div><small>Положення</small><b className="mono">{pos === null ? '—' : pos + '%'}</b></div>
                        </div>
                        <p className="muted note">{range?.from === 'editor' ? 'Межі мінімум і максимум вписав редактор з гри.' : range ? 'Межі — найнижча і найвища ціна, що траплялися за 30 днів. Коли редактор впише межі з гри, вони будуть точнішими.' : 'Меж поки немає: потрібно щонайменше дві різні ціни за 30 днів або межі від редактора.'}</p>
                        <PriceChart pts={pts} range={range} now={now} name={r.items!.name} />
                        {isStaff && (
                          <form className="row lims" onSubmit={e => { e.preventDefault(); saveLimits(r); }}>
                            <label className="fld"><span>Мінімум скупника</span><input inputMode="numeric" value={lim.min} onChange={e => setLim({ ...lim, min: e.target.value })} style={{ width: 120 }} /></label>
                            <label className="fld"><span>Максимум скупника</span><input inputMode="numeric" value={lim.max} onChange={e => setLim({ ...lim, max: e.target.value })} style={{ width: 120 }} /></label>
                            <button className="btn sm acc">Зберегти межі</button>
                          </form>
                        )}
                      </div>
                    )}
                  </div>);
              })}</div>
            ) : <div className="empty">{q ? 'Нічого не знайдено.' : 'У цього скупника ще немає товарів.'}</div>}
          </section>
        </>
      )}
    </>
  );
}
